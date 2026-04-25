import { type Component } from 'solid-js';
import { AlertCircle } from 'lucide-solid';

// Inline banner shown above the description editor when a remote change
// arrived while the local user was editing — or when a save was rejected
// with 409. Two outcomes only: take the remote version, or push our local
// version on top of it. Diff/merge UX is intentionally out of scope.
interface Props {
  // Optional human-readable name of the editor on the other side.
  actorName?: string | null;
  onAcceptRemote: () => void;
  onKeepMine: () => void;
}

const ConflictBanner: Component<Props> = (props) => {
  const who = () => props.actorName?.trim() || 'Otro miembro';

  return (
    <div
      role="status"
      aria-live="polite"
      class="flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-3.5 py-2.5"
    >
      <AlertCircle size={15} class="shrink-0 text-amber-500" />
      <div class="min-w-0 flex-1 text-[12.5px] leading-snug text-amber-700 dark:text-amber-300">
        <span class="font-semibold">{who()}</span>
        <span class="text-amber-700/80 dark:text-amber-300/80"> editó la descripción mientras escribías. Tu texto local se conserva.</span>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={props.onKeepMine}
          class="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
        >
          Pisar con la mía
        </button>
        <button
          type="button"
          onClick={props.onAcceptRemote}
          class="rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
        >
          Ver la remota
        </button>
      </div>
    </div>
  );
};

export default ConflictBanner;
