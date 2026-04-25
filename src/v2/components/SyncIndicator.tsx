import { createSignal, onMount, onCleanup, Show, type Component } from 'solid-js';
import { onRealtime, onRealtimeStatus } from '../lib/realtime';

// Discreet floating sync indicator — Notion-style.
//   idle      → invisible (no chrome at all when nothing is happening)
//   syncing   → small blue dot pulsing + "Sincronizando"
//   synced    → green check + "Actualizado" for a beat, then fades
//   offline   → amber dot + "Sin conexión" (sticky until reconnect)
//
// Positioned top-right, above page content but below modals.
type SyncState = 'idle' | 'syncing' | 'synced' | 'offline';

const SYNCING_MIN_MS = 350; // keep "Sincronizando" visible at least this long
const SYNCED_HOLD_MS = 1100; // how long "Actualizado" stays before fading
const DATA_EVENT_PREFIXES = [
  'assignment.',
  'completion.',
  'doc.',
  'goal.',
  'project.',
  'report.',
  'story.',
  'team.',
  'wiki.',
];

const shouldShowSyncForEvent = (type: string): boolean =>
  DATA_EVENT_PREFIXES.some((prefix) => type.startsWith(prefix));

const stateLabel = (state: SyncState): string => {
  if (state === 'syncing') return 'Sincronizando';
  if (state === 'synced') return 'Actualizado';
  return 'Sin conexión';
};

const dotClass = (state: SyncState): string => {
  if (state === 'syncing') return 'bg-ios-blue-500 shadow-ios-blue-500/30 animate-sync-dot';
  if (state === 'synced') return 'bg-ios-green-500 shadow-ios-green-500/30';
  return 'bg-amber-500 shadow-amber-500/30';
};

const SyncIndicator: Component = () => {
  const [state, setState] = createSignal<SyncState>('idle');
  let online = true;
  let toSyncedTimer: ReturnType<typeof setTimeout> | undefined;
  let toIdleTimer: ReturnType<typeof setTimeout> | undefined;

  // Stay silent until realtime has connected at least once. Avoids a spurious
  // "Sin conexión" banner on platforms where the WS isn't wired up yet (e.g.
  // mobile shell), while still surfacing real disconnects after a connection.
  let everConnected = false;

  onMount(() => {
    const unsubStatus = onRealtimeStatus((on) => {
      online = on;
      if (on) {
        everConnected = true;
        if (state() === 'offline') setState('idle');
      } else if (everConnected) {
        clearTimeout(toSyncedTimer);
        clearTimeout(toIdleTimer);
        setState('offline');
      }
    });

    const unsubEvent = onRealtime((event) => {
      if (!online || !shouldShowSyncForEvent(event.type)) return;
      clearTimeout(toSyncedTimer);
      clearTimeout(toIdleTimer);
      setState('syncing');
      toSyncedTimer = setTimeout(() => {
        setState('synced');
        toIdleTimer = setTimeout(() => setState('idle'), SYNCED_HOLD_MS);
      }, SYNCING_MIN_MS);
    });

    onCleanup(() => {
      clearTimeout(toSyncedTimer);
      clearTimeout(toIdleTimer);
      unsubStatus();
      unsubEvent();
    });
  });

  return (
    <Show when={state() !== 'idle'}>
      <div
        class="fixed z-[120] pointer-events-none top-[calc(0.85rem+env(safe-area-inset-top))] right-3 sm:right-5 animate-toast-in"
        aria-live="polite"
        aria-label={stateLabel(state())}
      >
        <div class="flex h-5 w-5 items-center justify-center rounded-full bg-base-100/55 backdrop-blur-xl">
          <span class={`h-2 w-2 rounded-full shadow-[0_0_10px_currentColor] ${dotClass(state())}`} />
          <span class="sr-only">{stateLabel(state())}</span>
        </div>
      </div>
    </Show>
  );
};

export default SyncIndicator;
