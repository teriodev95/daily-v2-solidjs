import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq, and, asc } from 'drizzle-orm';
import type { Env, Variables, AppDb } from '../types';

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;
import * as schema from '../db/schema';

const alma = new Hono<{ Bindings: Env; Variables: Variables }>();

// ----- Validation helpers --------------------------------------------------

const VALID_TIERS = [0, 1, 2] as const;
const KIND_RE = /^[a-z0-9][a-z0-9_-]*$/i;

type AlmaRow = typeof schema.almaDocuments.$inferSelect;

function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === 'string');
    }
  } catch {
    // fallthrough
  }
  return [];
}

// Validates a tags input: must be an array of non-empty strings (<= 40 chars).
function validateTags(raw: unknown): { ok: true; tags: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'tags must be an array of strings' };
  }
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') {
      return { ok: false, error: 'tags must be an array of strings' };
    }
    const trimmed = t.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > 40) {
      return { ok: false, error: 'each tag must be 1-40 chars' };
    }
    out.push(trimmed);
  }
  return { ok: true, tags: out };
}

function isValidTier(value: unknown): value is 0 | 1 | 2 {
  return typeof value === 'number' && VALID_TIERS.includes(value as 0 | 1 | 2);
}

// Server-derived authorship: a PAT writes as the 'agent', everything else (a
// session) is a 'human'. Any `source` in the request body is ignored.
function resolveSource(c: { get: (k: 'tokenKind') => unknown }): 'agent' | 'human' {
  return c.get('tokenKind') === 'pat' ? 'agent' : 'human';
}

function toPublicAlma(row: AlmaRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    team_id: row.team_id,
    tier: row.tier as 0 | 1 | 2,
    kind: row.kind,
    title: row.title,
    content: row.content,
    tags: parseTags(row.tags),
    source: row.source as 'agent' | 'human' | null,
    sort: row.sort,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Ensures the user has exactly one canonical Tier 0 core (tier=0, kind='alma').
// Lazy-creates it (empty) when missing so the core always exists. Returns the row.
async function ensureCore(db: AppDb, userId: string, teamId: string): Promise<AlmaRow> {
  const [existing] = await db
    .select()
    .from(schema.almaDocuments)
    .where(
      and(
        eq(schema.almaDocuments.user_id, userId),
        eq(schema.almaDocuments.tier, 0),
        eq(schema.almaDocuments.kind, 'alma'),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.insert(schema.almaDocuments).values({
      id,
      user_id: userId,
      team_id: teamId,
      tier: 0,
      kind: 'alma',
      title: 'ALMA',
      content: '',
      tags: '[]',
      source: null,
      sort: 0,
      created_at: now,
      updated_at: now,
    });
  } catch {
    // A concurrent request created the core first (partial unique index rejects
    // the duplicate). Fall through and re-read the winning row.
  }
  const [row] = await db
    .select()
    .from(schema.almaDocuments)
    .where(
      and(
        eq(schema.almaDocuments.user_id, userId),
        eq(schema.almaDocuments.tier, 0),
        eq(schema.almaDocuments.kind, 'alma'),
      ),
    )
    .limit(1);
  return row!;
}

// ----- Block helpers -------------------------------------------------------

const MAX_BLOCK_TEXT = 8000;

type BlockRow = typeof schema.almaBlocks.$inferSelect;

function toPublicBlock(row: BlockRow) {
  return {
    id: row.id,
    alma_id: row.alma_id,
    text: row.text,
    locked: row.locked,
    sort: row.sort,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Loads an Alma entry and asserts the current user owns it. Returns the row, or
// null when it doesn't exist / isn't theirs (callers respond 404). Every block
// route checks ownership through here before touching any block.
async function getOwnedAlma(db: AppDb, id: string, userId: string): Promise<AlmaRow | null> {
  const [row] = await db
    .select()
    .from(schema.almaDocuments)
    .where(eq(schema.almaDocuments.id, id))
    .limit(1);
  if (!row || row.user_id !== userId) return null;
  return row;
}

// An entry's blocks, ordered by sort asc.
async function listBlocks(db: AppDb, almaId: string): Promise<BlockRow[]> {
  return db
    .select()
    .from(schema.almaBlocks)
    .where(eq(schema.almaBlocks.alma_id, almaId))
    .orderBy(asc(schema.almaBlocks.sort));
}

// Sets each block's sort to its index in `orderedIds` (dense 0..n-1). Used after
// every structural change (insert / delete / reorder).
async function renumber(db: AppDb, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(schema.almaBlocks)
      .set({ sort: i })
      .where(eq(schema.almaBlocks.id, orderedIds[i]));
  }
}

// Rebuilds alma_documents.content from its blocks (texts joined by "\n\n" in
// sort order) and stamps updated_at + server-derived source. The single place
// content is derived from blocks — keep it DRY. Returns the refreshed block list.
async function recomputeContent(c: AppContext, almaId: string): Promise<BlockRow[]> {
  const db = c.get('db');
  const blocks = await listBlocks(db, almaId);
  const content = blocks.map((b) => b.text).join('\n\n');
  await db
    .update(schema.almaDocuments)
    .set({ content, source: resolveSource(c), updated_at: new Date().toISOString() })
    .where(eq(schema.almaDocuments.id, almaId));
  return blocks;
}

// ----- Routes --------------------------------------------------------------

// GET / — list the current user's documents (tier asc, sort asc, created_at asc).
// Lazy-creates the Tier 0 core so it always exists exactly once.
alma.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  // Single read on the steady-state path; only lazy-create the Tier 0 core when
  // it's actually absent (avoids an extra SELECT/INSERT on every list).
  let rows = await db
    .select()
    .from(schema.almaDocuments)
    .where(eq(schema.almaDocuments.user_id, user.userId));

  if (!rows.some((r) => r.tier === 0 && r.kind === 'alma')) {
    const core = await ensureCore(db, user.userId, user.teamId);
    rows = [...rows, core];
  }

  rows.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.sort - b.sort ||
      a.created_at.localeCompare(b.created_at),
  );

  return c.json(rows.map(toPublicAlma));
});

