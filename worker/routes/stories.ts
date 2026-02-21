import { Hono } from 'hono';
import { eq, and, or, like, sql } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';
import { requireAdmin } from '../middleware/auth';

const stories = new Hono<{ Bindings: Env; Variables: Variables }>();

// Full-text search across title, description, purpose, objective, code
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
        or(
          like(schema.stories.title, pattern),
          like(schema.stories.description, pattern),
          like(schema.stories.purpose, pattern),
          like(schema.stories.objective, pattern),
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

  return c.json(rows.map(s => ({ ...s, assignees: assigneeMap.get(s.id) ?? [] })));
});

stories.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  const projectId = c.req.query('project_id');
  const category = c.req.query('category');
  const status = c.req.query('status');
  const assigneeId = c.req.query('assignee_id');
  const isShared = c.req.query('is_shared');

  let rows = await db.select().from(schema.stories).where(eq(schema.stories.team_id, user.teamId));

  if (projectId) rows = rows.filter(s => s.project_id === projectId);
  if (category) rows = rows.filter(s => s.category === category);
  if (status) rows = rows.filter(s => s.status === status);
  if (isShared === 'true') rows = rows.filter(s => s.is_shared);

  if (assigneeId) {
    const assigneeLinks = await db
      .select()
      .from(schema.storyAssignees)
      .where(eq(schema.storyAssignees.user_id, assigneeId));
    const linkedStoryIds = new Set(assigneeLinks.map(l => l.story_id));
    rows = rows.filter(s => s.assignee_id === assigneeId || linkedStoryIds.has(s.id));
  }

  // Attach assignees array to each story
  const allAssignees = await db.select().from(schema.storyAssignees);
  const assigneeMap = new Map<string, string[]>();
  for (const a of allAssignees) {
    const arr = assigneeMap.get(a.story_id) ?? [];
    arr.push(a.user_id);
    assigneeMap.set(a.story_id, arr);
  }

  const result = rows.map(s => ({
    ...s,
    assignees: assigneeMap.get(s.id) ?? [],
  }));

  return c.json(result);
});

stories.post('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json<{
    project_id?: string;
    code?: string;
    title: string;
    purpose?: string;
    description?: string;
    objective?: string;
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
    recurring_parent_id?: string;
  }>();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.stories).values({
    id,
    project_id: body.project_id ?? null,
    team_id: user.teamId,
    code: body.code ?? null,
    title: body.title,
    purpose: body.purpose ?? '',
    description: body.description ?? '',
    objective: body.objective ?? '',
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
    recurring_parent_id: body.recurring_parent_id ?? null,
    created_at: now,
    updated_at: now,
  });

  if (body.assignees?.length) {
    for (const uid of body.assignees) {
      await db.insert(schema.storyAssignees).values({ story_id: id, user_id: uid });
    }
  }

  const [created] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);
  const assigneeLinks = await db.select().from(schema.storyAssignees).where(eq(schema.storyAssignees.story_id, id));

  return c.json({ ...created, assignees: assigneeLinks.map(a => a.user_id) }, 201);
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

  return c.json({
    ...story,
    assignees: assigneeLinks.map(a => a.user_id),
    criteria,
  });
});

stories.patch('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();

  const { assignees, ...fields } = body;
  if (Object.keys(fields).length > 0) {
    await db
      .update(schema.stories)
      .set({ ...fields, updated_at: new Date().toISOString() } as any)
      .where(eq(schema.stories.id, id));
  }

  const [updated] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);
  const assigneeLinks = await db.select().from(schema.storyAssignees).where(eq(schema.storyAssignees.story_id, id));

  return c.json({ ...updated, assignees: assigneeLinks.map(a => a.user_id) });
});

stories.delete('/:id', requireAdmin, async (c) => {
  const db = c.get('db');
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

  return c.json({ ok: true });
});

// Bulk create acceptance criteria
stories.post('/:id/criteria', async (c) => {
  const db = c.get('db');
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

  return c.json({ ok: true, count: rows.length }, 201);
});

// Toggle acceptance criterion is_met
stories.patch('/:id/criteria/:criteriaId', async (c) => {
  const db = c.get('db');
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
  return c.json(updated);
});

stories.post('/:id/assignees', async (c) => {
  const db = c.get('db');
  const storyId = c.req.param('id');
  const { user_id } = await c.req.json<{ user_id: string }>();

  await db.insert(schema.storyAssignees).values({ story_id: storyId, user_id });
  return c.json({ ok: true }, 201);
});

stories.delete('/:id/assignees/:uid', async (c) => {
  const db = c.get('db');
  const storyId = c.req.param('id');
  const uid = c.req.param('uid');

  await db
    .delete(schema.storyAssignees)
    .where(and(eq(schema.storyAssignees.story_id, storyId), eq(schema.storyAssignees.user_id, uid)));

  return c.json({ ok: true });
});

export default stories;
