import { createSignal, onCleanup, onMount, Show, type Component } from 'solid-js';
import { AlertCircle, Copy, Check } from 'lucide-solid';

interface Props {
  token: string;
  name?: string;
  onClose: () => void;
}

const TokenRevealDialog: Component<Props> = (props) => {
  const [copied, setCopied] = createSignal(false);
  const [copyError, setCopyError] = createSignal(false);

  const handleCopy = async () => {
    setCopyError(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(props.token);
      } else {
        throw new Error('clipboard-unavailable');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 2600);
    }
  };

  // Intentionally do NOT close on Escape or backdrop click — the user must
  // explicitly acknowledge the token was saved.
  onMount(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    onCleanup(() => {
      document.body.style.overflow = prev;
    });
  });

  return (
    <div
      class="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-reveal-title"
    >
      <div class="bg-base-100 w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header (no close icon — single dismiss via footer button) */}
        <div class="flex items-start gap-3 px-5 py-4 border-b border-base-content/[0.06]">
          <div class="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
            <AlertCircle size={18} />
          </div>
          <div>
            <h2 id="token-reveal-title" class="text-base font-semibold">Guarda este token</h2>
            <Show when={props.name}>
              <p class="text-xs text-base-content/40 mt-0.5">{props.name}</p>
            </Show>
          </div>
        </div>

        <div class="px-5 py-4 space-y-4">
          <p class="text-sm text-base-content/70 leading-relaxed">
            Podrás volver a copiarlo desde el panel si lo pierdes, pero por
            seguridad consérvalo en un lugar seguro.
          </p>

          {/* Token display */}
          <div class="relative">
            <input
              type="text"
              readonly
              value={props.token}
              onClick={(e) => e.currentTarget.select()}
              class="w-full px-3 py-3 pr-28 rounded-xl bg-base-content/[0.04] border border-base-content/[0.08] font-mono text-xs text-base-content/90 focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30"
            />
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copiar token al portapapeles"
              class={`absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                copied()
                  ? 'bg-ios-green-500/15 text-ios-green-500'
                  : copyError()
                  ? 'bg-red-500/15 text-red-500'
                  : 'bg-ios-blue-500 text-white hover:bg-ios-blue-600'
              }`}
            >
              <Show
                when={copied()}
                fallback={
                  <Show when={copyError()} fallback={<Copy size={12} />}>
                    <AlertCircle size={12} />
                  </Show>
                }
              >
                <Check size={12} />
              </Show>
              {copied() ? 'Copiado' : copyError() ? 'Error' : 'Copiar'}
            </button>
          </div>
          <Show when={copyError()}>
            <p class="text-[11px] text-red-500 -mt-2">
              No se pudo copiar automáticamente. Selecciona el token y cópialo manualmente.
            </p>
          </Show>

          <div class="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/20 text-amber-600 dark:text-amber-400">
            <AlertCircle size={14} class="mt-0.5 shrink-0" />
            <p class="text-[11px] leading-relaxed">
              Trátalo como una contraseña. Cualquiera con este token podrá actuar
              con los permisos que le asignaste.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div class="px-5 py-3.5 border-t border-base-content/[0.06] flex justify-end">
          <button
            onClick={props.onClose}
            class="px-4 py-2 rounded-xl bg-base-content text-base-100 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};

export default TokenRevealDialog;
