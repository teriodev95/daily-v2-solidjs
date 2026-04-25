import { createMemo, type Resource } from 'solid-js';

// `useOnceReady(...resources)` — returns an Accessor<boolean> that flips to
// `true` the first time every resource has settled (ready OR errored) at least
// once, and stays `true` forever afterward. Use this to gate skeleton fallbacks
// so they only show on initial load — never on subsequent refetches (realtime,
// focus, etc).
//
// Includes `errored` on purpose: a failed initial fetch should still let the
// page render (with empty/fallback data) instead of trapping the user behind a
// skeleton with no recourse.
export const useOnceReady = (
  ...resources: Resource<unknown>[]
): (() => boolean) =>
  createMemo<boolean>((prev) => {
    if (prev) return true;
    return resources.every(r => r.state === 'ready' || r.state === 'errored');
  }, false);
