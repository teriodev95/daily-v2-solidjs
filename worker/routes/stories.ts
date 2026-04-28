import { Hono } from 'hono';
import { eq, and, or, like, sql, isNull } from 'drizzle-orm';
import * as Y from 'yjs';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';
import { requireAdmin } from '../middleware/auth';
import {
  generateShareToken,
  hashToken,
  shareTokenPrefix,
} from '../lib/tokenCrypto';
import { publish, teamChannel } from '../lib/realtime';

const stories = new Hono<{ Bindings: Env; Variables: Variables }>();

const parseRecurrenceDays = (s: any) => ({
  ...s,
  recurrence_days: s.recurrence_days ? JSON.parse(s.recurrence_days) : null,
});

type StoryStatus = 'backlog' | 'todo' | 'in_progress' | 'done';

const VALID_STATUSES: StoryStatus[] = ['backlog', 'todo', 'in_progress', 'done'];
const ORDER_STEP = 1024;
const UNPROJECTED_FILTER_ID = '__unprojected__';

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

const buildStoryDoc = async (
  d1: D1Database,
  storyId: string,
  fallbackDescription: string,
): Promise<Y.Doc> => {
  const { results } = await d1
    .prepare('SELECT hex("update") AS update_hex FROM story_doc_updates WHERE story_id = ? ORDER BY id ASC')
    .bind(storyId)
    .all<{ update_hex: string }>();
  const doc = new Y.Doc();
  for (const r of results ?? []) {
    try { Y.applyUpdate(doc, fromHex(r.update_hex)); } catch { /* skip malformed */ }
  }
  const text = doc.getText('description');
  if (text.length === 0 && fallbackDescription) {
    text.insert(0, fallbackDescription);
  }
  return doc;
};

const createDescriptionReplacementUpdate = (doc: Y.Doc, nextDescription: string): Uint8Array | null => {
  const text = doc.getText('description');
  if (text.toString() === nextDescription) return null;
  let captured: Uint8Array | null = null;
  const onUpdate = (update: Uint8Array) => { captured = update; };
  doc.on('update', onUpdate);
  doc.transact(() => {
    const len = text.length;
    if (len > 0) text.delete(0, len);
    if (nextDescription) text.insert(0, nextDescription);
  }, 'server-patch');
  doc.off('update', onUpdate);
  return captured;
};

const attachAssignees = async <T extends { id: string }>(db: Variables['db'], rows: T[]) => {
  if (rows.length === 0) return [];
  const ids = new Set(rows.map((row) => row.id));
  const assigneeMap = new Map<string, string[]>();
  const allAssignees = await db.select().from(schema.storyAssignees);
  for (const a of allAssignees) {
    if (!ids.has(a.story_id)) continue;
    const arr = assigneeMap.get(a.story_id) ?? [];
    arr.push(a.user_id);
    assigneeMap.set(a.story_id, arr);
  }
  return rows.map((row) => parseRecurrenceDays({ ...row, assignees: assigneeMap.get(row.id) ?? [] }));
};

const loadStoryWithAssignees = async (db: Variables['db'], storyId: string) => {
  const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, storyId)).limit(1);
  if (!story) return null;
  const [shaped] = await attachAssignees(db, [story]);
  return shaped ?? null;
};

const sortBoardRows = <T extends { sort_order: number; updated_at: string }>(rows: T[]) => {
  const seen = new Set<number>();
  const hasUsableManualOrder = rows.length > 0 && rows.every((row) => {
    const order = Number(row.sort_order);
    if (!Number.isFinite(order) || order <= 0 || seen.has(order)) return false;
    seen.add(order);
    return true;
  });
  return [...rows].sort((a, b) => {
    if (hasUsableManualOrder) {
      const byOrder = a.sort_order - b.sort_order;
      if (byOrder !== 0) return byOrder;
    }
    return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
  });
};

