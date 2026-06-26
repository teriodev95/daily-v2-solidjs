import {
  createSignal,
  createResource,
  onCleanup,
  onMount,
  For,
  Show,
  type Component,
} from 'solid-js';
import {
  X,
  Link2,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  KeyRound,
  Trash2,
} from 'lucide-solid';
import { api, type SecretShareLink, type SecretShareCreated } from '../../lib/api';

interface Props {
  // Only id + a human label are needed; accepts the full SecretMeta too.
  secret: { id: string; name: string; key?: string };
  onClose: () => void;
}

const writeToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  if (!ok) throw new Error('clipboard-unavailable');
};

const formatRelative = (dateStr: string | null): string => {
  if (!dateStr) return 'nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `hace ${weeks}sem`;
  return new Date(dateStr).toLocaleDateString('es', { day: 'numeric', month: 'short' });
};

const isTokenActive = (t: { revoked_at: string | null; expires_at: string | null }): boolean => {
  if (t.revoked_at) return false;
  if (t.expires_at && new Date(t.expires_at).getTime() <= Date.now()) return false;
  return true;
};

/**
 * Compact modal to bind a secret to a PAT and produce a share URL that an
 * agent resolves with that token. The raw url/token is shown exactly once;
 * existing links only ever expose the token's prefix.
 */
