import { Hono } from 'hono';
import { eq, and, or, like, sql, isNull } from 'drizzle-orm';
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
  if (projectsRaw && projectsRaw !== '__all__') {
    const parts = projectsRaw.split(',').map(s => s.trim()).filter(Boolean);
    projectIds = parts.length > 0 ? parts : null;
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
    if (projectIds && (!s.project_id || !projectIds.includes(s.project_id))) return false;
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
  const byUpdatedDesc = (a: typeof filtered[number], b: typeof filtered[number]) =>
    (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
  const byCompletedDesc = (a: typeof filtered[number], b: typeof filtered[number]) =>
    (b.completed_at ?? '').localeCompare(a.completed_at ?? '');

  const backlogItems = [...byStatus.backlog].sort(byUpdatedDesc).slice(0, 10);
  const todoItems = [...byStatus.todo].sort(byUpdatedDesc).slice(0, 10);
  const inProgressItems = [...byStatus.in_progress].sort(byUpdatedDesc).slice(0, 20);
  const doneItems = [...doneInRange].sort(byCompletedDesc).slice(0, 5);

  // --- attach assignees for the stories actually returned ---------------
  const returnedIds = new Set<string>();
  for (const arr of [backlogItems, todoItems, inProgressItems, doneItems]) {
    for (const s of arr) returnedIds.add(s.id);
  }

  const assigneeMap = new Map<string, string[]>();
  if (returnedIds.size > 0) {
    const allAssignees = await db.select().from(schema.storyAssignees);
    for (const a of allAssignees) {
      if (!returnedIds.has(a.story_id)) continue;
      const arr = assigneeMap.get(a.story_id) ?? [];
      arr.push(a.user_id);
      assigneeMap.set(a.story_id, arr);
    }
  }

  const shape = (s: typeof filtered[number]) =>
    parseRecurrenceDays({ ...s, assignees: assigneeMap.get(s.id) ?? [] });

  return c.json({
    backlog:     { items: backlogItems.map(shape),    total: byStatus.backlog.length },
    todo:        { items: todoItems.map(shape),       total: byStatus.todo.length },
    in_progress: { items: inProgressItems.map(shape), total: byStatus.in_progress.length },
    done:        { items: doneItems.map(shape),       total: doneInRange.length },
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
  if (projectId) rows = rows.filter(s => s.project_id === projectId);
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
    rows = rows.filter(s => s.assignee_id === assigneeId || linkedStoryIds.has(s.id));
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

  await db.insert(schema.stories).values({
    id,
    project_id: body.project_id ?? null,
    team_id: user.teamId,
    code: body.code ?? null,
    title: body.title,
    description: body.description ?? '',
    priority: body.priority as any ?? 'medium',
    estimate: body.estimate ?? 0,
    status: body.status as any ?? 'backlog',
    category: body.category as any ?? null,
    assignee_id: body.assignee_id ?? null,
    created_by: user.userId,
    due_date: body.due_date ?? null,
    scheduled_date: body.scheduled_date ?? null,
    is_shared: body.is_shared ?? false,
    sort_order: body.sort_order ?? 0,
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

  const [created] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);
  const assigneeLinks = await db.select().from(schema.storyAssignees).where(eq(schema.storyAssignees.story_id, id));

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), { type: 'story.created', id }, c.req.header('x-client-id')),
  );

  return c.json(parseRecurrenceDays({ ...created, assignees: assigneeLinks.map(a => a.user_id) }), 201);
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

  const { assignees, ...fields } = body;
  delete (fields as any).purpose;
  delete (fields as any).objective;

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
  if (Object.keys(fields).length > 0) {
    await db
      .update(schema.stories)
      .set({ ...fields, updated_at: new Date().toISOString() } as any)
      .where(eq(schema.stories.id, id));
  }

  const [storyAfterFields] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);

  if (assignees !== undefined) {
    const extraAssignees = Array.isArray(assignees)
      ? [...new Set(assignees.filter((uid): uid is string => typeof uid === 'string' && uid && uid !== storyAfterFields?.assignee_id))]
      : [];

    await db.delete(schema.storyAssignees).where(eq(schema.storyAssignees.story_id, id));
    for (const uid of extraAssignees) {
      await db.insert(schema.storyAssignees).values({ story_id: id, user_id: uid });
    }
  }

  const [updated] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);
  const assigneeLinks = await db.select().from(schema.storyAssignees).where(eq(schema.storyAssignees.story_id, id));

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), { type: 'story.updated', id }, c.req.header('x-client-id')),
  );

  return c.json(parseRecurrenceDays({ ...updated, assignees: assigneeLinks.map(a => a.user_id) }));
});

stories.delete('/:id', requireAdmin, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');

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
    publish(c.env, teamChannel(user.teamId), { type: 'story.deleted', id }, c.req.header('x-client-id')),
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

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), { type: 'story.updated', id: storyId }, c.req.header('x-client-id')),
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

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), { type: 'story.updated', id: storyId }, c.req.header('x-client-id')),
  );

  return c.json(updated);
});

stories.post('/:id/assignees', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const storyId = c.req.param('id');
  const { user_id } = await c.req.json<{ user_id: string }>();

  await db.insert(schema.storyAssignees).values({ story_id: storyId, user_id });

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), { type: 'story.updated', id: storyId }, c.req.header('x-client-id')),
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

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), { type: 'story.updated', id: storyId }, c.req.header('x-client-id')),
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
