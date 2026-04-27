import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as Y from 'yjs';
import type { Env, Variables } from '../types';
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

const fromHex = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const toBase64 = (bytes: Uint8Array): string => {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j += 1) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
};

const insertUpdate = async (d1: D1Database, storyId: string, update: Uint8Array, createdAt: string) => {
  await d1
    .prepare('INSERT INTO story_doc_updates (story_id, "update", created_at) VALUES (?, ?, ?)')
    .bind(storyId, toArrayBuffer(update), createdAt)
    .run();
};

const buildDoc = async (d1: D1Database, storyId: string): Promise<Y.Doc> => {
  const { results } = await d1
    .prepare('SELECT hex("update") AS update_hex FROM story_doc_updates WHERE story_id = ? ORDER BY id ASC')
    .bind(storyId)
    .all<{ update_hex: string }>();
  const doc = new Y.Doc();
  for (const r of results ?? []) {
    try { Y.applyUpdate(doc, fromHex(r.update_hex)); } catch { /* skip malformed */ }
  }
  return doc;
};

const seedDocFromDescription = async (
  d1: D1Database,
  storyId: string,
  description: string,
): Promise<Y.Doc> => {
  const doc = new Y.Doc();
  doc.getText('description').insert(0, description);
  const state = Y.encodeStateAsUpdate(doc);
  await insertUpdate(d1, storyId, state, new Date().toISOString());
  return doc;
};

const repairEmptyDocFromDescription = async (
  d1: D1Database,
  storyId: string,
  doc: Y.Doc,
  description: string,
): Promise<Y.Doc> => {
  // If a previous deploy wrote an empty/malformed Yjs update row, the mere
  // presence of that row prevents first-open seeding from `stories.description`.
  // Repair that state before the editor opens, otherwise the next keystroke can
  // overwrite the markdown cache and make existing diagrams look lost.
  if (doc.getText('description').length > 0 || !description) return doc;
  doc.getText('description').insert(0, description);
  const state = Y.encodeStateAsUpdate(doc);
  await insertUpdate(d1, storyId, state, new Date().toISOString());
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
  const [story] = await db
    .select({ description: schema.stories.description })
    .from(schema.stories)
    .where(eq(schema.stories.id, storyId))
    .limit(1);
  const seed = story?.description ?? '';

  const existing = await c.env.DB
    .prepare('SELECT id FROM story_doc_updates WHERE story_id = ? LIMIT 1')
    .bind(storyId)
    .first<{ id: number }>();

  if (!existing) {
    if (!seed) return new Response(null, { status: 204 });
    const doc = await seedDocFromDescription(c.env.DB, storyId, seed);
    const state = Y.encodeStateAsUpdate(doc);
    return new Response(toArrayBuffer(state), {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }

  const doc = await repairEmptyDocFromDescription(c.env.DB, storyId, await buildDoc(c.env.DB, storyId), seed);
  const state = Y.encodeStateAsUpdate(doc);
  return new Response(toArrayBuffer(state), {
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
  await insertUpdate(c.env.DB, storyId, update, now);

  // Refresh the markdown cache (description) and `updated_at`.
  const doc = await buildDoc(c.env.DB, storyId);
  const text = doc.getText('description').toString();
  await db
    .update(schema.stories)
    .set({ description: text, updated_at: now })
    .where(eq(schema.stories.id, storyId));

  // Broadcast the update so other clients apply it locally. Base64 the
  // bytes — Centrifugo carries JSON.
  const b64 = toBase64(update);
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
