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
  const body = await c.req.json<Partial<{
    name: string;
    prefix: string;
    color: string;
    icon_url: string;
    status: 'active' | 'archived';
  }>>();

  // Whitelist fields
  const allowed: Record<string, unknown> = {};
  if (body.name !== undefined) allowed.name = body.name;
  if (body.prefix !== undefined) allowed.prefix = body.prefix;
  if (body.color !== undefined) allowed.color = body.color;
  if (body.icon_url !== undefined) allowed.icon_url = body.icon_url;
  if (body.status !== undefined) allowed.status = body.status;

  if (Object.keys(allowed).length > 0) {
    await db.update(schema.projects).set(allowed).where(eq(schema.projects.id, id));
  }

  const [updated] = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
  return c.json(updated);
});

projects.delete('/:id', requireAdmin, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  // Check if project has stories
  const stories = await db.select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.project_id, id)).limit(1);

  if (stories.length > 0) {
    // Soft delete — archive instead
    await db.update(schema.projects).set({ status: 'archived' }).where(eq(schema.projects.id, id));
    return c.json({ ok: true, archived: true });
  }

  await db.delete(schema.projects).where(eq(schema.projects.id, id));
  return c.json({ ok: true });
});

export default projects;
