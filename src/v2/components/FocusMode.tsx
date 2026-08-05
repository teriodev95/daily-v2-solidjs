import { createSignal, onCleanup, onMount, Show, type Component } from 'solid-js';
import { Check, Minus, X } from 'lucide-solid';
import type { Story } from '../types';
import { formatElapsed } from '../lib/focusSession';

interface Props {
  story: Story;
  /** Instante en que arrancó la sesión (epoch ms). */
  startedAt: number;
  onExit: () => void;
  onComplete: () => void;
  /** Oculta la pantalla dejando la sesión viva en la píldora flotante. */
  onMinimize: () => void;
}

/**
 * Pantalla de foco: tapa toda la interfaz para que solo quede la tarea en la
 * que estás trabajando, cuánto llevas y el botón para completarla. La ausencia
 * de todo lo demás (dock, barras, campos editables) es la funcionalidad: si
 * necesitas editar algo, sales del foco.
 */
const FocusMode: Component<Props> = (props) => {
  const [now, setNow] = createSignal(Date.now());
  const [completing, setCompleting] = createSignal(false);

  onMount(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        // Escape minimiza en vez de terminar: nada se pierde y la sesión sigue
        // en la píldora. Cerrarla es explícito (✕ o "Salir sin completar").
        props.onMinimize();
      }
    };
    // Captura para salir antes de que otros manejadores de Escape reaccionen.
    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    onCleanup(() => {
      window.clearInterval(id);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    });
  });

  const elapsed = () => formatElapsed(now() - props.startedAt);

  const complete = () => {
    if (completing()) return;
    setCompleting(true);
    props.onComplete();
  };

  return (
    <div
      class="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-base-100 px-6 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`Enfocado en ${props.story.title}`}
    >
      <div class="absolute right-5 top-5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => props.onMinimize()}
          class="inline-flex h-9 w-9 items-center justify-center rounded-full text-base-content/30 transition-colors hover:bg-base-content/[0.06] hover:text-base-content/70"
          aria-label="Minimizar sin detener el cronómetro"
          title="Minimizar — el cronómetro sigue"
        >
          <Minus size={18} />
        </button>
        <button
          type="button"
          onClick={() => props.onExit()}
          class="inline-flex h-9 w-9 items-center justify-center rounded-full text-base-content/30 transition-colors hover:bg-base-content/[0.06] hover:text-base-content/70"
          aria-label="Terminar la sesión de foco"
          title="Terminar sesión"
        >
          <X size={18} />
        </button>
      </div>

      <div class="flex w-full max-w-2xl flex-col items-center text-center">
        <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/25">
          Enfocado en
        </span>

        <h1 class="mt-4 text-balance text-[26px] font-bold leading-snug text-base-content/90 sm:text-[32px]">
          {props.story.title}
        </h1>

        <Show when={props.story.code}>
          <span class="mt-3 font-mono text-[11px] font-semibold text-base-content/30">
            {props.story.code}
          </span>
        </Show>

        <div class="mt-10 font-light tabular-nums text-[64px] leading-none tracking-tight text-base-content/85 sm:text-[80px]">
          {elapsed()}
        </div>
        <span class="mt-3 text-[11px] font-medium text-base-content/25">
          Tiempo en esta sesión
        </span>

        <button
          type="button"
          onClick={complete}
          disabled={completing()}
          class="mt-12 inline-flex items-center gap-2 rounded-2xl bg-ios-green-500 px-7 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-ios-green-500/20 transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <Check size={18} strokeWidth={2.6} />
          Completar tarea
        </button>

        <div class="mt-4 flex items-center gap-4 text-[12px] font-semibold">
          <button
            type="button"
            onClick={() => props.onMinimize()}
            class="text-base-content/35 transition-colors hover:text-base-content/65"
          >
            Minimizar (Esc)
          </button>
          <span class="h-3 w-px bg-base-content/10" />
          <button
            type="button"
            onClick={() => props.onExit()}
            class="text-base-content/35 transition-colors hover:text-base-content/65"
          >
            Salir sin completar
          </button>
        </div>
      </div>
    </div>
  );
};

export default FocusMode;
