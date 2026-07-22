import { createSignal, createResource, onCleanup, For, Show, type Component } from 'solid-js';
import {
  ArrowLeft, Lock, Eye, EyeOff, Copy, Check, AlertCircle, Link2, Pencil, Trash2,
  FolderKanban, Globe, Loader2, Clock, Terminal,
} from 'lucide-solid';
import {
  api,
  type SecretMeta,
  type SecretShareCreated,
  type SecretShareTtlMinutes,
} from '../../lib/api';

interface Props {
  secret: SecretMeta;
  projectName: string | null;   // null = global/team scope
  lastEventText: string | null; // e.g. "Revelado hace 3h" (precomputed by the parent)
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  // Reveal is audited; the parent can refresh the list's last_event.
  onRevealed?: () => void;
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

const cardClass = 'overflow-hidden rounded-[18px] border border-base-content/[0.06] bg-base-100/55';

/**
 * In-place detail view for a secret (list ⇄ detail, like billing's client
 * detail). Everything happens inline — reveal, share links, delete — so there
 * are no stacked modals. The plaintext lives only in local state and is wiped
 * on cleanup.
 */
const SecretDetailView: Component<Props> = (props) => {
  // ── Reveal (inline) ──
  const [value, setValue] = createSignal<string | null>(null);
  const [revealing, setRevealing] = createSignal(false);
  const [shown, setShown] = createSignal(false);
  const [copiedValue, setCopiedValue] = createSignal(false);
  const [revealError, setRevealError] = createSignal('');

  let alive = true;
  onCleanup(() => {
    alive = false;
    // Wipe plaintext + once-visible url from memory.
    setValue(null);
    setCreated(null);
  });

  const reveal = async () => {
    if (revealing() || value() !== null) return;
    setRevealing(true);
    setRevealError('');
    try {
      const res = await api.secrets.reveal(props.secret.id);
      if (alive) {
        setValue(res.value);
        // Revealing IS the intent to see it — show unmasked right away
        // (one click, not reveal + a second "Mostrar").
        setShown(true);
        props.onRevealed?.();
      }
    } catch (e: any) {
      if (alive) setRevealError(e?.message ?? 'No se pudo revelar el secreto');
    } finally {
      if (alive) setRevealing(false);
    }
  };

  const copyValue = async () => {
    const v = value();
    if (!v) return;
    try {
      await writeToClipboard(v);
      setCopiedValue(true);
      setTimeout(() => alive && setCopiedValue(false), 2000);
    } catch (e: any) {
      setRevealError(
        e?.message === 'clipboard-unavailable'
          ? 'Tu navegador no permite copiar. Usa HTTPS o copia manualmente.'
          : 'No se pudo copiar el valor',
      );
    }
  };

  const valueLines = (): string[] => (value() ?? '').split('\n');

  // Per-line copy. The line-list viewer replaces the old select-all-on-click
  // textarea, so grabbing a single line no longer fights the selection.
  const [copiedLine, setCopiedLine] = createSignal<number | null>(null);
  const copyLine = async (line: string, index: number) => {
    try {
      await writeToClipboard(line);
      setCopiedLine(index);
      setTimeout(() => alive && setCopiedLine(null), 2000);
    } catch {
      setRevealError('No se pudo copiar la línea');
    }
  };

  // ── Share links (inline, ephemeral 5-minute TTL) ──
  const [links, { mutate: mutateLinks, refetch: refetchLinks }] = createResource(
    () => props.secret.id,
    (id) => api.secrets.shares.list(id),
  );

  // 1s ticker driving the countdowns; links vanish from the UI as they expire
  // (the server enforces the TTL regardless).
  const [now, setNow] = createSignal(Date.now());
  const ticker = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(ticker));

