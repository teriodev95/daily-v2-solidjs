import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { Env, Variables, AppDb } from '../types';
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

  await db.delete(schema.almaDocuments).where(eq(schema.almaDocuments.id, id));

  return c.json({ ok: true });
});

export default alma;
