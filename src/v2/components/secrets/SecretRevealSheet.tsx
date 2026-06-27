import { createSignal, onCleanup, onMount, Show, type Component } from 'solid-js';
import { X, Lock, Eye, EyeOff, Copy, Check, AlertCircle } from 'lucide-solid';
import { api, type SecretMeta } from '../../lib/api';

interface Props {
  secret: SecretMeta;
  onClose: () => void;
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
 * Compact sheet that reveals a single secret's plaintext value.
 *
 * The value is treated as an opaque TXT blob — shown verbatim in one read-only
 * textarea (masked until revealed), never parsed into fields. The plaintext
 * lives ONLY in this component's local state while it is mounted; `onCleanup`
 * wipes it, so the value never lingers after the sheet closes.
 */
const SecretRevealSheet: Component<Props> = (props) => {
  const [value, setValue] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [shown, setShown] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [error, setError] = createSignal('');

  let alive = true;

  // Size the textarea to the content, within sane bounds (scrolls past that).
  const rows = (): number => {
    const lines = value()?.split('\n').length ?? 1;
    return Math.min(16, Math.max(3, lines));
  };

  onMount(async () => {
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

    try {
      const res = await api.secrets.reveal(props.secret.id);
      if (alive) {
        setValue(res.value);
        props.onRevealed?.();
      }
    } catch (e: any) {
      if (alive) setError(e?.message ?? 'No se pudo revelar el secreto');
    } finally {
      if (alive) setLoading(false);
    }
  });

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

  return (
    <div
      class="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-reveal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full overflow-hidden rounded-t-[24px] bg-base-100 shadow-2xl sm:max-w-md sm:rounded-[24px]">
        {/* Header */}
        <div class="flex items-start justify-between gap-3 border-b border-base-content/[0.06] px-5 py-4">
          <div class="flex min-w-0 items-start gap-3">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ios-blue-500/10 text-ios-blue-500">
              <Lock size={17} />
            </div>
            <div class="min-w-0">
              <h2 id="secret-reveal-title" class="truncate text-[15px] font-semibold">{props.secret.name}</h2>
              <p class="mt-0.5 truncate font-mono text-[11px] text-base-content/40">{props.secret.key}</p>
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

        <div class="space-y-3 px-5 py-4">
          <Show
            when={!error()}
            fallback={
              <div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-red-500">
                <AlertCircle size={15} class="mt-0.5 shrink-0" />
                <p class="text-xs">{error()}</p>
              </div>
            }
          >
            <Show
              when={!loading()}
              fallback={
                <div class="flex items-center gap-2.5 rounded-xl border border-base-content/[0.08] bg-base-content/[0.04] px-3.5 py-3 text-xs text-base-content/45">
                  <span class="h-4 w-4 animate-spin rounded-full border-2 border-base-content/20 border-t-base-content/60" />
                  Revelando…
                </div>
              }
            >
              {/* Single opaque TXT field — show/hide + copy. */}
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2 px-0.5">
                  <button
                    type="button"
                    onClick={() => setShown((v) => !v)}
                    disabled={!value()}
                    class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-base-content/50 transition-colors hover:bg-base-content/5 hover:text-base-content/80 disabled:opacity-40"
                  >
                    <Show when={shown()} fallback={<Eye size={13} />}>
                      <EyeOff size={13} />
                    </Show>
                    {shown() ? 'Ocultar' : 'Mostrar'}
                  </button>
                  <button
                    type="button"
                    onClick={copy}
                    disabled={!value()}
                    class={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
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

                <textarea
                  readonly
                  rows={rows()}
                  value={value() ?? ''}
                  onClick={(e) => shown() && e.currentTarget.select()}
                  spellcheck={false}
                  style={{ '-webkit-text-security': shown() ? 'none' : 'disc' } as any}
                  class="w-full max-h-[50vh] resize-y rounded-xl border border-base-content/[0.08] bg-base-content/[0.04] px-3.5 py-3 font-mono text-xs leading-relaxed text-base-content/90 focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30"
                />
              </div>
            </Show>

            <div class="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2.5 text-amber-600 dark:text-amber-400">
              <AlertCircle size={14} class="mt-0.5 shrink-0" />
              <p class="text-[11px] leading-relaxed">
                El valor se borra de la pantalla al cerrar. Esta revelación queda registrada en la auditoría.
              </p>
            </div>
          </Show>
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

export default SecretRevealSheet;