const normalizeStatusOrder = async (
  db: Variables['db'],
  teamId: string,
  status: StoryStatus,
) => {
  const rows = await db
    .select()
    .from(schema.stories)
    .where(and(
      eq(schema.stories.team_id, teamId),
      eq(schema.stories.status, status),
      eq(schema.stories.is_active, true),
    ));
  const ordered = sortBoardRows(rows);
  for (let i = 0; i < ordered.length; i += 1) {
    await db
      .update(schema.stories)
      .set({ sort_order: (i + 1) * ORDER_STEP } as any)
      .where(eq(schema.stories.id, ordered[i].id));
  }
};

const nextTopOrder = async (
  db: Variables['db'],
  teamId: string,
  status: StoryStatus,
) => {
  const rows = await db
    .select({ sort_order: schema.stories.sort_order })
    .from(schema.stories)
    .where(and(
      eq(schema.stories.team_id, teamId),
      eq(schema.stories.status, status),
      eq(schema.stories.is_active, true),
    ));
  const positive = rows
    .map((row) => Number(row.sort_order))
    .filter((order) => Number.isFinite(order) && order > 0);
  if (positive.length === 0) return ORDER_STEP;
  return Math.max(1, Math.min(...positive) - ORDER_STEP);
};

const calculateMoveOrder = async (
  db: Variables['db'],
  teamId: string,
  toStatus: StoryStatus,
  beforeId: string | null,
  afterId: string | null,
): Promise<number> => {
  const loadNeighbor = async (id: string | null) => {
    if (!id) return null;
    const [row] = await db
      .select({ id: schema.stories.id, status: schema.stories.status, sort_order: schema.stories.sort_order, team_id: schema.stories.team_id })
      .from(schema.stories)
      .where(eq(schema.stories.id, id))
      .limit(1);
    if (!row || row.team_id !== teamId || row.status !== toStatus) return null;
    return row;
  };

  let before = await loadNeighbor(beforeId);
  let after = await loadNeighbor(afterId);

  if (!before && !after) return nextTopOrder(db, teamId, toStatus);
  if (!after && before) return before.sort_order - ORDER_STEP;
  if (after && !before) return after.sort_order + ORDER_STEP;
  if (before && after && before.sort_order - after.sort_order > 1) {
    return Math.floor((before.sort_order + after.sort_order) / 2);
  }

  await normalizeStatusOrder(db, teamId, toStatus);
  before = await loadNeighbor(beforeId);
  after = await loadNeighbor(afterId);
  if (!before && !after) return nextTopOrder(db, teamId, toStatus);
  if (!after && before) return before.sort_order - ORDER_STEP;
  if (after && !before) return after.sort_order + ORDER_STEP;
  if (before && after) return Math.floor((before.sort_order + after.sort_order) / 2);
  return ORDER_STEP;
};

/**
 * Kanban view endpoint — returns 4 pre-paginated buckets (one per status)
 * in a single request. Designed for the kanban UI: avoids 4 round-trips and
 * keeps per-bucket caps server-side so clients can't accidentally over-fetch.
 *
 * Query params:
 *   - scope: 'mine' (default) | 'all'
 *   - projects: comma-separated project ids, or '__all__' for no filter
 *   - done_range: 'week' (default) | 'month' | 'all' — applies only to done bucket
 *
 * Per-bucket caps (hardcoded):
 *   backlog: 10 by updated_at DESC
 *   todo: 10 by updated_at DESC
 *   in_progress: 20 by updated_at DESC (soft cap — rarely hit in practice)
 *   done: 5 by completed_at DESC within done_range
 *
 * `total` is the filter-matching count regardless of cap; for done it reflects
 * the configured date range so the UI can show "5 of N this week".
 */