const SecretShareModal: Component<Props> = (props) => {
  // Active PATs the link can be bound to.
  const [tokens] = createResource(() => api.tokens.list());
  const activeTokens = () => (tokens() ?? []).filter(isTokenActive);

  const [links, { mutate: mutateLinks, refetch: refetchLinks }] = createResource(
    () => props.secret.id,
    (id) => api.secrets.shares.list(id),
  );

  const [selectedToken, setSelectedToken] = createSignal('');
  const [generating, setGenerating] = createSignal(false);
  const [createError, setCreateError] = createSignal('');
  // The just-created link, holding the once-visible url. Cleared on close.
  const [created, setCreated] = createSignal<SecretShareCreated | null>(null);
  const [copied, setCopied] = createSignal(false);

  const [revokingId, setRevokingId] = createSignal<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = createSignal<string | null>(null);
  const [revokeError, setRevokeError] = createSignal('');

  let alive = true;

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => {
      alive = false;
      document.removeEventListener('keydown', onKey);
      // Wipe the once-visible url/token from memory.
      setCreated(null);
    });
  });

  const generate = async () => {
    const tokenId = selectedToken();
    if (!tokenId || generating()) return;
    setGenerating(true);
    setCreateError('');
    try {
      const res = await api.secrets.shares.create(props.secret.id, tokenId);
      if (!alive) return;
      setCreated(res);
      setCopied(false);
      void refetchLinks();
    } catch (e: any) {
      if (alive) setCreateError(e?.message ?? 'No se pudo generar el enlace');
    } finally {
      if (alive) setGenerating(false);
    }
  };

  const copyUrl = async () => {
    const url = created()?.url;
    if (!url) return;
    try {
      await writeToClipboard(url);
      setCopied(true);
      setTimeout(() => alive && setCopied(false), 2000);
    } catch (e: any) {
      setCreateError(
        e?.message === 'clipboard-unavailable'
          ? 'Tu navegador no permite copiar. Usa HTTPS o copia manualmente.'
          : 'No se pudo copiar el enlace',
      );
    }
  };

  const revoke = async (linkId: string) => {
    if (revokingId()) return;
    setRevokingId(linkId);
    setRevokeError('');
    try {
      await api.secrets.shares.revoke(props.secret.id, linkId);
      if (!alive) return;
      mutateLinks((prev) =>
        (prev ?? []).map((l) =>
          l.id === linkId ? { ...l, active: false, revoked_at: new Date().toISOString() } : l,
        ),
      );
      setConfirmRevoke(null);
    } catch (e: any) {
      if (alive) setRevokeError(e?.message ?? 'No se pudo revocar el enlace');
    } finally {
      if (alive) setRevokingId(null);
    }
  };

  return (
    <div
      class="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-share-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[24px] bg-base-100 shadow-2xl sm:max-w-lg sm:rounded-[24px]">
        {/* Header */}
        <div class="flex items-start justify-between gap-3 border-b border-base-content/[0.06] px-5 py-4">
          <div class="flex min-w-0 items-start gap-3">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ios-blue-500/10 text-ios-blue-500">
              <Link2 size={17} />
            </div>
            <div class="min-w-0">
              <h2 id="secret-share-title" class="truncate text-[15px] font-semibold">
                Compartir {props.secret.name}
              </h2>
              <Show when={props.secret.key}>
                <p class="mt-0.5 truncate font-mono text-[11px] text-base-content/40">{props.secret.key}</p>
              </Show>
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Cerrar"
            class="-mr-1 shrink-0 rounded-lg p-1.5 text-base-content/40 transition-colors hover:bg-base-content/5"
          >
            <X size={18} />
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* ─── Create link ─── */}
          <section class="space-y-2.5">
            <h3 class="text-[13px] font-semibold text-base-content/80">Crear enlace</h3>

            <Show
              when={!created()}
              fallback={
                <div class="space-y-2.5 rounded-xl border border-ios-green-500/25 bg-ios-green-500/[0.07] p-3">
                  <div class="relative">
                    <input
                      type="text"
                      readonly
                      value={created()?.url ?? ''}
                      onClick={(e) => e.currentTarget.select()}
                      class="w-full rounded-xl border border-base-content/[0.08] bg-base-100 px-3.5 py-3 pr-12 font-mono text-xs text-base-content/90 focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30"
                    />
                    <button
                      type="button"
                      onClick={copyUrl}
                      aria-label="Copiar enlace"
                      class={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition-all ${
                        copied()
                          ? 'bg-ios-green-500/15 text-ios-green-500'
                          : 'text-base-content/40 hover:bg-base-content/5 hover:text-base-content/80'
                      }`}
                    >
                      <Show when={copied()} fallback={<Copy size={15} />}>
                        <Check size={15} />
                      </Show>
                    </button>
                  </div>
                  <div class="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                    <AlertCircle size={14} class="mt-0.5 shrink-0" />
                    <p class="text-[11px] leading-relaxed">
                      Cópiala ahora; no se vuelve a mostrar. El agente la usa con su token; el enlace
                      se revoca junto con el token.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setCreated(null); setSelectedToken(''); }}
                    class="text-[12px] font-semibold text-ios-blue-500 transition-opacity hover:opacity-80"
                  >
                    Crear otro enlace
                  </button>
                </div>
              }
            >
              <Show
                when={!tokens.loading}
                fallback={
                  <div class="flex items-center gap-2 px-1 py-3 text-xs text-base-content/40">
                    <Loader2 size={14} class="animate-spin" /> Cargando tokens…
                  </div>
                }
              >
                <Show
                  when={activeTokens().length > 0}
                  fallback={
                    <div class="flex items-start gap-2 rounded-xl border border-base-content/[0.08] bg-base-content/[0.03] px-3 py-2.5 text-base-content/55">
                      <AlertCircle size={14} class="mt-0.5 shrink-0" />
                      <p class="text-[11px] leading-relaxed">
                        No tienes tokens activos. Crea un token de acceso personal para poder
                        compartir este secreto.
                      </p>
                    </div>
                  }
                >
                  <p class="text-[11px] leading-relaxed text-base-content/45">
                    Elige el token que el agente usará para resolver el enlace. El acceso queda atado
                    a ese token.
                  </p>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <div class="relative flex-1">
                      <KeyRound
                        size={15}
                        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/35"
                      />
                      <select
                        value={selectedToken()}
                        onChange={(e) => setSelectedToken(e.currentTarget.value)}
                        class="w-full appearance-none rounded-xl border border-base-content/[0.08] bg-base-content/[0.04] py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30"
                      >
                        <option value="" disabled>
                          Selecciona un token…
                        </option>
                        <For each={activeTokens()}>
                          {(t) => (
                            <option value={t.id}>
                              {t.name} · {t.prefix}
                            </option>
                          )}
                        </For>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={generate}
                      disabled={!selectedToken() || generating()}
                      class="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-ios-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-ios-blue-600 disabled:opacity-40"
                    >
                      <Show when={generating()} fallback={<Link2 size={15} />}>
                        <Loader2 size={15} class="animate-spin" />
                      </Show>
                      Generar enlace
                    </button>
                  </div>
                </Show>
              </Show>

              <Show when={createError()}>
                <div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-red-500">
                  <AlertCircle size={14} class="mt-0.5 shrink-0" />
                  <p class="text-[11px]">{createError()}</p>
                </div>
              </Show>
            </Show>
          </section>

          {/* ─── Existing links ─── */}
          <section class="space-y-2.5">
            <h3 class="text-[13px] font-semibold text-base-content/80">Enlaces existentes</h3>

            <Show when={revokeError()}>
              <div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-red-500">
                <AlertCircle size={14} class="mt-0.5 shrink-0" />
                <p class="text-[11px]">{revokeError()}</p>
              </div>
            </Show>

            <Show
              when={!links.loading}
              fallback={
                <div class="flex items-center gap-2 px-1 py-3 text-xs text-base-content/40">
                  <Loader2 size={14} class="animate-spin" /> Cargando enlaces…
                </div>
              }
            >
              <Show when={links.error}>
                <div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-red-500">
                  <AlertCircle size={14} class="mt-0.5 shrink-0" />
                  <p class="text-[11px]">No se pudieron cargar los enlaces.</p>
                </div>
              </Show>

              <Show
                when={(links() ?? []).length > 0}
                fallback={
                  <Show when={!links.error}>
                    <p class="px-1 py-2 text-[12px] text-base-content/40">
                      Aún no has compartido este secreto.
                    </p>
                  </Show>
                }
              >
                <div class="divide-y divide-base-content/[0.06] overflow-hidden rounded-xl border border-base-content/[0.08]">
                  <For each={links()}>
                    {(link) => (
                      <div class="flex items-center gap-3 px-3.5 py-3">
                        <div
                          class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            link.active
                              ? 'bg-ios-blue-500/10 text-ios-blue-500'
                              : 'bg-base-content/[0.06] text-base-content/30'
                          }`}
                        >
                          <KeyRound size={14} />
                        </div>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2">
                            <p class="truncate text-[13px] font-medium">{link.token_name}</p>
                            <span class="shrink-0 font-mono text-[10.5px] text-base-content/45">
                              {link.prefix}
                            </span>
                            <Show
                              when={link.active}
                              fallback={
                                <span class="shrink-0 rounded-md bg-base-content/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-base-content/45">
                                  Revocado
                                </span>
                              }
                            >
                              <span class="shrink-0 rounded-md bg-ios-green-500/12 px-1.5 py-0.5 text-[10px] font-medium text-ios-green-500">
                                Activo
                              </span>
                            </Show>
                          </div>
                          <p class="mt-0.5 truncate text-[11px] text-base-content/40">
                            Creado {formatRelative(link.created_at)} · Último uso{' '}
                            {formatRelative(link.last_used_at)}
                          </p>
                        </div>

                        <Show when={link.active}>
                          <Show
                            when={confirmRevoke() === link.id}
                            fallback={
                              <button
                                type="button"
                                onClick={() => { setRevokeError(''); setConfirmRevoke(link.id); }}
                                title="Revocar enlace"
                                aria-label={`Revocar enlace de ${link.token_name}`}
                                class="shrink-0 rounded-lg p-2 text-base-content/35 transition-colors hover:bg-red-500/10 hover:text-red-500"
                              >
                                <Trash2 size={15} />
                              </button>
                            }
                          >
                            <div class="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => revoke(link.id)}
                                disabled={revokingId() === link.id}
                                class="flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1.5 text-[12px] font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-50"
                              >
                                <Show when={revokingId() === link.id}>
                                  <Loader2 size={12} class="animate-spin" />
                                </Show>
                                Revocar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRevoke(null)}
                                disabled={revokingId() === link.id}
                                class="rounded-lg px-2 py-1.5 text-[12px] font-medium text-base-content/50 transition-colors hover:bg-base-content/5"
                              >
                                Cancelar
                              </button>
                            </div>
                          </Show>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </section>
        </div>

        <div class="flex justify-end border-t border-base-content/[0.06] px-5 py-3.5">
          <button
            type="button"
            onClick={props.onClose}
            class="rounded-xl bg-base-content px-4 py-2 text-sm font-semibold text-base-100 transition-opacity hover:opacity-90"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecretShareModal;