// POST / — create a document for the current user. `source` is server-set.
alma.post('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  let body: {
    tier?: unknown;
    kind?: unknown;
    title?: unknown;
    content?: unknown;
    tags?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // tier
  if (!isValidTier(body.tier)) {
    return c.json({ error: 'tier must be 0, 1 or 2', field: 'tier' }, 400);
  }
  const tier = body.tier;

  // kind
  if (typeof body.kind !== 'string') {
    return c.json({ error: 'kind is required', field: 'kind' }, 400);
  }
  const kind = body.kind.trim();
  if (kind.length < 1 || kind.length > 60 || !KIND_RE.test(kind)) {
    return c.json({ error: 'kind must be a slug-ish string, 1-60 chars', field: 'kind' }, 400);
  }

  // title
  if (typeof body.title !== 'string') {
    return c.json({ error: 'title is required', field: 'title' }, 400);
  }
  const title = body.title.trim();
  if (title.length < 1 || title.length > 120) {
    return c.json({ error: 'title must be 1-120 chars', field: 'title' }, 400);
  }

  // content (optional)
  let content = '';
  if (body.content !== undefined && body.content !== null) {
    if (typeof body.content !== 'string') {
      return c.json({ error: 'content must be a string', field: 'content' }, 400);
    }
    content = body.content;
  }

  // tags (optional)
  let tags: string[] = [];
  if (body.tags !== undefined && body.tags !== null) {
    const tagsResult = validateTags(body.tags);
    if (!tagsResult.ok) {
      return c.json({ error: tagsResult.error, field: 'tags' }, 400);
    }
    tags = tagsResult.tags;
  }

  // Tier 0 is the single canonical core — never create a second one.
  if (tier === 0) {
    await ensureCore(db, user.userId, user.teamId);
    return c.json({ error: 'Tier 0 core already exists; edit it instead', field: 'tier' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.almaDocuments).values({
    id,
    user_id: user.userId,
    team_id: user.teamId,
    tier,
    kind,
    title,
    content,
    tags: JSON.stringify(tags),
    source: resolveSource(c),
    sort: 0,
    created_at: now,
    updated_at: now,
  });

  const [created] = await db
    .select()
    .from(schema.almaDocuments)
    .where(eq(schema.almaDocuments.id, id))
    .limit(1);

  return c.json(toPublicAlma(created), 201);
});

// ----- Block routes --------------------------------------------------------
// Registered before the generic `/:id` handlers below. A paragraph (block) is
// the atomic unit; `alma_documents.content` is a derived cache rebuilt by
// `recomputeContent` after every text/structure change.

// GET /:id/blocks — blocks for an entry, ordered by sort. Lazy backfill: an
// entry with no blocks but non-empty content is split on blank lines into
// blocks (one-time), then returned.
alma.get('/:id/blocks', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const doc = await getOwnedAlma(db, id, user.userId);
  if (!doc) return c.json({ error: 'Not found' }, 404);

  let blocks = await listBlocks(db, id);

  if (blocks.length === 0 && doc.content.trim().length > 0) {
    const now = new Date().toISOString();
    const segments = doc.content
      .split(/\n{2,}/)
      .filter((s) => s.trim().length > 0);
    if (segments.length > 0) {
      const rows = segments.map((text, i) => ({
        id: crypto.randomUUID(),
        alma_id: id,
        sort: i,
        text,
        locked: false,
        created_at: now,
        updated_at: now,
      }));
      // D1 caps bound parameters per statement (~100). Each row binds 7 columns,
      // so insert in chunks to stay well under the cap for long entries.
      const CHUNK = 12;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db.insert(schema.almaBlocks).values(rows.slice(i, i + CHUNK));
      }
      blocks = await listBlocks(db, id);
    }
  }

  return c.json({ blocks: blocks.map(toPublicBlock) });
});