stories.get('/kanban', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  // --- parse + validate params -------------------------------------------
  const scopeRaw = c.req.query('scope');
  const scope: 'mine' | 'all' = scopeRaw === 'all' ? 'all' : 'mine';

  const projectsRaw = c.req.query('projects');
  let projectIds: string[] | null = null; // null = no project filter
  let includeUnprojected = false;
  if (projectsRaw && projectsRaw !== '__all__') {
    const parts = projectsRaw.split(',').map(s => s.trim()).filter(Boolean);
    includeUnprojected = parts.includes(UNPROJECTED_FILTER_ID);
    projectIds = parts.filter((id) => id !== UNPROJECTED_FILTER_ID);
    if (projectIds.length === 0 && !includeUnprojected) projectIds = null;
  }

  const doneRangeRaw = c.req.query('done_range');
  const doneRange: 'week' | 'month' | 'all' =
    doneRangeRaw === 'month' || doneRangeRaw === 'all' ? doneRangeRaw : 'week';

  let doneCutoffIso: string | null = null;
  if (doneRange === 'week') {
    doneCutoffIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (doneRange === 'month') {
    doneCutoffIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  // --- resolve assignee link set once if scope=mine ----------------------
  // `story_assignees` links extra assignees beyond the primary `assignee_id`.
  // We fetch the user's linked story ids up front so bucket filtering stays
  // in-memory and consistent across all 4 buckets.
  let myLinkedStoryIds: Set<string> | null = null;
  if (scope === 'mine') {
    const links = await db
      .select()
      .from(schema.storyAssignees)
      .where(eq(schema.storyAssignees.user_id, user.userId));
    myLinkedStoryIds = new Set(links.map(l => l.story_id));
  }

  // Base filter: team isolation + active. Everything else runs in-memory
  // because Drizzle+D1 has limited dynamic-predicate support and row counts
  // per team are small enough (< a few thousand) for this to be fine.
  const baseRows = await db
    .select()
    .from(schema.stories)
    .where(
      and(
        eq(schema.stories.team_id, user.teamId),
        eq(schema.stories.is_active, true),
      ),
    );

  const matchesFilters = (s: typeof baseRows[number]) => {
    if (projectIds || includeUnprojected) {
      if (!s.project_id) return includeUnprojected;
      if (!projectIds?.includes(s.project_id)) return false;
    }
    if (scope === 'mine') {
      const mine =
        s.assignee_id === user.userId ||
        s.created_by === user.userId ||
        (myLinkedStoryIds?.has(s.id) ?? false);
      if (!mine) return false;
    }
    return true;
  };

  const filtered = baseRows.filter(matchesFilters);

  // --- split by status ---------------------------------------------------
  const byStatus = {
    backlog: [] as typeof filtered,
    todo: [] as typeof filtered,
    in_progress: [] as typeof filtered,
    done: [] as typeof filtered,
  };
  for (const s of filtered) {
    if (s.status in byStatus) byStatus[s.status as keyof typeof byStatus].push(s);
  }

  // done bucket is filtered by completed_at range BEFORE counting total,
  // per spec: "total count within the done_range".
  const doneInRange = doneCutoffIso
    ? byStatus.done.filter(s => s.completed_at && s.completed_at >= doneCutoffIso)
    : byStatus.done;

  // --- sort + cap per bucket --------------------------------------------
  const byCompletedDesc = (a: typeof filtered[number], b: typeof filtered[number]) =>
    (b.completed_at ?? '').localeCompare(a.completed_at ?? '');

  const backlogItems = sortBoardRows(byStatus.backlog).slice(0, 50);
  const todoItems = sortBoardRows(byStatus.todo).slice(0, 50);
  const inProgressItems = sortBoardRows(byStatus.in_progress).slice(0, 80);
  const doneItems = [...doneInRange].sort(byCompletedDesc).slice(0, 5);

  const [backlogShaped, todoShaped, inProgressShaped, doneShaped] = await Promise.all([
    attachAssignees(db, backlogItems),
    attachAssignees(db, todoItems),
    attachAssignees(db, inProgressItems),
    attachAssignees(db, doneItems),
  ]);

  return c.json({
    backlog:     { items: backlogShaped,    total: byStatus.backlog.length },
    todo:        { items: todoShaped,       total: byStatus.todo.length },
    in_progress: { items: inProgressShaped, total: byStatus.in_progress.length },
    done:        { items: doneShaped,       total: doneInRange.length },
  });
});

// Full-text search across title, description, code
stories.get('/search', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const q = (c.req.query('q') ?? '').trim();

  if (!q || q.length < 2) return c.json([]);

  const pattern = `%${q}%`;

  // SQLite LIKE is case-insensitive for ASCII by default
  const rows = await db
    .select()
    .from(schema.stories)
    .where(
      and(
        eq(schema.stories.team_id, user.teamId),
        eq(schema.stories.is_active, true),
        or(
          like(schema.stories.title, pattern),
          like(schema.stories.description, pattern),
          like(schema.stories.code, pattern),
        ),
      ),
    )
    .limit(20);

  // Attach assignees
  const storyIds = rows.map(s => s.id);
  const assigneeMap = new Map<string, string[]>();
  if (storyIds.length > 0) {
    const allAssignees = await db.select().from(schema.storyAssignees);
    for (const a of allAssignees) {
      if (!storyIds.includes(a.story_id)) continue;
      const arr = assigneeMap.get(a.story_id) ?? [];
      arr.push(a.user_id);
      assigneeMap.set(a.story_id, arr);
    }
  }

  return c.json(rows.map(s => parseRecurrenceDays({ ...s, assignees: assigneeMap.get(s.id) ?? [] })));
});

