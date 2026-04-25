// Realtime adapter — Centrifugo client.
//
// Why Centrifugo: infra already deployed and stable (see wiki
// "Centrifugo production realtime"). Anonymous subscribe is enabled server-side
// so no JWT is issued here in Phase 1.
//
// Transport is encapsulated behind three functions:
//   connectRealtime(teamId)  — lazy-imports `centrifuge`, connects, subscribes.
//   onRealtime(handler)      — register a handler; returns cleanup.
//   disconnectRealtime()     — tear everything down (on logout).
//
// If we ever swap Centrifugo for Durable Objects + WS, only this file and the
// worker-side `worker/lib/realtime.ts` need to change; consumers stay untouched.

import type { Centrifuge, Subscription } from 'centrifuge';

export interface RealtimeEvent {
  type: string;
  actor_user_id?: string;
  [key: string]: unknown;
}

type Handler = (ev: RealtimeEvent) => void;

let client: Centrifuge | null = null;
let sub: Subscription | null = null;
let currentTeamId: string | null = null;
let connectInFlight: Promise<void> | null = null;
const handlers = new Set<Handler>();
const statusHandlers = new Set<(online: boolean) => void>();
let online = false;

// Per-tab client id. Persisted in sessionStorage so F5 keeps the same id
// within the same tab (so we don't echo to ourselves mid-reload) but each
// new tab gets its own id. Two tabs of the same user therefore DO sync.
const CLIENT_ID_KEY = 'dc-realtime-client-id';
const makeClientId = () => 'c_' + crypto.randomUUID();
let clientId: string = (() => {
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const next = makeClientId();
    sessionStorage.setItem(CLIENT_ID_KEY, next);
    return next;
  } catch {
    return makeClientId();
  }
})();

export const getRealtimeClientId = (): string => clientId;

// Kept for compatibility — currently a no-op. Echo suppression uses
// client id (per-tab), not user id (per-account), so two tabs of the same
// user can see each other's updates.
export const setRealtimeActor = (_userId: string | null): void => {
  // intentionally no-op
};

const WSS_URL = 'wss://centrifugo.terio.dev/connection/websocket';

export const connectRealtime = async (teamId: string): Promise<void> => {
  // Serialize concurrent calls. Prevents races when effects re-fire or when
  // login/logout happen while the `centrifuge` chunk is still loading.
  if (connectInFlight) {
    await connectInFlight;
    // After the in-flight connect finishes, re-check: if we're already on the
    // requested team, no-op; otherwise swap.
    if (client && currentTeamId === teamId) return;
  }

  if (client && currentTeamId === teamId) return;

  const run = async () => {
    if (client) {
      try { sub?.unsubscribe(); } catch { /* ignore */ }
      try { client.disconnect(); } catch { /* ignore */ }
      sub = null;
      client = null;
      currentTeamId = null;
      online = false;
    }

    try {
      const mod = await import('centrifuge');
      const Centrifuge = mod.Centrifuge;
      const nextClient = new Centrifuge(WSS_URL, {
        debug: import.meta.env.DEV,
      });
      nextClient.on('connected', () => {
        online = true;
        Array.from(statusHandlers).forEach((h) => h(true));
      });
      nextClient.on('disconnected', () => {
        online = false;
        Array.from(statusHandlers).forEach((h) => h(false));
      });
      nextClient.on('error', (err) => {
        if (import.meta.env.DEV) console.debug('[realtime] error', err);
      });

      const nextSub = nextClient.newSubscription(`team.${teamId}`);
      nextSub.on('publication', (ctx) => {
        const data = ctx.data as RealtimeEvent | null | undefined;
        if (!data || typeof data.type !== 'string') return;
        // Echo suppression by client id (per-tab), NOT by user id.
        // Two tabs of the same user have different client ids and therefore
        // see each other's updates.
        const actorClient = (data as any).actor_client_id;
        if (actorClient && actorClient === clientId) {
          if (import.meta.env.DEV) console.debug('[realtime] echo skipped', data.type);
          return;
        }
        if (import.meta.env.DEV) console.debug('[realtime]', data.type, data);
        Array.from(handlers).forEach((h) => {
          try { h(data); } catch (err) { console.error('[realtime] handler threw', err); }
        });
      });
      nextSub.subscribe();
      nextClient.connect();

      client = nextClient;
      sub = nextSub;
      currentTeamId = teamId;
    } catch (err) {
      console.error('[realtime] connect failed', err);
      client = null;
      sub = null;
      currentTeamId = null;
    }
  };

  connectInFlight = run();
  try {
    await connectInFlight;
  } finally {
    connectInFlight = null;
  }
};

