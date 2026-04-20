import { createEffect, createSignal, createResource, onCleanup, For, Show, type Component } from 'solid-js';
import { Key, Settings, Plus, Copy, Check, Trash2, AlertCircle, X, Clock } from 'lucide-solid';
import TopNavigation from '../components/TopNavigation';
import CreateTokenModal from '../components/tokens/CreateTokenModal';
import TokenRevealDialog from '../components/tokens/TokenRevealDialog';
import { MODULES } from '../components/tokens/PermissionMatrix';
import { api, type Token, type CreatedToken, type TokenScope } from '../lib/api';

const moduleLabel = (key: string): string =>
  MODULES.find((m) => m.key === key)?.label ?? key;

const formatRelative = (dateStr: string | null): string => {
  if (!dateStr) return 'nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hace segundos';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `hace ${weeks} sem`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? '' : 'es'}`;
  return `hace ${Math.floor(days / 365)} año${Math.floor(days / 365) === 1 ? '' : 's'}`;
};

interface ScopeBadge {
  key: string;
  label: string;
  letters: 'R' | 'RW';
}

const visibleScopes = (scopes: Record<string, TokenScope>): ScopeBadge[] => {
  const list: ScopeBadge[] = [];
  for (const mod of MODULES) {
    const v = scopes[mod.key];
    if (v === 'read') list.push({ key: mod.key, label: mod.label, letters: 'R' });
    else if (v === 'write') list.push({ key: mod.key, label: mod.label, letters: 'RW' });
  }
  return list;
};

const TokensPage: Component = () => {
  const [tokens, { refetch, mutate }] = createResource(() => api.tokens.list());
  const [showCreate, setShowCreate] = createSignal(false);
  const [revealed, setRevealed] = createSignal<{ token: string; name: string } | null>(null);
  const [copiedId, setCopiedId] = createSignal<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = createSignal<Token | null>(null);
  const [toast, setToast] = createSignal<{ type: 'ok' | 'error'; message: string } | null>(null);
  const [revealingId, setRevealingId] = createSignal<string | null>(null);
  const [revoking, setRevoking] = createSignal(false);

  const showToast = (type: 'ok' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2600);
  };

  const activeTokens = () => (tokens() ?? []).filter((t) => !t.revoked_at);

  const writeToClipboard = async (text: string): Promise<void> => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Fallback for insecure contexts or old browsers
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

  const handleCopy = async (token: Token) => {
    if (revealingId()) return;
    setRevealingId(token.id);
    try {
      const res = await api.tokens.reveal(token.id);
      await writeToClipboard(res.token);
      setCopiedId(token.id);
      showToast('ok', 'Clave copiada');
      setTimeout(() => setCopiedId((id) => (id === token.id ? null : id)), 2000);
    } catch (e: any) {
      const msg = e?.message === 'clipboard-unavailable'
        ? 'Tu navegador no permite copiar. Usa HTTPS o copia manualmente.'
        : e?.message ?? 'No se pudo copiar la clave';
      showToast('error', msg);
    } finally {
      setRevealingId(null);
    }
  };

  const handleConfirmRevoke = async () => {
    const t = confirmRevoke();
    if (!t || revoking()) return;
    setRevoking(true);
    try {
      await api.tokens.revoke(t.id);
      // Optimistic: remove from list
      mutate((prev) => (prev ?? []).filter((x) => x.id !== t.id));
      setConfirmRevoke(null);
      showToast('ok', 'Token revocado');
      refetch();
    } catch (e: any) {
      showToast('error', e?.message ?? 'No se pudo revocar el token');
    } finally {
      setRevoking(false);
    }
  };

  const handleCreated = (created: CreatedToken) => {
    setShowCreate(false);
    setRevealed({ token: created.token, name: created.name });
    refetch();
  };

  const isExpired = (t: Token): boolean =>
    !!t.expires_at && new Date(t.expires_at).getTime() < Date.now();

  // Close confirm-revoke on Escape
  createEffect(() => {
    if (!confirmRevoke()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !revoking()) {
        e.preventDefault();
        setConfirmRevoke(null);
      }
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  return (
    <>
      <TopNavigation
        breadcrumbs={[
          { label: 'Ajustes', icon: <Settings size={14} /> },
          { label: 'API Tokens', icon: <Key size={14} /> },
        ]}
      />

      <div class="space-y-5">
        {/* Page header */}
        <div class="flex items-start justify-between gap-4">
          <div>
            <h1 class="text-lg font-bold">API Tokens</h1>
            <p class="text-xs text-base-content/50 mt-1 max-w-xl">
              Crea tokens para que agentes o integraciones externas accedan a tus
              datos con permisos específicos por módulo.
            </p>
          </div>
          <Show when={(activeTokens().length > 0)}>
            <button
              onClick={() => setShowCreate(true)}
              class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-ios-blue-500 text-white text-xs font-semibold hover:bg-ios-blue-600 transition-colors shrink-0"
            >
              <Plus size={14} />
              Nuevo Token
            </button>
          </Show>
        </div>

        {/* Content */}
        <Show when={!tokens.loading} fallback={<TokensSkeleton />}>
          <Show
            when={activeTokens().length > 0}
            fallback={<EmptyState onCreate={() => setShowCreate(true)} />}
          >
            <div class="bg-base-100 border border-base-content/[0.08] rounded-xl shadow-sm overflow-hidden">
              {/* Table header (desktop) */}
              <div class="hidden md:grid grid-cols-[1.6fr_1.4fr_0.8fr_auto] gap-3 px-5 py-2.5 bg-base-content/[0.03] border-b border-base-content/[0.06]">
                <span class="text-[10px] font-semibold uppercase text-base-content/40 tracking-wider">
                  Nombre
                </span>
                <span class="text-[10px] font-semibold uppercase text-base-content/40 tracking-wider">
                  Clave
                </span>
                <span class="text-[10px] font-semibold uppercase text-base-content/40 tracking-wider">
                  Último uso
                </span>
                <span class="text-[10px] font-semibold uppercase text-base-content/40 tracking-wider text-right">
                  Acciones
                </span>
              </div>

              <div class="divide-y divide-base-content/[0.05]">
                <For each={activeTokens()}>
                  {(token) => {
                    const badges = () => visibleScopes(token.scopes ?? {});
                    const shown = () => badges().slice(0, 3);
                    const extra = () => Math.max(0, badges().length - 3);
                    const isCopied = () => copiedId() === token.id;
                    const isRevealing = () => revealingId() === token.id;
                    const expired = () => isExpired(token);

                    return (
                      <div class={`md:grid md:grid-cols-[1.6fr_1.4fr_0.8fr_auto] md:gap-3 md:items-center px-5 py-3.5 hover:bg-base-content/[0.02] transition-colors ${expired() ? 'opacity-60' : ''}`}>
                        {/* Name + scopes */}
                        <div class="min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-semibold truncate">
                              {token.name}
                            </span>
                            <Show when={expired()}>
                              <span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                <Clock size={10} />
                                Expirado
                              </span>
                            </Show>
                          </div>
                          <Show when={badges().length > 0} fallback={
                            <span class="text-[10px] text-base-content/30 mt-1 inline-block">
                              Sin permisos asignados
                            </span>
                          }>
                            <div class="flex flex-wrap gap-1 mt-1.5">
                              <For each={shown()}>
                                {(b) => (
                                  <span
                                    class={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                                      b.letters === 'RW'
                                        ? 'bg-ios-blue-500/10 text-ios-blue-500'
                                        : 'bg-ios-green-500/10 text-ios-green-500'
                                    }`}
                                    title={`${b.label} ${b.letters === 'RW' ? 'lectura y escritura' : 'solo lectura'}`}
                                  >
                                    {b.label} {b.letters}
                                  </span>
                                )}
                              </For>
                              <Show when={extra() > 0}>
                                <span class="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-base-content/[0.06] text-base-content/50">
                                  +{extra()}
                                </span>
                              </Show>
                            </div>
                          </Show>
                        </div>

                        {/* Key */}
                        <div class="flex items-center gap-2 min-w-0 mt-2 md:mt-0">
                          <code class="font-mono text-[11px] px-2 py-1 rounded-md bg-base-content/[0.05] text-base-content/70 truncate">
                            {token.prefix}…
                          </code>
                          <button
                            onClick={() => handleCopy(token)}
                            disabled={isRevealing()}
                            class={`p-1.5 rounded-lg transition-all shrink-0 ${
                              isCopied()
                                ? 'bg-ios-green-500/15 text-ios-green-500'
                                : 'text-base-content/30 hover:text-base-content/70 hover:bg-base-content/5'
                            } disabled:opacity-40`}
                            title="Copiar clave completa"
                            aria-label={isCopied() ? 'Clave copiada' : 'Copiar clave completa'}
                          >
                            <Show when={isCopied()} fallback={<Copy size={13} />}>
                              <Check size={13} />
                            </Show>
                          </button>
                        </div>

                        {/* Last used */}
                        <div class="text-[11px] text-base-content/50 mt-2 md:mt-0">
                          <span class="md:hidden text-base-content/30 mr-1">Último uso:</span>
                          {formatRelative(token.last_used_at)}
                        </div>

                        {/* Actions */}
                        <div class="flex justify-end mt-2 md:mt-0">
                          <button
                            onClick={() => setConfirmRevoke(token)}
                            class="p-1.5 rounded-lg text-base-content/30 hover:text-red-500 hover:bg-red-500/10 transition-all"
                            title="Revocar token"
                            aria-label={`Revocar token ${token.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </div>

      {/* Modals */}
      <Show when={showCreate()}>
        <CreateTokenModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      </Show>

      <Show when={revealed()}>
        {(r) => (
          <TokenRevealDialog
            token={r().token}
            name={r().name}
            onClose={() => setRevealed(null)}
          />
        )}
      </Show>

      <Show when={confirmRevoke()}>
        {(tok) => (
          <div
            class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-title"
            onClick={(e) => {
              if (e.target === e.currentTarget && !revoking()) setConfirmRevoke(null);
            }}
          >
            <div class="bg-base-100 w-full sm:max-w-md sm:rounded-[24px] rounded-t-[24px] shadow-2xl">
              <div class="flex items-start justify-between px-5 py-4 border-b border-base-content/[0.06]">
                <div class="flex items-start gap-3">
                  <div class="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h2 id="revoke-title" class="text-base font-semibold">Revocar token</h2>
                    <p class="text-xs text-base-content/40 mt-0.5">{tok().name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmRevoke(null)}
                  aria-label="Cerrar"
                  class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div class="px-5 py-4">
                <p class="text-sm text-base-content/70 leading-relaxed">
                  Esta acción es inmediata e irreversible. Cualquier agente o
                  integración que use este token dejará de funcionar.
                </p>
              </div>
              <div class="px-5 py-3.5 border-t border-base-content/[0.06] flex justify-end gap-2">
                <button
                  onClick={() => setConfirmRevoke(null)}
                  class="px-4 py-2 rounded-xl text-sm font-medium text-base-content/60 hover:bg-base-content/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmRevoke}
                  disabled={revoking()}
                  class="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-40"
                >
                  {revoking() ? 'Revocando...' : 'Revocar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* Toast */}
      <Show when={toast()}>
        {(t) => (
          <div class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
            <div
              class={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-md text-sm font-medium ${
                t().type === 'ok'
                  ? 'bg-base-content/90 text-base-100'
                  : 'bg-red-500/90 text-white'
              }`}
            >
              <Show when={t().type === 'ok'} fallback={<AlertCircle size={14} />}>
                <Check size={14} />
              </Show>
              {t().message}
            </div>
          </div>
        )}
      </Show>
    </>
  );
};