stories.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  const projectId = c.req.query('project_id');
  const category = c.req.query('category');
  const status = c.req.query('status');
  const assigneeId = c.req.query('assignee_id');
  const isShared = c.req.query('is_shared');
  const includeInactive = c.req.query('include_inactive') === 'true';
  const completedAfter = c.req.query('completed_after');
  const completedBefore = c.req.query('completed_before');

  let rows = await db.select().from(schema.stories).where(eq(schema.stories.team_id, user.teamId));

  if (!includeInactive) rows = rows.filter(s => s.is_active);
  if (projectId === UNPROJECTED_FILTER_ID) {
    rows = rows.filter(s => !s.project_id);
  } else if (projectId) {
    rows = rows.filter(s => s.project_id === projectId);
  }
  if (category) rows = rows.filter(s => s.category === category);
  if (status) rows = rows.filter(s => s.status === status);
  if (isShared === 'true') rows = rows.filter(s => s.is_shared);

  // Date-range filters on completed_at — stories without a completed_at are
  // excluded when either bound is present (you can't date-filter an unfinished
  // story). ISO-8601 lexicographic ordering means string compare is fine.
  // Invalid date strings are ignored gracefully (no filter applied) rather
  // than silently returning zero results.
  const isValidDateString = (v: string) => !Number.isNaN(Date.parse(v));
  if (completedAfter && isValidDateString(completedAfter)) {
    rows = rows.filter(s => !!s.completed_at && s.completed_at >= completedAfter);
  }
  if (completedBefore && isValidDateString(completedBefore)) {
    rows = rows.filter(s => !!s.completed_at && s.completed_at <= completedBefore);
  }

  if (assigneeId) {
    const assigneeLinks = await db
      .select()
      .from(schema.storyAssignees)
      .where(eq(schema.storyAssignees.user_id, assigneeId));
    const linkedStoryIds = new Set(assigneeLinks.map(l => l.story_id));
    rows = rows.filter(s => s.assignee_id === assigneeId || s.created_by === assigneeId || linkedStoryIds.has(s.id));
  }

  // Pagination (only when explicitly requested).
  // limit: clamped to [1, 200]; NaN/<1 falls back to default 50.
  // offset: clamped to >= 0; NaN/<0 falls back to 0.
  const isPaginated = c.req.query('limit') !== undefined || c.req.query('offset') !== undefined;
  const total = rows.length;
  let limit = 50;
  let offset = 0;
  if (isPaginated) {
    const limitRaw = parseInt(c.req.query('limit') ?? '50', 10);
    limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
    const offsetRaw = parseInt(c.req.query('offset') ?? '0', 10);
    offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    rows = rows.slice(offset, offset + limit);
  }

  // Attach assignees array to each story
  const allAssignees = await db.select().from(schema.storyAssignees);
  const assigneeMap = new Map<string, string[]>();
  for (const a of allAssignees) {
    const arr = assigneeMap.get(a.story_id) ?? [];
    arr.push(a.user_id);
    assigneeMap.set(a.story_id, arr);
  }

  const result = rows.map(s => parseRecurrenceDays({
    ...s,
    assignees: assigneeMap.get(s.id) ?? [],
  }));

  if (isPaginated) {
    return c.json({ data: result, total, limit, offset });
  }
  return c.json(result);
});

