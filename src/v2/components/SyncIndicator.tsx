import { createSignal, onMount, onCleanup, Show, type Component } from 'solid-js';
import { Check, CloudOff } from 'lucide-solid';
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

    const unsubEvent = onRealtime(() => {
      if (!online) return;
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
        class="fixed z-[120] pointer-events-none top-[calc(0.75rem+env(safe-area-inset-top))] right-3 sm:right-5 animate-toast-in"
        aria-live="polite"
      >
        <div class="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-200/85 backdrop-blur-2xl border border-base-content/[0.08] shadow-sm shadow-black/10">
          <Show when={state() === 'syncing'}>
            <span class="w-1.5 h-1.5 rounded-full bg-ios-blue-500 animate-sync-dot" />
            <span class="text-[10.5px] font-semibold text-base-content/65 tracking-tight">Sincronizando</span>
          </Show>
          <Show when={state() === 'synced'}>
            <Check size={11} strokeWidth={3} class="text-ios-green-500" />
            <span class="text-[10.5px] font-semibold text-base-content/65 tracking-tight">Actualizado</span>
          </Show>
          <Show when={state() === 'offline'}>
            <CloudOff size={11} strokeWidth={2.5} class="text-amber-500" />
            <span class="text-[10.5px] font-semibold text-amber-600 dark:text-amber-400 tracking-tight">Sin conexión</span>
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default SyncIndicator;
