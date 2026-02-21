import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';

const goals = new Hono<{ Bindings: Env; Variables: Variables }>();

goals.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const userId = c.req.query('user_id');
  const weekNumber = c.req.query('week_number');
  const year = c.req.query('year');
  const shared = c.req.query('shared');

  let rows = await db
    .select()
    .from(schema.weekGoals)
    .where(eq(schema.weekGoals.team_id, user.teamId));

  if (userId) rows = rows.filter(g => g.user_id === userId);
  if (weekNumber) rows = rows.filter(g => g.week_number === parseInt(weekNumber));
  if (year) rows = rows.filter(g => g.year === parseInt(year));
  if (shared === 'true') rows = rows.filter(g => g.is_shared);

  // By default exclude closed goals unless explicitly requested
  const includeClosed = c.req.query('include_closed');
  if (includeClosed !== 'true') rows = rows.filter(g => !g.is_closed);

  return c.json(rows);
});

goals.post('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json<{
    week_number: number;
    year: number;
    text: string;
    is_shared?: boolean;
  }>();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.weekGoals).values({
    id,
    user_id: user.userId,
    team_id: user.teamId,
    week_number: body.week_number,
    year: body.year,
    text: body.text,
    is_completed: false,
    is_shared: body.is_shared ?? false,
    created_at: now,
  });

  const [created] = await db.select().from(schema.weekGoals).where(eq(schema.weekGoals.id, id)).limit(1);
  return c.json(created, 201);
});

goals.patch('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json<Partial<{ text: string; is_completed: boolean; is_closed: boolean; is_shared: boolean }>>();

  await db.update(schema.weekGoals).set(body).where(eq(schema.weekGoals.id, id));

  const [updated] = await db.select().from(schema.weekGoals).where(eq(schema.weekGoals.id, id)).limit(1);
  return c.json(updated);
});

export default goals;