stories.post('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json<{
    project_id?: string;
    code?: string;
    title: string;
    description?: string;
    priority?: string;
    estimate?: number;
    status?: string;
    category?: string;
    assignee_id?: string;
    assignees?: string[];
    due_date?: string;
    scheduled_date?: string;
    is_shared?: boolean;
    sort_order?: number;
    frequency?: string;
    day_of_week?: number;
    day_of_month?: number;
    recurrence_days?: number[];
    recurring_parent_id?: string;
  }>();

  // Validation
  if (!body.title?.trim()) {
    return c.json({ error: 'title is required', field: 'title' }, 400);
  }
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  if (body.priority && !validPriorities.includes(body.priority)) {
    return c.json({ error: `priority must be one of: ${validPriorities.join(', ')}`, field: 'priority' }, 400);
  }
  const validStatuses = ['backlog', 'todo', 'in_progress', 'done'];
  if (body.status && !validStatuses.includes(body.status)) {
    return c.json({ error: `status must be one of: ${validStatuses.join(', ')}`, field: 'status' }, 400);
  }
  const validFrequencies = ['daily', 'weekly', 'monthly'];
  if (body.frequency && !validFrequencies.includes(body.frequency)) {
    return c.json({ error: `frequency must be one of: ${validFrequencies.join(', ')}`, field: 'frequency' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const extraAssignees = [...new Set((body.assignees ?? []).filter(uid => uid && uid !== body.assignee_id))];
  const status = (body.status as StoryStatus | undefined) ?? 'backlog';
  const sortOrder = typeof body.sort_order === 'number'
    ? body.sort_order
    : await nextTopOrder(db, user.teamId, status);

  await db.insert(schema.stories).values({
    id,
    project_id: body.project_id ?? null,
    team_id: user.teamId,
    code: body.code ?? null,
    title: body.title,
    description: body.description ?? '',
    priority: body.priority as any ?? 'medium',
    estimate: body.estimate ?? 0,
    status,
    category: body.category as any ?? null,
    assignee_id: body.assignee_id ?? null,
    created_by: user.userId,
    due_date: body.due_date ?? null,
    scheduled_date: body.scheduled_date ?? null,
    is_shared: body.is_shared ?? false,
    sort_order: sortOrder,
    frequency: body.frequency as any ?? null,
    day_of_week: body.day_of_week ?? null,
    day_of_month: body.day_of_month ?? null,
    recurrence_days: body.recurrence_days ? JSON.stringify(body.recurrence_days) : null,
    recurring_parent_id: body.recurring_parent_id ?? null,
    created_at: now,
    updated_at: now,
  });

  if (extraAssignees.length) {
    for (const uid of extraAssignees) {
      await db.insert(schema.storyAssignees).values({ story_id: id, user_id: uid });
    }
  }

  const created = await loadStoryWithAssignees(db, id);
  if (!created) return c.json({ error: 'Not found' }, 404);

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), { type: 'story.created', id, story: created }, c.req.header('x-client-id')),
  );

  return c.json(created, 201);
});

stories.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);
  if (!story) return c.json({ error: 'Not found' }, 404);

  const criteria = await db
    .select()
    .from(schema.acceptanceCriteria)
    .where(eq(schema.acceptanceCriteria.story_id, id));

  const assigneeLinks = await db
    .select()
    .from(schema.storyAssignees)
    .where(eq(schema.storyAssignees.story_id, id));

  return c.json(parseRecurrenceDays({
    ...story,
    assignees: assigneeLinks.map(a => a.user_id),
    criteria,
  }));
});