  const remainingMs = (expiresAt: string): number => new Date(expiresAt).getTime() - now();
  const fmtRemaining = (expiresAt: string): string => {
    const s = Math.max(0, Math.round(remainingMs(expiresAt) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  // Remaining fraction of the created link's TTL, as a CSS width.
  const remainingPct = (createdAt: string, expiresAt: string): string => {
    const total = new Date(expiresAt).getTime() - new Date(createdAt).getTime();
    if (total <= 0) return '0%';
    const frac = Math.max(0, Math.min(1, remainingMs(expiresAt) / total));
    return `${(frac * 100).toFixed(1)}%`;
  };
  const liveLinks = () => (links() ?? []).filter((l) => !l.revoked_at && remainingMs(l.expires_at) > 0);

  const [ttlMinutes, setTtlMinutes] = createSignal<SecretShareTtlMinutes>(5);
  const [generating, setGenerating] = createSignal(false);
  const [createError, setCreateError] = createSignal('');
  // The just-created link, holding the once-visible url. Wiped on cleanup.
  const [created, setCreated] = createSignal<SecretShareCreated | null>(null);
  const [copiedUrl, setCopiedUrl] = createSignal(false);
  const [revokingId, setRevokingId] = createSignal<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = createSignal<string | null>(null);
  const [revokeError, setRevokeError] = createSignal('');

  // true = auto-copy landed in the clipboard; false = the browser refused
  // (e.g. Safari outside the user-gesture window) and the user must copy by hand.
  const [autoCopied, setAutoCopied] = createSignal<boolean | null>(null);

  const generate = async () => {
    if (generating()) return;
    setGenerating(true);
    setCreateError('');
    try {
      const res = await api.secrets.shares.create(props.secret.id, ttlMinutes());
      if (!alive) return;
      setCreated(res);
      setCopiedUrl(false);
      setAutoCopied(null);
      void refetchLinks();
      // Copy immediately: creating the link IS the intent to share it.
      try {
        await writeToClipboard(res.url);
        if (alive) setAutoCopied(true);
      } catch {
        if (alive) setAutoCopied(false);
      }
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
      setCopiedUrl(true);
      setTimeout(() => alive && setCopiedUrl(false), 2000);
    } catch (e: any) {
      setCreateError(
        e?.message === 'clipboard-unavailable'
          ? 'Tu navegador no permite copiar. Usa HTTPS o copia manualmente.'
          : 'No se pudo copiar el enlace',
      );
    }
  };

  // `?format=raw` returns the bare value as text/plain — agents and scripts
  // can pipe it straight into a file without parsing JSON.
  const [copiedCurl, setCopiedCurl] = createSignal(false);
  const copyCurl = async () => {
    const url = created()?.url;
    if (!url) return;
    try {
      await writeToClipboard(`curl -s '${url}?format=raw'`);
      setCopiedCurl(true);
      setTimeout(() => alive && setCopiedCurl(false), 2000);
    } catch {
      setCreateError('No se pudo copiar el comando');
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
    <div class="space-y-3 stagger-in">
      {/* ── Identity ── */}
      <div class={cardClass}>
        <div class="flex items-center gap-3 px-4 py-3.5">
          <button
            type="button"
            onClick={props.onBack}
            aria-label="Volver a secretos"
            class="-ml-1 shrink-0 rounded-lg p-1.5 text-base-content/45 transition-colors hover:bg-base-content/5 hover:text-base-content/80"
          >
            <ArrowLeft size={18} />
          </button>
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ios-blue-500/10 text-ios-blue-500">
            <Lock size={18} />
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-[15px] font-semibold leading-tight">{props.secret.name}</h2>
            <p class="mt-0.5 truncate font-mono text-[11px] text-base-content/45">{props.secret.key}</p>
          </div>
          <button
            type="button"
            onClick={props.onEdit}
            class="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-base-content/[0.08] px-2.5 py-1.5 text-xs font-semibold text-base-content/70 transition-colors hover:bg-base-content/[0.04]"
          >
            <Pencil size={13} /> Editar
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 px-4 pb-3.5">
          <span class="inline-flex items-center gap-1 rounded-md bg-base-content/[0.05] px-1.5 py-0.5 text-[10.5px] font-medium text-base-content/55">
            <Show when={props.projectName} fallback={<><Globe size={10} /> Global/Equipo</>}>
              <FolderKanban size={10} /> {props.projectName}
            </Show>
          </span>
          <For each={props.secret.environments}>
            {(env) => (
              <span class="rounded-md bg-ios-blue-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-ios-blue-500">{env}</span>
            )}
          </For>
          <For each={props.secret.tags}>
            {(t) => (
              <span class="rounded-md bg-base-content/[0.05] px-1.5 py-0.5 text-[10.5px] font-medium text-base-content/45">{t}</span>
            )}
          </For>
          <Show when={props.lastEventText}>
            <span class="text-[10.5px] text-base-content/35">· {props.lastEventText}</span>
          </Show>
        </div>
      </div>

      {/* ── Value (primary zone) ── */}
      <section class={`${cardClass} space-y-2 px-4 py-3.5`}>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/40">Valor</span>
          <Show when={value() !== null}>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShown((v) => !v)}
                class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-base-content/50 transition-colors hover:bg-base-content/5 hover:text-base-content/80"
              >
                <Show when={shown()} fallback={<Eye size={13} />}>
                  <EyeOff size={13} />
                </Show>
                {shown() ? 'Ocultar' : 'Mostrar'}
              </button>
              <button
                type="button"
                onClick={copyValue}
                class={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                  copiedValue()
                    ? 'bg-ios-green-500/15 text-ios-green-500'
                    : 'text-ios-blue-500 hover:bg-ios-blue-500/10'
                }`}
              >
                <Show when={copiedValue()} fallback={<Copy size={13} />}>
                  <Check size={13} />
                </Show>
                Copiar
              </button>
            </div>
          </Show>
        </div>

        <Show when={revealError()}>
          <div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-red-500">
            <AlertCircle size={15} class="mt-0.5 shrink-0" />
            <p class="text-xs">{revealError()}</p>
          </div>
        </Show>

        <Show
          when={value() !== null}
          fallback={
            <button
              type="button"
              onClick={reveal}
              disabled={revealing()}
              class="flex w-full items-center justify-between gap-3 rounded-xl border border-base-content/[0.08] bg-base-content/[0.04] px-3.5 py-3 text-left transition-colors hover:border-ios-blue-500/30 hover:bg-ios-blue-500/[0.05] disabled:opacity-60"
            >
              <span class="select-none font-mono text-xs tracking-[0.2em] text-base-content/30">••••••••••••••••</span>
              <span class="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ios-blue-500">
                <Show when={revealing()} fallback={<Eye size={14} />}>
                  <Loader2 size={14} class="animate-spin" />
                </Show>
                {revealing() ? 'Revelando…' : 'Revelar'}
              </span>
            </button>
          }
        >
          <div class="max-h-[40vh] overflow-y-auto rounded-xl border border-base-content/[0.08] bg-base-content/[0.04] py-2 font-mono text-xs leading-relaxed">
            <For each={valueLines()}>
              {(line, i) => (
                <div class="group flex items-center gap-1.5 px-2 hover:bg-base-content/[0.035]">
                  <span class="w-6 shrink-0 select-none text-right text-[10px] tabular-nums text-base-content/25">
                    {i() + 1}
                  </span>
                  <span class="min-w-0 flex-1 whitespace-pre-wrap break-all py-0.5 text-base-content/90">
                    {line === '' ? ' ' : shown() ? line : '•'.repeat(line.length)}
                  </span>
                  <Show when={line !== ''}>
                    <button
                      type="button"
                      onClick={() => void copyLine(line, i())}
                      aria-label={`Copiar línea ${i() + 1}`}
                      class={`shrink-0 rounded-md p-1 transition-all ${
                        copiedLine() === i()
                          ? 'text-ios-green-500 opacity-100'
                          : 'text-base-content/35 opacity-0 hover:bg-base-content/10 hover:text-base-content/75 focus-visible:opacity-100 group-hover:opacity-100'
                      }`}
                    >
                      <Show when={copiedLine() === i()} fallback={<Copy size={12} />}>
                        <Check size={12} />
                      </Show>
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <p class="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
            <AlertCircle size={12} class="mt-0.5 shrink-0" />
            El valor se borra de la pantalla al salir. Esta revelación queda registrada en la auditoría.
          </p>
        </Show>
      </section>

      {/* ── Share links (inline) ── */}
      <section class={`${cardClass} space-y-3 px-4 py-3.5`}>
        <div class="flex items-center gap-1.5">
          <Link2 size={13} class="text-base-content/40" />
          <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/40">Compartir por enlace</span>
        </div>

        <Show
          when={!created()}
          fallback={
            <div
              class={`space-y-2.5 rounded-xl border p-3 transition-colors ${
                remainingMs(created()!.expires_at) > 0
                  ? 'border-ios-green-500/25 bg-ios-green-500/[0.07]'
                  : 'border-base-content/[0.08] bg-base-content/[0.03]'
              }`}
            >
              {/* Estado del auto-copiado + countdown */}
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
                  <Show
                    when={autoCopied() !== false}
                    fallback={
                      <>
                        <AlertCircle size={14} class="shrink-0 text-amber-500" />
                        <span class="text-amber-600 dark:text-amber-400">Enlace creado — cópialo manualmente</span>
                      </>
                    }
                  >
                    <Check size={14} class="shrink-0 text-ios-green-500" strokeWidth={2.6} />
                    <span class="text-ios-green-500">Enlace copiado al portapapeles</span>
                  </Show>
                </span>
                <span class={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums ${
                  remainingMs(created()!.expires_at) > 0
                    ? 'bg-ios-blue-500/10 text-ios-blue-500'
                    : 'bg-base-content/[0.07] text-base-content/45'
                }`}>
                  <Clock size={12} />
                  {remainingMs(created()!.expires_at) > 0 ? fmtRemaining(created()!.expires_at) : 'Expirado'}
                </span>
              </div>

              {/* Vida restante del enlace */}
              <div class="h-1 overflow-hidden rounded-full bg-base-content/[0.07]" aria-hidden="true">
                <div
                  class="h-full rounded-full bg-ios-blue-500/55 transition-[width] duration-1000 ease-linear"
                  style={{ width: remainingPct(created()!.created_at, created()!.expires_at) }}
                />
              </div>

              {/* URL — clic selecciona todo, botón re-copia */}
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
                  title="Copiar enlace"
                  class={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition-all ${
                    copiedUrl()
                      ? 'bg-ios-green-500/15 text-ios-green-500'
                      : 'text-base-content/40 hover:bg-base-content/5 hover:text-base-content/80'
                  }`}
                >
                  <Show when={copiedUrl()} fallback={<Copy size={15} />}>
                    <Check size={15} />
                  </Show>
                </button>
              </div>

              {/* Acciones */}
              <div class="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={copyCurl}
                  title="Copia un comando curl que devuelve solo el valor (text/plain)"
                  class={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                    copiedCurl()
                      ? 'bg-ios-green-500/15 text-ios-green-500'
                      : 'bg-base-content/[0.05] text-base-content/60 hover:bg-base-content/[0.08] hover:text-base-content/85'
                  }`}
                >
                  <Show when={copiedCurl()} fallback={<Terminal size={13} />}>
                    <Check size={13} />
                  </Show>
                  Copiar curl
                </button>
                <button
                  type="button"
                  onClick={() => setCreated(null)}
                  class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-ios-blue-500 transition-colors hover:bg-ios-blue-500/10"
                >
                  <Link2 size={13} />
                  Crear otro enlace
                </button>
              </div>

              <p class="text-[11px] leading-relaxed text-base-content/40">
                No se vuelve a mostrar al salir. Quien tenga la URL puede leer el valor hasta que expire; puedes revocarla en la lista de abajo.
              </p>
            </div>
          }
        >
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={generate}
                disabled={generating()}
                class="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-ios-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-ios-blue-600 disabled:opacity-40"
              >
                <Show when={generating()} fallback={<Link2 size={15} />}>
                  <Loader2 size={15} class="animate-spin" />
                </Show>
                Generar enlace
              </button>
              <div class="flex rounded-lg bg-base-content/[0.05] p-0.5" role="radiogroup" aria-label="Duración del enlace">
                <For each={[5, 15, 60] as SecretShareTtlMinutes[]}>
                  {(mins) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={ttlMinutes() === mins}
                      onClick={() => setTtlMinutes(mins)}
                      class={`rounded-md px-2 py-1.5 text-[11px] font-semibold tabular-nums transition-colors ${
                        ttlMinutes() === mins
                          ? 'bg-base-100 text-base-content shadow-sm'
                          : 'text-base-content/45 hover:text-base-content/75'
                      }`}
                    >
                      {mins} min
                    </button>
                  )}
                </For>
              </div>
            </div>
            <p class="flex-1 text-[11px] leading-relaxed text-base-content/40">
              Enlace público efímero: quien lo tenga puede leer el valor durante {ttlMinutes()} minutos. Cada lectura queda auditada.
            </p>
          </div>

          <Show when={createError()}>
            <div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-red-500">
              <AlertCircle size={14} class="mt-0.5 shrink-0" />
              <p class="text-[11px]">{createError()}</p>
            </div>
          </Show>
        </Show>

        <Show when={revokeError()}>
          <div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-red-500">
            <AlertCircle size={14} class="mt-0.5 shrink-0" />
            <p class="text-[11px]">{revokeError()}</p>
          </div>
        </Show>

        <Show when={!links.loading} fallback={
          <div class="flex items-center gap-2 px-1 py-2 text-xs text-base-content/40">
            <Loader2 size={14} class="animate-spin" /> Cargando enlaces…
          </div>
        }>
          <Show when={liveLinks().length > 0}>
            <div class="divide-y divide-base-content/[0.06] overflow-hidden rounded-xl border border-base-content/[0.08]">
              <For each={liveLinks()}>
                {(link) => (
                  <div class="flex items-center gap-3 px-3.5 py-3">
                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ios-blue-500/10 text-ios-blue-500">
                      <Link2 size={14} />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="shrink-0 font-mono text-[12px] font-medium text-base-content/75">{link.prefix}…</span>
                        <span class="inline-flex shrink-0 items-center gap-1 rounded-md bg-ios-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ios-blue-500">
                          <Clock size={10} />
                          {fmtRemaining(link.expires_at)}
                        </span>
                      </div>
                      <p class="mt-0.5 truncate text-[11px] text-base-content/40">
                        Creado {formatRelative(link.created_at)} · Último uso {formatRelative(link.last_used_at)}
                      </p>
                    </div>
                    <Show
                      when={confirmRevoke() === link.id}
                      fallback={
                        <button
                          type="button"
                          onClick={() => { setRevokeError(''); setConfirmRevoke(link.id); }}
                          title="Revocar enlace"
                          aria-label={`Revocar enlace ${link.prefix}`}
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
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </section>

      {/* ── Destructive, set apart ── */}
      <section class="overflow-hidden rounded-[18px] border border-red-500/15 bg-red-500/[0.02]">
        <button
          type="button"
          onClick={props.onDelete}
          class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-red-500/[0.06]"
        >
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
            <Trash2 size={15} />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-red-500">Eliminar secreto</p>
            <p class="mt-0.5 truncate text-[11px] text-base-content/40">Deja de estar disponible; la auditoría se conserva</p>
          </div>
        </button>
      </section>
    </div>
  );
};

export default SecretDetailView;
