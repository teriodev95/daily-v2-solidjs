import { Hono } from 'hono';
import { eq, and, gte, lte } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';
import { buildDailyReportModel, parseReportDateKey, reportCompletionRange } from '../../src/v2/lib/reportSelectors';

const reports = new Hono<{ Bindings: Env; Variables: Variables }>();

const resolveReportUserId = async (
  db: Variables['db'],
  requester: Variables['user'],
  requestedUserId: string | undefined,
) => {
  const userId = requestedUserId ?? requester.userId;
  if (userId === requester.userId) return userId;
  if (requester.role !== 'admin') return null;

  const [target] = await db
    .select({ id: schema.users.id, team_id: schema.users.team_id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!target || target.team_id !== requester.teamId) return null;
  return userId;
};

const weekNumberForDate = (dateKey: string) => {
  const date = parseReportDateKey(dateKey);
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
};

reports.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const userId = await resolveReportUserId(db, user, c.req.query('user_id'));
  if (!userId) return c.json({ error: 'Not found' }, 404);
  const weekNumber = c.req.query('week_number');

  let rows = await db
    .select()
    .from(schema.dailyReports)
    .where(eq(schema.dailyReports.user_id, userId));

  if (weekNumber) {
    rows = rows.filter(r => r.week_number === parseInt(weekNumber, 10));
  }

  return c.json(rows);
});

reports.get('/:date', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const date = c.req.param('date');
  const userId = await resolveReportUserId(db, user, c.req.query('user_id'));
  if (!userId) return c.json({ error: 'Not found' }, 404);

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

  const now = new Date().toISOString();
  const reportRow = report ?? {
    id: '',
    user_id: userId,
    report_date: date,
    week_number: weekNumberForDate(date),
    learning: '',
    impediments: '',
    created_at: now,
    updated_at: now,
  };

  // Also get stories by category for this user
  const allAssignees = await db.select().from(schema.storyAssignees).where(eq(schema.storyAssignees.user_id, userId));
  const linkedStoryIds = new Set(allAssignees.map(a => a.story_id));

  const allStories = await db.select().from(schema.stories).where(eq(schema.stories.team_id, c.get('user').teamId));

  const userStories = allStories.filter(
    s => s.is_active && (s.assignee_id === userId || linkedStoryIds.has(s.id)),
  );

  const storyAssigneeLinks = await db.select().from(schema.storyAssignees);
  const assigneeMap = new Map<string, string[]>();
  for (const a of storyAssigneeLinks) {
    const arr = assigneeMap.get(a.story_id) ?? [];
    arr.push(a.user_id);
    assigneeMap.set(a.story_id, arr);
  }

  const withAssignees = (stories: typeof userStories) =>
    stories.map(s => ({
      ...s,
      recurrence_days: s.recurrence_days ? JSON.parse(s.recurrence_days) : null,
      assignees: assigneeMap.get(s.id) ?? [],
    }));

  const reportDate = parseReportDateKey(date);
  const completionRange = reportCompletionRange(reportDate);
  const completions = await db
    .select()
    .from(schema.storyCompletions)
    .where(
      and(
        eq(schema.storyCompletions.user_id, userId),
        gte(schema.storyCompletions.completion_date, completionRange.from),
        lte(schema.storyCompletions.completion_date, completionRange.to),
      ),
    );

  const model = buildDailyReportModel(withAssignees(userStories) as any, [], completions, reportDate);

  return c.json({
    ...reportRow,
    yesterday: model.completedYesterday,
    today: model.activeStories,
    backlog: [],
    completed_today: model.completedToday,
    pending_today: model.activeStories,
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