stories.patch('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const [existingBeforeUpdate] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);
  if (!existingBeforeUpdate || existingBeforeUpdate.team_id !== user.teamId) {
    return c.json({ error: 'Not found' }, 404);
  }

  const { assignees, ...fields } = body;
  delete (fields as any).purpose;
  delete (fields as any).objective;

  const expectedUpdatedAt = (fields as any).expected_updated_at;
  delete (fields as any).expected_updated_at;

  if (typeof expectedUpdatedAt === 'string') {
    if (existingBeforeUpdate.updated_at !== expectedUpdatedAt) {
      const currentCriteria = await db
        .select()
        .from(schema.acceptanceCriteria)
        .where(eq(schema.acceptanceCriteria.story_id, id));
      const currentAssigneeLinks = await db
        .select()
        .from(schema.storyAssignees)
        .where(eq(schema.storyAssignees.story_id, id));
      return c.json({
        error: 'version_conflict',
        current: parseRecurrenceDays({
          ...existingBeforeUpdate,
          assignees: currentAssigneeLinks.map(a => a.user_id),
          criteria: currentCriteria,
        }),
      }, 409);
    }
  }

  // Validate known fields
  if (fields.priority !== undefined) {
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(fields.priority as string)) {
      return c.json({ error: `priority must be one of: ${validPriorities.join(', ')}`, field: 'priority' }, 400);
    }
  }
  if (fields.status !== undefined) {
    const validStatuses = ['backlog', 'todo', 'in_progress', 'done'];
    if (!validStatuses.includes(fields.status as string)) {
      return c.json({ error: `status must be one of: ${validStatuses.join(', ')}`, field: 'status' }, 400);
    }
  }

  if (fields.recurrence_days !== undefined) {
    fields.recurrence_days = fields.recurrence_days ? JSON.stringify(fields.recurrence_days) : null;
  }

  let docUpdateB64: string | null = null;
  if (typeof fields.description === 'string') {
    const doc = await buildStoryDoc(c.env.DB, id, existingBeforeUpdate.description ?? '');
    const update = createDescriptionReplacementUpdate(doc, fields.description);
    if (update) {
      const now = new Date().toISOString();
      await c.env.DB
        .prepare('INSERT INTO story_doc_updates (story_id, "update", created_at) VALUES (?, ?, ?)')
        .bind(id, toArrayBuffer(update), now)
        .run();
      docUpdateB64 = toBase64(update);
    }
  }

  if (fields.status !== undefined && fields.status !== existingBeforeUpdate.status) {
    if (fields.status === 'done' && !fields.completed_at) {
      fields.completed_at = new Date().toISOString();
    } else if (existingBeforeUpdate.status === 'done' && fields.status !== 'done' && fields.completed_at === undefined) {
      fields.completed_at = null;
    }
  }
  if (Object.keys(fields).length > 0) {
    await db
      .update(schema.stories)
      .set({ ...fields, updated_at: new Date().toISOString() } as any)
      .where(eq(schema.stories.id, id));
  }

  const [storyAfterFields] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);

  if (assignees !== undefined) {
    const extraAssignees = Array.isArray(assignees)
      ? [...new Set(assignees.filter((uid): uid is string =>
          typeof uid === 'string' && uid.length > 0 && uid !== storyAfterFields?.assignee_id))]
      : [];

    await db.delete(schema.storyAssignees).where(eq(schema.storyAssignees.story_id, id));
    for (const uid of extraAssignees) {
      await db.insert(schema.storyAssignees).values({ story_id: id, user_id: uid });
    }
  }

  const updated = await loadStoryWithAssignees(db, id);
  if (!updated) return c.json({ error: 'Not found' }, 404);
  const changedFields = [
    ...Object.keys(fields),
    ...(assignees !== undefined ? ['assignees'] : []),
  ];

  c.executionCtx.waitUntil(
    Promise.all([
      publish(c.env, teamChannel(user.teamId), {
        type: 'story.updated',
        id,
        story: updated,
        previous_status: existingBeforeUpdate.status,
        changed_fields: changedFields,
      }, c.req.header('x-client-id')),
      ...(docUpdateB64
        ? [publish(c.env, teamChannel(user.teamId), {
            type: 'doc.update',
            story_id: id,
            update_b64: docUpdateB64,
          }, c.req.header('x-client-id'))]
        : []),
    ]),
  );

  return c.json(updated);
});