// POST /:id/blocks — insert a block after `after` (or at the end). Renumbers and
// recomputes content. PAT allowed.
alma.post('/:id/blocks', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  let body: { text?: unknown; after?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  let text = '';
  if (body.text !== undefined && body.text !== null) {
    if (typeof body.text !== 'string') {
      return c.json({ error: 'text must be a string', field: 'text' }, 400);
    }
    text = body.text;
  }
  if (text.length > MAX_BLOCK_TEXT) {
    return c.json({ error: `text must be <= ${MAX_BLOCK_TEXT} chars`, field: 'text' }, 400);
  }

  let after: string | null = null;
  if (body.after !== undefined && body.after !== null) {
    if (typeof body.after !== 'string') {
      return c.json({ error: 'after must be a string or null', field: 'after' }, 400);
    }
    after = body.after;
  }

  const doc = await getOwnedAlma(db, id, user.userId);
  if (!doc) return c.json({ error: 'Not found' }, 404);

  const blocks = await listBlocks(db, id);
  const newId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.almaBlocks).values({
    id: newId,
    alma_id: id,
    sort: blocks.length,
    text,
    locked: false,
    created_at: now,
    updated_at: now,
  });

  // Place the new id after `after` (or at the end when missing/unknown), then
  // renumber the whole list densely.
  const ordered = blocks.map((b) => b.id);
  let pos = ordered.length;
  if (after) {
    const i = ordered.indexOf(after);
    if (i >= 0) pos = i + 1;
  }
  ordered.splice(pos, 0, newId);
  await renumber(db, ordered);

  const refreshed = await recomputeContent(c, id);
  const block = refreshed.find((b) => b.id === newId)!;
  return c.json({ block: toPublicBlock(block), blocks: refreshed.map(toPublicBlock) }, 201);
});

// POST /:id/blocks/reorder — set the order to `ids`, which must be exactly the
// entry's block ids (same size and members). Recomputes content. PAT allowed.
alma.post('/:id/blocks/reorder', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  let body: { ids?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!Array.isArray(body.ids) || !body.ids.every((x) => typeof x === 'string')) {
    return c.json({ error: 'ids must be an array of strings', field: 'ids' }, 400);
  }
  const ids = body.ids as string[];

  const doc = await getOwnedAlma(db, id, user.userId);
  if (!doc) return c.json({ error: 'Not found' }, 404);

  const blocks = await listBlocks(db, id);
  const current = new Set(blocks.map((b) => b.id));
  const next = new Set(ids);
  const sameSet =
    ids.length === blocks.length &&
    next.size === ids.length &&
    [...current].every((x) => next.has(x));
  if (!sameSet) {
    return c.json({ error: 'ids must be exactly the block ids of this entry', field: 'ids' }, 400);
  }

  await renumber(db, ids);
  const refreshed = await recomputeContent(c, id);
  return c.json({ blocks: refreshed.map(toPublicBlock) });
});

