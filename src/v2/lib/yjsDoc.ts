// Per-story Yjs document manager — the source of truth for collaborative
// editing of `description`. The doc is hydrated from the server's append-only
// update log on first open, then kept live via Centrifugo broadcasts and
// outgoing POSTs of local Y.Doc updates.
//
// Notes:
// - The Y.Text key is `description`. Hydration falls back to seeding from
//   `props.story.description` when the server has no log yet.
// - Updates emitted by the local doc are only sent if their origin is
//   the editor (`'local'`), avoiding feedback loops with remote-applied
//   updates whose origin is `'remote'`.
// - `openDoc` returns a thin handle. Multiple consumers per story id are
//   refcounted so two components mounting the same modal share one doc.
import * as Y from 'yjs';
import { onRealtime, getRealtimeClientId, type RealtimeEvent } from './realtime';
import { API_BASE } from './api';

interface DocEntry {
  doc: Y.Doc;
  text: Y.Text;
  refCount: number;
  hydrated: Promise<void>;
  // Buffer of locally-emitted updates queued for POST. We flush on a
  // microtask to coalesce burst typing into one HTTP request.
  pending: Uint8Array[];
  flushTimer?: ReturnType<typeof setTimeout>;
}

const docs = new Map<string, DocEntry>();
let realtimeUnsub: (() => void) | undefined;

const FLUSH_DELAY_MS = 80;

const ensureRealtime = () => {
  if (realtimeUnsub) return;
  realtimeUnsub = onRealtime((ev: RealtimeEvent) => {
    if (ev.type !== 'doc.update') return;
    const id = ev.story_id as string | undefined;
    const b64 = ev.update_b64 as string | undefined;
    if (!id || !b64) return;
    const entry = docs.get(id);
    if (!entry) return;
    try {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      Y.applyUpdate(entry.doc, bin, 'remote');
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[yjs] bad update_b64', err);
    }
  });
};

const flush = (storyId: string, entry: DocEntry) => {
  entry.flushTimer = undefined;
  if (!entry.pending.length) return;
  // Merge buffered updates into one binary so we POST the smallest possible
  // payload that still captures everything.
  const merged = entry.pending.length === 1
    ? entry.pending[0]
    : Y.mergeUpdates(entry.pending);
  entry.pending = [];

  // Pass our tab's client id so the server tags the broadcast and our own
  // realtime listener filters it out — otherwise we'd re-apply our own
  // update (idempotent but wasted work + visible latency).
  const cid = getRealtimeClientId();
  fetch(`${API_BASE}/api/stories/${storyId}/doc/update`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(cid ? { 'X-Client-Id': cid } : {}),
    },
    body: merged as BodyInit,
  }).catch(err => {
    if (import.meta.env.DEV) console.warn('[yjs] update POST failed', err);
  });
};

const hydrate = async (storyId: string, entry: DocEntry) => {
  try {
    const res = await fetch(`${API_BASE}/api/stories/${storyId}/doc`, {
      credentials: 'include',
    });
    if (res.status === 204) return; // Empty story — Y.Text starts blank.
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    Y.applyUpdate(entry.doc, buf, 'remote');
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[yjs] hydrate failed', err);
  }
};

export interface YDocHandle {
  text: Y.Text;
  doc: Y.Doc;
  hydrated: Promise<void>;
}

export const openDoc = (storyId: string): YDocHandle => {
  ensureRealtime();
  let entry = docs.get(storyId);
  if (entry) {
    entry.refCount += 1;
    return {
      doc: entry.doc,
      text: entry.text,
      hydrated: entry.hydrated,
    };
  }

  const doc = new Y.Doc();
  const text = doc.getText('description');
  entry = { doc, text, refCount: 1, pending: [], hydrated: Promise.resolve() };
  docs.set(storyId, entry);

  // Capture local updates and schedule a flush. Remote-origin updates are
  // skipped so we only POST what the user actually typed.
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return;
    entry!.pending.push(update);
    if (entry!.flushTimer) clearTimeout(entry!.flushTimer);
    entry!.flushTimer = setTimeout(() => flush(storyId, entry!), FLUSH_DELAY_MS);
  });

  entry.hydrated = hydrate(storyId, entry);
  return { doc, text, hydrated: entry.hydrated };
};

export const closeDoc = (storyId: string) => {
  const entry = docs.get(storyId);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  // Flush any pending edits before tearing down.
  if (entry.flushTimer) {
    clearTimeout(entry.flushTimer);
    flush(storyId, entry);
  }
  entry.doc.destroy();
  docs.delete(storyId);
};
