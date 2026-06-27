import { createEffect, onCleanup } from 'solid-js';
import { activeTab } from './activeTab';

type RefetchFn = () => unknown;

// Re-run a keep-alive page's data fetches when it becomes the foreground tab.
//
// AppV2 mounts every page once and toggles visibility with `display:none`
// (see AppShell `<main>`), so a page's `createResource` runs a single time and
// never re-fetches when the user navigates back to it — stale data until a full
// reload. This hook bridges that gap. It fires the given refetch(es):
//   1. on the inactive -> active transition of `tabId` (in-app navigation), and
//   2. when the browser tab/window regains visibility or focus while `tabId`
//      is the active tab (covers data that changed on another device/tab).
//
// It deliberately does NOT fire on initial mount — the resource already
// fetched once — and throttles bursts (~800ms) so a focus+visibility pair or a
// rapid back-and-forth can't double-fetch. Pass a single fn or an array.
export const useRefetchOnActive = (
  tabId: string,
  refetch: RefetchFn | RefetchFn[],
): void => {
  const fns = Array.isArray(refetch) ? refetch : [refetch];
  let lastRun = 0;
  const THROTTLE_MS = 800;

  const run = () => {
    const now = Date.now();
    if (now - lastRun < THROTTLE_MS) return;
    lastRun = now;
    for (const fn of fns) {
      try { fn(); } catch (err) { console.error('[refetchOnActive] refetch threw', err); }
    }
  };

  // In-app navigation: fire only on the inactive -> active transition.
  // `prev` is seeded with the current tab so the effect's first (mount) run
  // compares equal and never fires — no double fetch over the initial load.
  let prev = activeTab();
  createEffect(() => {
    const current = activeTab();
    if (prev !== tabId && current === tabId) run();
    prev = current;
  });

  // Browser-level: returning to the window should refresh whatever page the
  // user is currently looking at.
  const onVisibility = () => {
    if (document.visibilityState === 'visible' && activeTab() === tabId) run();
  };
  const onFocus = () => {
    if (activeTab() === tabId) run();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onFocus);
  onCleanup(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onFocus);
  });
};
