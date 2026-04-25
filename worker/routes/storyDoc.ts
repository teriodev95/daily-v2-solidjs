import { Hono } from 'hono';
import { eq, asc } from 'drizzle-orm';
import * as Y from 'yjs';
import type { Env, Variables, AppDb } from '../types';
import * as schema from '../db/schema';
import { publish, teamChannel } from '../lib/realtime';

// Realtime collaborative editing of `stories.description` backed by Yjs.
//
// Strategy: append-only log of binary updates. Each `POST /doc/update` adds
// one row; `GET /doc` replays every row for the story into a fresh Y.Doc and
// returns the encoded state. Avoids the read-modify-write race that a single
// merged blob would have (D1 has no per-row transactions across statements).
//
// The merged plain text is also written back to `stories.description` as a
// denormalized cache so kanban/search/agent endpoints keep seeing markdown
// without needing Yjs.
const storyDoc = new Hono<{ Bindings: Env; Variables: Variables }>();

const toUint8 = (v: unknown): Uint8Array => {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  // D1's `blob mode: 'buffer'` returns Uint8Array via Cloudflare's binding,
  // but defensively handle Buffer-shaped objects.
  if (v && typeof v === 'object' && 'byteLength' in (v as object)) {
    const anyV = v as { byteLength: number; buffer?: ArrayBufferLike; byteOffset?: number };
    if (anyV.buffer) return new Uint8Array(anyV.buffer, anyV.byteOffset ?? 0, anyV.byteLength);
  }
  throw new Error('expected binary blob');
};

const buildDoc = async (db: AppDb, storyId: string): Promise<Y.Doc> => {
  const rows = await db
    .select({ update: schema.storyDocUpdates.update })
    .from(schema.storyDocUpdates)
    .where(eq(schema.storyDocUpdates.story_id, storyId))
    .orderBy(asc(schema.storyDocUpdates.id));
  const doc = new Y.Doc();
  for (const r of rows) {
    try { Y.applyUpdate(doc, toUint8(r.update)); } catch { /* skip malformed */ }
  }
  return doc;
};

// GET /api/stories/:id/doc — returns the merged Y.Doc state as raw bytes.
// First fetch for a story with non-empty `description` seeds the log with
// that text so every client converges on the same initial state (avoids
// each client seeding locally and producing duplicated content via two
// concurrent inserts at position 0).
storyDoc.get('/:id/doc', async (c) => {
  const db = c.get('db');
  const storyId = c.req.param('id');
  const rows = await db
    .select({ id: schema.storyDocUpdates.id })
    .from(schema.storyDocUpdates)
    .where(eq(schema.storyDocUpdates.story_id, storyId))
    .limit(1);

  if (rows.length === 0) {
    const [story] = await db
      .select({ description: schema.stories.description })
      .from(schema.stories)
      .where(eq(schema.stories.id, storyId))
      .limit(1);
    const seed = story?.description ?? '';
    if (!seed) return new Response(null, { status: 204 });
    const doc = new Y.Doc();
    doc.getText('description').insert(0, seed);
    const state = Y.encodeStateAsUpdate(doc);
    await db.insert(schema.storyDocUpdates).values({
      story_id: storyId,
      update: state as unknown as Buffer,
      created_at: new Date().toISOString(),
    });
    return new Response(state, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }

  const doc = await buildDoc(db, storyId);
  const state = Y.encodeStateAsUpdate(doc);
  return new Response(state, {
    status: 200,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
});

// POST /api/stories/:id/doc/update — body is the raw Y update bytes.
// Persists, broadcasts to the team channel, and refreshes the description
// cache so non-Yjs consumers see the latest text.
storyDoc.post('/:id/doc/update', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const storyId = c.req.param('id');

  // Hono accepts the raw body via arrayBuffer.
  const ab = await c.req.arrayBuffer();
  if (!ab.byteLength) return c.json({ error: 'empty_update' }, 400);
  const update = new Uint8Array(ab);

  const now = new Date().toISOString();
  await db.insert(schema.storyDocUpdates).values({
    story_id: storyId,
    update: update as unknown as Buffer,
    created_at: now,
  });

  // Refresh the markdown cache (description) and `updated_at`.
  const doc = await buildDoc(db, storyId);
  const text = doc.getText('description').toString();
  await db
    .update(schema.stories)
    .set({ description: text, updated_at: now })
    .where(eq(schema.stories.id, storyId));

  // Broadcast the update so other clients apply it locally. Base64 the
  // bytes — Centrifugo carries JSON.
  const b64 = btoa(String.fromCharCode(...update));
  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), {
      type: 'doc.update',
      story_id: storyId,
      update_b64: b64,
    }, c.req.header('x-client-id')),
  );

  return c.json({ ok: true });
});

export default storyDoc;