const EmptyState: Component<{ onCreate: () => void }> = (props) => (
  <div class="bg-base-100 border border-dashed border-base-content/[0.1] rounded-2xl px-8 py-12 text-center">
    <div class="mx-auto w-12 h-12 rounded-2xl bg-ios-blue-500/10 flex items-center justify-center text-ios-blue-500 mb-3">
      <Key size={20} />
    </div>
    <h3 class="text-sm font-semibold">Aún no tienes tokens</h3>
    <p class="text-xs text-base-content/50 mt-1 max-w-sm mx-auto">
      Crea tu primer token para darle acceso controlado a un agente o
      integración externa.
    </p>
    <button
      onClick={props.onCreate}
      class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ios-blue-500 text-white text-xs font-semibold hover:bg-ios-blue-600 transition-colors"
    >
      <Plus size={14} />
      Crear primer token
    </button>
  </div>
);

const TokensSkeleton: Component = () => (
  <div class="bg-base-100 border border-base-content/[0.08] rounded-xl shadow-sm overflow-hidden">
    <div class="divide-y divide-base-content/[0.05]">
      <For each={[0, 1, 2]}>
        {() => (
          <div class="px-5 py-3.5 flex items-center gap-3">
            <div class="flex-1 space-y-2">
              <div class="h-3.5 w-40 rounded bg-base-content/[0.08] animate-pulse" />
              <div class="h-2.5 w-64 rounded bg-base-content/[0.05] animate-pulse" />
            </div>
            <div class="h-3 w-20 rounded bg-base-content/[0.05] animate-pulse" />
            <div class="h-6 w-6 rounded bg-base-content/[0.05] animate-pulse" />
          </div>
        )}
      </For>
    </div>
  </div>
);

export default TokensPage;
