import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';
import { requireAdmin } from '../middleware/auth';

const projects = new Hono<{ Bindings: Env; Variables: Variables }>();

projects.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const status = c.req.query('status');

  let rows;
  if (status) {
    rows = await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.team_id, user.teamId), eq(schema.projects.status, status as 'active' | 'archived')));
  } else {
    rows = await db.select().from(schema.projects).where(eq(schema.projects.team_id, user.teamId));
  }
  return c.json(rows);
});

projects.post('/', requireAdmin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json<{
    name: string;
    prefix: string;
    color: string;
    icon_url?: string;
  }>();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.projects).values({
    id,
    team_id: user.teamId,
    name: body.name,
    prefix: body.prefix,
    color: body.color,
    icon_url: body.icon_url ?? null,
    status: 'active',
    created_by: user.userId,
    created_at: now,
  });

  const [created] = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
  return c.json(created, 201);
});

projects.patch('/:id', requireAdmin, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json<Partial<{ name: string; prefix: string; color: string; icon_url: string; status: 'active' | 'archived' }>>();

  await db.update(schema.projects).set(body).where(eq(schema.projects.id, id));

  const [updated] = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
  return c.json(updated);
});

export default projects;
