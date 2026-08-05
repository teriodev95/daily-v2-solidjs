import { createSignal, onCleanup, onMount, type Component } from 'solid-js';
import { Maximize2, Timer } from 'lucide-solid';
import type { Story } from '../types';
import { formatElapsed } from '../lib/focusSession';

interface Props {
  story: Story;
  startedAt: number;
  onRestore: () => void;
}

/**
 * Modo foco minimizado: recuerda en qué tarea estás y cuánto llevas, sin ocupar
 * la pantalla. El reloj no se reanuda ni se pausa al minimizar — se calcula
 * contra `startedAt`, así que sigue corriendo exactamente igual.
 *
 * Abajo a la izquierda para no chocar con el dock (abajo al centro) ni con la
 * píldora de usuarios en línea (abajo a la derecha).
 */
const FocusPill: Component<Props> = (props) => {
  const [now, setNow] = createSignal(Date.now());

  onMount(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => window.clearInterval(id));
  });

  return (
    <button
      type="button"
      onClick={() => props.onRestore()}
      title={`Volver al foco: ${props.story.title}`}
      aria-label={`Volver al modo foco en ${props.story.title}`}
      class="group hidden sm:flex fixed bottom-4 left-4 z-40 max-w-[320px] items-center gap-2.5 rounded-full border border-base-content/[0.08] bg-base-200/85 py-2 pl-3 pr-2.5 shadow-lg shadow-black/10 backdrop-blur-2xl transition-colors hover:bg-base-200"
    >
      <span class="relative flex h-4 w-4 shrink-0 items-center justify-center text-ios-blue-500">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-ios-blue-500 opacity-20" />
        <Timer size={14} class="relative" />
      </span>

      <span class="min-w-0 truncate text-[12.5px] font-semibold text-base-content/75">
        {props.story.title}
      </span>

      <span class="shrink-0 font-mono text-[12.5px] font-bold tabular-nums text-ios-blue-500">
        {formatElapsed(now() - props.startedAt)}
      </span>

      <span class="shrink-0 rounded-full p-1 text-base-content/25 transition-colors group-hover:text-base-content/60">
        <Maximize2 size={13} />
      </span>
    </button>
  );
};

export default FocusPill;