export const onRealtime = (handler: Handler): (() => void) => {
  handlers.add(handler);
  return () => { handlers.delete(handler); };
};

export const onRealtimeStatus = (handler: (online: boolean) => void): (() => void) => {
  statusHandlers.add(handler);
  handler(online);
  return () => { statusHandlers.delete(handler); };
};

export const isRealtimeOnline = (): boolean => online;

export const disconnectRealtime = (): void => {
  try { sub?.unsubscribe(); } catch { /* ignore */ }
  try { client?.disconnect(); } catch { /* ignore */ }
  sub = null;
  client = null;
  currentTeamId = null;
  online = false;
  handlers.clear();
  statusHandlers.clear();
};

// Subscribe to events whose type matches any prefix in `prefixes`. Debounced.
// Useful for components that want to refetch when a family of events fires.
export const onRealtimeMatch = (
  prefixes: string[],
  handler: () => void,
  debounceMs = 300,
): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { handler(); } catch (err) { console.error('[realtime] match handler threw', err); }
    }, debounceMs);
  };
  const cleanup = onRealtime((ev) => {
    if (prefixes.some((p) => ev.type === p || ev.type.startsWith(p))) fire();
  });
  return () => {
    clearTimeout(timer);
    cleanup();
  };
};

// Combined helper: refetch on matching realtime events AND when the tab
// regains visibility/focus (fallback when WS is down or events were missed).
//
// `isActive` (optional) — accessor returning true when the caller's page is
// the foreground tab. When false, events are marked stale and refetch is
// deferred until the page becomes active. This prevents all pages from
// fan-out-refetching on every realtime event (big request multiplier).
export const useRealtimeRefetch = (
  prefixes: string[],
  refetch: () => void,
  opts: { debounceMs?: number; isActive?: () => boolean } = {},
): (() => void) => {
  const debounceMs = opts.debounceMs ?? 300;
  let stale = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const runIfActive = () => {
    if (opts.isActive && !opts.isActive()) {
      stale = true;
      return;
    }
    stale = false;
    try { refetch(); } catch (err) { console.error('[realtime] refetch threw', err); }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(runIfActive, debounceMs);
  };

  const unsubWs = onRealtimeMatch(prefixes, schedule, 0);

  const onVisibility = () => {
    if (document.visibilityState === 'visible') schedule();
  };
  window.addEventListener('focus', schedule);
  document.addEventListener('visibilitychange', onVisibility);

  // If the caller passes an activity signal, flush stale work when the
  // page becomes active. Implemented via a polling microtick on the
  // handler — keeping this module framework-agnostic. Consumers that want
  // reactive behavior can also call flushStale() manually.
  let activeCheckTimer: ReturnType<typeof setInterval> | undefined;
  if (opts.isActive) {
    let wasActive = opts.isActive();
    activeCheckTimer = setInterval(() => {
      const nowActive = opts.isActive!();
      if (!wasActive && nowActive && stale) {
        stale = false;
        try { refetch(); } catch (err) { console.error('[realtime] stale flush threw', err); }
      }
      wasActive = nowActive;
    }, 500);
  }

  return () => {
    clearTimeout(timer);
    if (activeCheckTimer) clearInterval(activeCheckTimer);
    unsubWs();
    window.removeEventListener('focus', schedule);
    document.removeEventListener('visibilitychange', onVisibility);
  };
};