// PATCH /:id/blocks/:bid/lock — lock/unlock a block. Human session only: an
// agent (PAT) can never lock or unlock, so it can never unlock to edit. Does not
// change text, so content is left untouched.
alma.patch('/:id/blocks/:bid/lock', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');
  const bid = c.req.param('bid');

  if (c.get('tokenKind') === 'pat') {
    return c.json({ error: 'only a human session can lock/unlock' }, 403);
  }

  let body: { locked?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  if (typeof body.locked !== 'boolean') {
    return c.json({ error: 'locked must be a boolean', field: 'locked' }, 400);
  }

  const doc = await getOwnedAlma(db, id, user.userId);
  if (!doc) return c.json({ error: 'Not found' }, 404);

  const [block] = await db
    .select()
    .from(schema.almaBlocks)
    .where(and(eq(schema.almaBlocks.id, bid), eq(schema.almaBlocks.alma_id, id)))
    .limit(1);
  if (!block) return c.json({ error: 'Not found' }, 404);

  const now = new Date().toISOString();
  await db
    .update(schema.almaBlocks)
    .set({ locked: body.locked, updated_at: now })
    .where(eq(schema.almaBlocks.id, bid));

  const [updated] = await db
    .select()
    .from(schema.almaBlocks)
    .where(eq(schema.almaBlocks.id, bid))
    .limit(1);
  return c.json({ block: toPublicBlock(updated) });
});

// PATCH /:id/blocks/:bid — edit a block's text. Locked blocks are 403 (an agent
// can't even unlock). Recomputes content. PAT allowed when unlocked.
alma.patch('/:id/blocks/:bid', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');
  const bid = c.req.param('bid');

  let body: { text?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  if (typeof body.text !== 'string') {
    return c.json({ error: 'text is required', field: 'text' }, 400);
  }
  if (body.text.length > MAX_BLOCK_TEXT) {
    return c.json({ error: `text must be <= ${MAX_BLOCK_TEXT} chars`, field: 'text' }, 400);
  }

  const doc = await getOwnedAlma(db, id, user.userId);
  if (!doc) return c.json({ error: 'Not found' }, 404);

  const [block] = await db
    .select()
    .from(schema.almaBlocks)
    .where(and(eq(schema.almaBlocks.id, bid), eq(schema.almaBlocks.alma_id, id)))
    .limit(1);
  if (!block) return c.json({ error: 'Not found' }, 404);
  if (block.locked) return c.json({ error: 'block is locked' }, 403);

  const now = new Date().toISOString();
  await db
    .update(schema.almaBlocks)
    .set({ text: body.text, updated_at: now })
    .where(eq(schema.almaBlocks.id, bid));

  const refreshed = await recomputeContent(c, id);
  const updated = refreshed.find((b) => b.id === bid)!;
  return c.json({ block: toPublicBlock(updated), blocks: refreshed.map(toPublicBlock) });
});

// DELETE /:id/blocks/:bid — delete a block (403 if locked). Renumbers and
// recomputes content. PAT allowed when unlocked.
alma.delete('/:id/blocks/:bid', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');
  const bid = c.req.param('bid');

  const doc = await getOwnedAlma(db, id, user.userId);
  if (!doc) return c.json({ error: 'Not found' }, 404);

  const [block] = await db
    .select()
    .from(schema.almaBlocks)
    .where(and(eq(schema.almaBlocks.id, bid), eq(schema.almaBlocks.alma_id, id)))
    .limit(1);
  if (!block) return c.json({ error: 'Not found' }, 404);
  if (block.locked) return c.json({ error: 'block is locked' }, 403);

  await db.delete(schema.almaBlocks).where(eq(schema.almaBlocks.id, bid));

  const remaining = (await listBlocks(db, id)).map((b) => b.id);
  await renumber(db, remaining);

  const refreshed = await recomputeContent(c, id);
  return c.json({ ok: true, blocks: refreshed.map(toPublicBlock) });
});

