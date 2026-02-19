import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';

const reports = new Hono<{ Bindings: Env; Variables: Variables }>();

reports.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const userId = c.req.query('user_id') ?? user.userId;
  const weekNumber = c.req.query('week_number');

  let rows = await db
    .select()
    .from(schema.dailyReports)
    .where(eq(schema.dailyReports.user_id, userId));

  if (weekNumber) {
    rows = rows.filter(r => r.week_number === parseInt(weekNumber));
  }

  return c.json(rows);
});

reports.get('/:date', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const date = c.req.param('date');
  const userId = c.req.query('user_id') ?? user.userId;

  const [report] = await db
    .select()
    .from(schema.dailyReports)
    .where(
      and(
        eq(schema.dailyReports.user_id, userId),
        eq(schema.dailyReports.report_date, date),
      ),
    )
    .limit(1);

  if (!report) return c.json({ error: 'Not found' }, 404);

  // Also get stories by category for this user
  const allAssignees = await db.select().from(schema.storyAssignees).where(eq(schema.storyAssignees.user_id, userId));
  const linkedStoryIds = new Set(allAssignees.map(a => a.story_id));

  const allStories = await db.select().from(schema.stories).where(eq(schema.stories.team_id, c.get('user').teamId));

  const userStories = allStories.filter(
    s => s.assignee_id === userId || linkedStoryIds.has(s.id),
  );

  const storyAssigneeLinks = await db.select().from(schema.storyAssignees);
  const assigneeMap = new Map<string, string[]>();
  for (const a of storyAssigneeLinks) {
    const arr = assigneeMap.get(a.story_id) ?? [];
    arr.push(a.user_id);
    assigneeMap.set(a.story_id, arr);
  }

  const withAssignees = (stories: typeof userStories) =>
    stories.map(s => ({ ...s, assignees: assigneeMap.get(s.id) ?? [] }));

  return c.json({
    ...report,
    yesterday: withAssignees(userStories.filter(s => s.category === 'yesterday').sort((a, b) => a.sort_order - b.sort_order)),
    today: withAssignees(userStories.filter(s => s.category === 'today').sort((a, b) => a.sort_order - b.sort_order)),
    backlog: withAssignees(userStories.filter(s => s.category === 'backlog').sort((a, b) => a.sort_order - b.sort_order)),
  });
});

reports.put('/:date', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const date = c.req.param('date');
  const body = await c.req.json<{
    week_number: number;
    learning?: string;
    impediments?: string;
  }>();

  const now = new Date().toISOString();

  const [existing] = await db
    .select()
    .from(schema.dailyReports)
    .where(
      and(
        eq(schema.dailyReports.user_id, user.userId),
        eq(schema.dailyReports.report_date, date),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(schema.dailyReports)
      .set({
        learning: body.learning ?? existing.learning,
        impediments: body.impediments ?? existing.impediments,
        updated_at: now,
      })
      .where(eq(schema.dailyReports.id, existing.id));

    const [updated] = await db.select().from(schema.dailyReports).where(eq(schema.dailyReports.id, existing.id)).limit(1);
    return c.json(updated);
  }

  const id = crypto.randomUUID();
  await db.insert(schema.dailyReports).values({
    id,
    user_id: user.userId,
    report_date: date,
    week_number: body.week_number,
    learning: body.learning ?? '',
    impediments: body.impediments ?? '',
    created_at: now,
    updated_at: now,
  });

  const [created] = await db.select().from(schema.dailyReports).where(eq(schema.dailyReports.id, id)).limit(1);
  return c.json(created, 201);
});

export default reports;