stories.post('/:id/move', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{
    to_status?: StoryStatus;
    before_id?: string | null;
    after_id?: string | null;
  }>();

  if (!body.to_status || !VALID_STATUSES.includes(body.to_status)) {
    return c.json({ error: `to_status must be one of: ${VALID_STATUSES.join(', ')}`, field: 'to_status' }, 400);
  }

  const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);
  if (!story || story.team_id !== user.teamId) return c.json({ error: 'Not found' }, 404);

  const fromStatus = story.status as StoryStatus;
  const toStatus = body.to_status;
  const beforeId = body.before_id ?? null;
  const afterId = body.after_id ?? null;
  const sortOrder = await calculateMoveOrder(db, user.teamId, toStatus, beforeId, afterId);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: toStatus,
    sort_order: sortOrder,
    updated_at: now,
  };
  if (fromStatus !== toStatus && toStatus === 'done') {
    patch.completed_at = now;
  } else if (fromStatus === 'done' && toStatus !== 'done') {
    patch.completed_at = null;
  }

  await db
    .update(schema.stories)
    .set(patch as any)
    .where(eq(schema.stories.id, id));

  const updated = await loadStoryWithAssignees(db, id);
  if (!updated) return c.json({ error: 'Not found' }, 404);

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), {
      type: 'story.moved',
      id,
      story: updated,
      from_status: fromStatus,
      to_status: toStatus,
      before_id: beforeId,
      after_id: afterId,
    }, c.req.header('x-client-id')),
  );

  return c.json(updated);
});

stories.delete('/:id', requireAdmin, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);
  if (!story || story.team_id !== user.teamId) return c.json({ error: 'Not found' }, 404);

  // Clean up R2 attachments
  const attachmentRows = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.story_id, id));
  if (attachmentRows.length > 0) {
    await c.env.BUCKET.delete(attachmentRows.map(a => a.r2_key));
  }

  await db.delete(schema.storyAssignees).where(eq(schema.storyAssignees.story_id, id));
  await db.delete(schema.acceptanceCriteria).where(eq(schema.acceptanceCriteria.story_id, id));
  await db.delete(schema.attachments).where(eq(schema.attachments.story_id, id));
  await db.delete(schema.stories).where(eq(schema.stories.id, id));

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), {
      type: 'story.deleted',
      id,
      previous_status: story.status,
    }, c.req.header('x-client-id')),
  );

  return c.json({ ok: true });
});

// Bulk create acceptance criteria
stories.post('/:id/criteria', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const storyId = c.req.param('id');
  const { criteria } = await c.req.json<{ criteria: { text: string; is_met?: boolean }[] }>();

  if (!criteria?.length) return c.json({ error: 'criteria array required' }, 400);

  const rows = criteria.map((item, i) => ({
    id: crypto.randomUUID(),
    story_id: storyId,
    text: item.text,
    is_met: item.is_met ?? false,
    sort_order: i,
  }));

  for (const row of rows) {
    await db.insert(schema.acceptanceCriteria).values(row);
  }
  const story = await loadStoryWithAssignees(db, storyId);

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), {
      type: 'story.updated',
      id: storyId,
      story,
      changed_fields: ['criteria'],
    }, c.req.header('x-client-id')),
  );

  return c.json({ ok: true, count: rows.length }, 201);
});

// Toggle acceptance criterion is_met
stories.patch('/:id/criteria/:criteriaId', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const storyId = c.req.param('id');
  const criteriaId = c.req.param('criteriaId');
  const body = await c.req.json<{ is_met: boolean }>();

  await db
    .update(schema.acceptanceCriteria)
    .set({ is_met: body.is_met })
    .where(eq(schema.acceptanceCriteria.id, criteriaId));

  const [updated] = await db
    .select()
    .from(schema.acceptanceCriteria)
    .where(eq(schema.acceptanceCriteria.id, criteriaId))
    .limit(1);

  if (!updated) return c.json({ error: 'Not found' }, 404);
  const story = await loadStoryWithAssignees(db, storyId);

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), {
      type: 'story.updated',
      id: storyId,
      story,
      changed_fields: ['criteria'],
    }, c.req.header('x-client-id')),
  );

  return c.json(updated);
});

stories.post('/:id/assignees', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const storyId = c.req.param('id');
  const { user_id } = await c.req.json<{ user_id: string }>();

  await db.insert(schema.storyAssignees).values({ story_id: storyId, user_id });
  const story = await loadStoryWithAssignees(db, storyId);

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), {
      type: 'story.updated',
      id: storyId,
      story,
      changed_fields: ['assignees'],
    }, c.req.header('x-client-id')),
  );

  return c.json({ ok: true }, 201);
});

