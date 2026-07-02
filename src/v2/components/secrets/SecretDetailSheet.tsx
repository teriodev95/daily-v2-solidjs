import { createSignal, onCleanup, onMount, Show, For, type Component } from 'solid-js';
import {
  X, Lock, Eye, EyeOff, Copy, Check, AlertCircle, Link2, Pencil, Trash2,
  ChevronRight, FolderKanban, Globe, Loader2,
} from 'lucide-solid';
import { api, type SecretMeta } from '../../lib/api';

interface Props {
  secret: SecretMeta;
  projectName: string | null;   // null = global/team scope
  lastEventText: string | null; // e.g. "Revelado hace 3h" (precomputed by the parent)
  onClose: () => void;
  onEdit: () => void;
  onShare: () => void;
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

/**
 * Unified detail sheet for a secret: identity + context on top, the value
 * (revealed on demand, masked by default) as the primary zone, secondary
 * actions (share / edit) below, and the destructive action set apart at the
 * bottom. The plaintext lives only in local state and is wiped on cleanup.
 */
const SecretDetailSheet: Component<Props> = (props) => {
  const [value, setValue] = createSignal<string | null>(null);
  const [revealing, setRevealing] = createSignal(false);
  const [shown, setShown] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [error, setError] = createSignal('');

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
      // Wipe the plaintext from memory.
      setValue(null);
    });
  });

  const reveal = async () => {
    if (revealing() || value() !== null) return;
    setRevealing(true);
    setError('');
    try {
      const res = await api.secrets.reveal(props.secret.id);
      if (alive) {
        setValue(res.value);
        props.onRevealed?.();
      }
    } catch (e: any) {
      if (alive) setError(e?.message ?? 'No se pudo revelar el secreto');
    } finally {
      if (alive) setRevealing(false);
    }
  };

  const copy = async () => {
    const v = value();
    if (!v) return;
    try {
      await writeToClipboard(v);
      setCopied(true);
      setTimeout(() => alive && setCopied(false), 2000);
    } catch (e: any) {
      setError(
        e?.message === 'clipboard-unavailable'
          ? 'Tu navegador no permite copiar. Usa HTTPS o copia manualmente.'
          : 'No se pudo copiar el valor',
      );
    }
  };

  // Size the textarea to the content, within sane bounds (scrolls past that).
  const rows = (): number => {
    const lines = value()?.split('\n').length ?? 1;
    return Math.min(12, Math.max(3, lines));
  };

  // Secondary action row — consistent affordance: icon tile, label + hint, chevron.
  const ActionRow: Component<{
    icon: Component<{ size?: number }>;
    label: string;
    hint: string;
    danger?: boolean;
    onClick: () => void;
  }> = (p) => {
    const Icon = p.icon;
    return (
      <button
        type="button"
        onClick={p.onClick}
        class={`group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${
          p.danger ? 'hover:bg-red-500/[0.06]' : 'hover:bg-base-content/[0.03]'
        }`}
      >
        <div class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          p.danger ? 'bg-red-500/10 text-red-500' : 'bg-base-content/[0.05] text-base-content/60'
        }`}>
          <Icon size={15} />
        </div>
        <div class="min-w-0 flex-1">
          <p class={`text-sm font-medium ${p.danger ? 'text-red-500' : ''}`}>{p.label}</p>
          <p class="mt-0.5 truncate text-[11px] text-base-content/40">{p.hint}</p>
        </div>
        <ChevronRight size={15} class={`shrink-0 transition-transform group-hover:translate-x-0.5 ${
          p.danger ? 'text-red-500/40' : 'text-base-content/25'
        }`} />
      </button>
    );
  };

  return (
    <div
      class="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] bg-base-100 shadow-2xl sm:max-w-md sm:rounded-[24px]">
        {/* ── Identity ── */}
        <div class="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div class="flex min-w-0 items-start gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ios-blue-500/10 text-ios-blue-500">
              <Lock size={18} />
            </div>
            <div class="min-w-0">
              <h2 id="secret-detail-title" class="truncate text-[15px] font-semibold leading-tight">{props.secret.name}</h2>
              <p class="mt-0.5 truncate font-mono text-[11px] text-base-content/45">{props.secret.key}</p>
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

        {/* ── Context chips ── */}
        <div class="flex flex-wrap items-center gap-1.5 px-5 pb-3">
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
        </div>
        <Show when={props.lastEventText}>
          <p class="px-5 pb-3 text-[11px] text-base-content/35">{props.lastEventText}</p>
        </Show>

        {/* ── Value (primary zone) ── */}
        <div class="space-y-2 border-t border-base-content/[0.06] px-5 py-4">
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
                  onClick={copy}
                  class={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                    copied()
                      ? 'bg-ios-green-500/15 text-ios-green-500'
                      : 'text-ios-blue-500 hover:bg-ios-blue-500/10'
                  }`}
                >
                  <Show when={copied()} fallback={<Copy size={13} />}>
                    <Check size={13} />
                  </Show>
                  Copiar
                </button>
              </div>
            </Show>
          </div>

          <Show when={error()}>
            <div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-red-500">
              <AlertCircle size={15} class="mt-0.5 shrink-0" />
              <p class="text-xs">{error()}</p>
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
            <textarea
              readonly
              rows={rows()}
              value={value() ?? ''}
              onClick={(e) => shown() && e.currentTarget.select()}
              spellcheck={false}
              style={{ '-webkit-text-security': shown() ? 'none' : 'disc' } as any}
              class="max-h-[40vh] w-full resize-y rounded-xl border border-base-content/[0.08] bg-base-content/[0.04] px-3.5 py-3 font-mono text-xs leading-relaxed text-base-content/90 focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30"
            />
            <p class="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
              <AlertCircle size={12} class="mt-0.5 shrink-0" />
              El valor se borra de la pantalla al cerrar. Esta revelación queda registrada en la auditoría.
            </p>
          </Show>
        </div>

        {/* ── Secondary actions ── */}
        <div class="border-t border-base-content/[0.06] py-1">
          <ActionRow
            icon={Link2}
            label="Compartir enlace"
            hint="URL revocable atada a un token de agente"
            onClick={props.onShare}
          />
          <ActionRow
            icon={Pencil}
            label="Editar"
            hint="Nombre, clave, valor, proyecto y etiquetas"
            onClick={props.onEdit}
          />
        </div>

        {/* ── Destructive, set apart ── */}
        <div class="border-t border-base-content/[0.06] py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <ActionRow
            icon={Trash2}
            label="Eliminar secreto"
            hint="Deja de estar disponible; la auditoría se conserva"
            danger
            onClick={props.onDelete}
          />
        </div>
      </div>
    </div>
  );
};

export default SecretDetailSheet;
