import { createSignal, onCleanup, onMount, createEffect, type Accessor } from 'solid-js';
import { onRealtime, type RealtimeEvent } from './realtime';
import { api, API_BASE } from './api';

// Ephemeral presence: who else is viewing/editing each scope right now.
// State lives only in memory; entries age out after `TTL_MS` of no beat.
// Server is a pure broker (see `worker/routes/presence.ts`).

export type PresenceMode = 'viewing' | 'editing';

export interface PresenceEntry {
  user_id: string;
  mode: PresenceMode;
  expiresAt: number;
}

const BEAT_INTERVAL_MS = 10_000;
const TTL_MS = 25_000;
const GC_INTERVAL_MS = 5_000;

// Per-scope accessors. Components subscribe via `presentIn(scope)`.
const stores = new Map<string, {
  entries: Map<string, PresenceEntry>;
  signal: Accessor<PresenceEntry[]>;
  setSignal: (v: PresenceEntry[]) => void;
}>();

const getStore = (scope: string) => {
  let s = stores.get(scope);
  if (!s) {
    const [signal, setSignal] = createSignal<PresenceEntry[]>([]);
    s = { entries: new Map(), signal, setSignal };
    stores.set(scope, s);
  }
  return s;
};

const refreshSignal = (scope: string) => {
  const s = getStore(scope);
  s.setSignal(Array.from(s.entries.values()));
};

// One global subscription to realtime — handles every scope. Initialized
// lazily on first `usePresence` so we don't pay the cost when the feature
// isn't in use (e.g. anonymous routes).
let globalUnsub: (() => void) | undefined;
let gcTimer: ReturnType<typeof setInterval> | undefined;

const ensureGlobalListeners = () => {
  if (globalUnsub) return;

  globalUnsub = onRealtime((ev: RealtimeEvent) => {
    if (ev.type === 'presence.beat') {
      const userId = ev.user_id as string | undefined;
      const scope = ev.scope as string | undefined;
      const mode = (ev.mode as PresenceMode | undefined) ?? 'viewing';
      if (!userId || !scope) return;
      const s = getStore(scope);
      s.entries.set(userId, { user_id: userId, mode, expiresAt: Date.now() + TTL_MS });
      refreshSignal(scope);
      return;
    }
    if (ev.type === 'presence.leave') {
      const userId = ev.user_id as string | undefined;
      const scope = ev.scope as string | undefined;
      if (!userId || !scope) return;
      const s = stores.get(scope);
      if (s?.entries.delete(userId)) refreshSignal(scope);
    }
  });

  gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [scope, s] of stores) {
      let changed = false;
      for (const [id, entry] of s.entries) {
        if (entry.expiresAt < now) {
          s.entries.delete(id);
          changed = true;
        }
      }
      if (changed) refreshSignal(scope);
    }
  }, GC_INTERVAL_MS);
};

// Read-only accessor for components rendering the avatar stack.
export const presentIn = (scope: string): Accessor<PresenceEntry[]> => {
  ensureGlobalListeners();
  return getStore(scope).signal;
};

// Manually drop a stale entry (e.g. when a follow-up event tells us the
// user moved scope). Currently unused but cheap to expose.
export const forgetPresence = (scope: string, userId: string) => {
  const s = stores.get(scope);
  if (s?.entries.delete(userId)) refreshSignal(scope);
};

// Solid hook: while `isActive()` is true and the tab is visible, send a
// beat every BEAT_INTERVAL_MS. Pauses on visibilitychange. Sends `leave`
// on cleanup or when leaving the scope.
export const usePresence = (
  scope: string,
  isActive: () => boolean,
  mode: () => PresenceMode,
) => {
  ensureGlobalListeners();

  let beatTimer: ReturnType<typeof setInterval> | undefined;
  let lastSent: PresenceMode | null = null;

  const sendBeat = () => {
    const m = mode();
    void api.presence.beat(scope, m);
    lastSent = m;
  };

  const sendLeave = () => {
    void api.presence.leave(scope);
    lastSent = null;
  };

  // `pagehide` (and the legacy `beforeunload`) are the only reliable hooks
  // when the tab closes abruptly — Solid's `onCleanup` doesn't run for that.
  // `navigator.sendBeacon` is queued by the browser even after the page is
  // gone, so the leave actually reaches the server.
  const sendLeaveBeacon = () => {
    if (lastSent === null) return;
    try {
      const blob = new Blob([JSON.stringify({ scope })], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE}/api/presence/leave`, blob);
    } catch {
      // Best-effort; TTL on receivers will reap us anyway.
    }
    lastSent = null;
  };

  const start = () => {
    if (beatTimer) return;
    sendBeat();
    beatTimer = setInterval(sendBeat, BEAT_INTERVAL_MS);
  };

  const stop = (announceLeave: boolean) => {
    if (beatTimer) {
      clearInterval(beatTimer);
      beatTimer = undefined;
    }
    if (announceLeave && lastSent !== null) sendLeave();
  };

  onMount(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isActive()) start();
      else stop(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', sendLeaveBeacon);
    onCleanup(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', sendLeaveBeacon);
    });

    if (isActive() && document.visibilityState === 'visible') start();
  });

  // React to mode changes — push an immediate beat so other clients see
  // the transition (viewing → editing) without waiting for the interval.
  createEffect(() => {
    const m = mode();
    if (beatTimer && m !== lastSent) sendBeat();
  });

  // React to isActive flipping. Off → on starts beating; on → off leaves.
  createEffect(() => {
    if (isActive()) {
      if (document.visibilityState === 'visible') start();
    } else {
      stop(true);
    }
  });

  onCleanup(() => stop(true));
};