stories.delete('/:id/assignees/:uid', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const storyId = c.req.param('id');
  const uid = c.req.param('uid');

  await db
    .delete(schema.storyAssignees)
    .where(and(eq(schema.storyAssignees.story_id, storyId), eq(schema.storyAssignees.user_id, uid)));
  const story = await loadStoryWithAssignees(db, storyId);

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), {
      type: 'story.updated',
      id: storyId,
      story,
      changed_fields: ['assignees'],
    }, c.req.header('x-client-id')),
  );

  return c.json({ ok: true });
});

/**
 * Mint a share-token URL for the story, scoped to the current user.
 *
 * Each (story, user) pair has at most one ACTIVE share token at a time:
 * calling this endpoint rotates the token — the previous active one is
 * revoked and a fresh one with a new 30-day TTL is issued.
 *
 * Auth: session cookie ONLY. PATs are explicitly rejected so an agent can't
 * mint a share URL to escalate its own access surface.
 */
stories.post('/:id/share-token', async (c) => {
  // PAT guard: share tokens are user-intent operations.
  if (c.get('tokenKind') === 'pat') {
    return c.json({ error: 'session_required' }, 403);
  }

  const user = c.get('user');
  const db = c.get('db');
  const storyId = c.req.param('id');

  // Verify the story exists AND belongs to the caller's team. We don't
  // differentiate "404" vs "403" to avoid leaking cross-team story ids.
  const [story] = await db
    .select()
    .from(schema.stories)
    .where(eq(schema.stories.id, storyId))
    .limit(1);
  if (!story || story.team_id !== user.teamId) {
    return c.json({ error: 'Not found' }, 404);
  }

  const nowIso = new Date().toISOString();

  // Revoke any existing active share token for this (story, user) BEFORE
  // creating the new one. A partial unique index (migration 0013) enforces
  // at most one active row per (story_id, user_id) — so this ordering is
  // required: attempting to insert before revoking would violate the
  // constraint.
  //
  // Other users of the same team keep their independent tokens.
  const existing = await db
    .select()
    .from(schema.storyShareTokens)
    .where(
      and(
        eq(schema.storyShareTokens.story_id, storyId),
        eq(schema.storyShareTokens.user_id, user.userId),
        isNull(schema.storyShareTokens.revoked_at),
      ),
    );

  let previousRevoked = false;
  if (existing.length > 0) {
    for (const row of existing) {
      await db
        .update(schema.storyShareTokens)
        .set({ revoked_at: nowIso })
        .where(eq(schema.storyShareTokens.id, row.id));
    }
    previousRevoked = true;
  }

  // Mint the new token. 30-day TTL, fixed.
  const rawToken = generateShareToken();
  const tokenHashHex = await hashToken(rawToken);
  const prefix = shareTokenPrefix(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const id = crypto.randomUUID();

  try {
    await db.insert(schema.storyShareTokens).values({
      id,
      story_id: storyId,
      user_id: user.userId,
      token_hash: tokenHashHex,
      prefix,
      expires_at: expiresAt,
      created_at: nowIso,
      revoked_at: null,
    });
  } catch (err) {
    // Likely a race on the partial unique index: a concurrent rotation
    // already minted a new active token for this (story, user). Ask the
    // client to retry rather than leaking the DB error.
    const msg = (err as Error)?.message ?? '';
    if (/UNIQUE/i.test(msg) || /constraint/i.test(msg)) {
      return c.json({ error: 'share_token_rotation_conflict' }, 409);
    }
    return c.json({ error: 'internal_error' }, 500);
  }

  // Build the absolute URL from the incoming request origin. This keeps
  // staging/dev deployments self-consistent without needing an env var.
  const origin = new URL(c.req.url).origin;
  const shareUrl = `${origin}/agent/story/${storyId}?s=${rawToken}`;

  return c.json({
    share_url: shareUrl,
    expires_at: expiresAt,
    previous_revoked: previousRevoked,
  });
});

export default stories;