// GET /:id — single document owned by the current user.
alma.get('/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const [row] = await db
    .select()
    .from(schema.almaDocuments)
    .where(eq(schema.almaDocuments.id, id))
    .limit(1);

  if (!row || row.user_id !== user.userId) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(toPublicAlma(row));
});

// PATCH /:id — update fields. Re-derives `source` server-side. Won't let a doc
// become a second Tier 0.
alma.patch('/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const [row] = await db
    .select()
    .from(schema.almaDocuments)
    .where(eq(schema.almaDocuments.id, id))
    .limit(1);

  if (!row || row.user_id !== user.userId) {
    return c.json({ error: 'Not found' }, 404);
  }

  const updates: Partial<AlmaRow> = {};

  // tier
  if (body.tier !== undefined) {
    if (!isValidTier(body.tier)) {
      return c.json({ error: 'tier must be 0, 1 or 2', field: 'tier' }, 400);
    }
    // Only the canonical core (kind='alma') may be tier 0; never promote another
    // doc to a second tier 0.
    if (body.tier === 0 && row.kind !== 'alma') {
      return c.json({ error: 'cannot set a second Tier 0 document', field: 'tier' }, 400);
    }
    updates.tier = body.tier;
  }

  // kind
  if (body.kind !== undefined) {
    if (typeof body.kind !== 'string') {
      return c.json({ error: 'kind must be a string', field: 'kind' }, 400);
    }
    const kind = body.kind.trim();
    if (kind.length < 1 || kind.length > 60 || !KIND_RE.test(kind)) {
      return c.json({ error: 'kind must be a slug-ish string, 1-60 chars', field: 'kind' }, 400);
    }
    updates.kind = kind;
  }

  // title
  if (body.title !== undefined) {
    if (typeof body.title !== 'string') {
      return c.json({ error: 'title must be a string', field: 'title' }, 400);
    }
    const title = body.title.trim();
    if (title.length < 1 || title.length > 120) {
      return c.json({ error: 'title must be 1-120 chars', field: 'title' }, 400);
    }
    updates.title = title;
  }

  // content
  if (body.content !== undefined) {
    if (typeof body.content !== 'string') {
      return c.json({ error: 'content must be a string', field: 'content' }, 400);
    }
    updates.content = body.content;
  }

  // tags
  if (body.tags !== undefined) {
    const tagsResult = validateTags(body.tags);
    if (!tagsResult.ok) {
      return c.json({ error: tagsResult.error, field: 'tags' }, 400);
    }
    updates.tags = JSON.stringify(tagsResult.tags);
  }

  // sort
  if (body.sort !== undefined) {
    if (typeof body.sort !== 'number' || !Number.isInteger(body.sort)) {
      return c.json({ error: 'sort must be an integer', field: 'sort' }, 400);
    }
    updates.sort = body.sort;
  }

  const now = new Date().toISOString();
  await db
    .update(schema.almaDocuments)
    .set({ ...updates, source: resolveSource(c), updated_at: now })
    .where(eq(schema.almaDocuments.id, id));

  const [updated] = await db
    .select()
    .from(schema.almaDocuments)
    .where(eq(schema.almaDocuments.id, id))
    .limit(1);

  return c.json(toPublicAlma(updated));
});

// DELETE /:id — hard delete. The Tier 0 core (kind='alma') can only be emptied,
// never deleted.
alma.delete('/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const [row] = await db
    .select()
    .from(schema.almaDocuments)
    .where(eq(schema.almaDocuments.id, id))
    .limit(1);

  if (!row || row.user_id !== user.userId) {
    return c.json({ error: 'Not found' }, 404);
  }

  if (row.kind === 'alma') {
    return c.json({ error: 'Tier 0 core cannot be deleted; edit it instead' }, 400);
  }

  // A locked block is approved content the human pinned. An agent (PAT) must not
  // be able to wipe it by deleting the whole parent entry — that would launder
  // around the per-block lock. A human session may still delete.
  if (c.get('tokenKind') === 'pat') {
    const blocks = await listBlocks(db, id);
    if (blocks.some((b) => b.locked)) {
      return c.json({ error: 'entry has locked blocks; only a human session can delete it' }, 403);
    }
  }

  await db.delete(schema.almaDocuments).where(eq(schema.almaDocuments.id, id));

  return c.json({ ok: true });
});

export default alma;
