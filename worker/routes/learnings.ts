import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';

const learnings = new Hono<{ Bindings: Env; Variables: Variables }>();

// List learnings for current user
learnings.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const status = c.req.query('status');

  let rows = await db
    .select()
    .from(schema.learnings)
    .where(eq(schema.learnings.user_id, user.userId));

  if (status) rows = rows.filter(l => l.status === status);

  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return c.json(rows);
});

// Create learning
learnings.post('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json<{ title: string; content?: string; status?: string }>();

  if (!body.title?.trim()) {
    return c.json({ error: 'title is required', field: 'title' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.learnings).values({
    id,
    user_id: user.userId,
    team_id: user.teamId,
    title: body.title.trim(),
    content: body.content ?? '',
    status: (body.status as any) ?? 'active',
    created_at: now,
    updated_at: now,
  });

  const [created] = await db.select().from(schema.learnings).where(eq(schema.learnings.id, id)).limit(1);
  return c.json(created, 201);
});

// Get single learning
learnings.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const [learning] = await db.select().from(schema.learnings).where(eq(schema.learnings.id, id)).limit(1);
  if (!learning) return c.json({ error: 'Not found' }, 404);

  return c.json(learning);
});

// Update learning
learnings.patch('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();

  const allowed: Record<string, unknown> = {};
  if (body.title !== undefined) allowed.title = body.title;
  if (body.content !== undefined) allowed.content = body.content;
  if (body.status !== undefined) {
    if (!['active', 'done'].includes(body.status as string)) {
      return c.json({ error: 'status must be active or done', field: 'status' }, 400);
    }
    allowed.status = body.status;
  }

  if (Object.keys(allowed).length > 0) {
    await db
      .update(schema.learnings)
      .set({ ...allowed, updated_at: new Date().toISOString() } as any)
      .where(eq(schema.learnings.id, id));
  }

  const [updated] = await db.select().from(schema.learnings).where(eq(schema.learnings.id, id)).limit(1);
  if (!updated) return c.json({ error: 'Not found' }, 404);

  return c.json(updated);
});

// Delete learning
learnings.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  await db.delete(schema.learnings).where(eq(schema.learnings.id, id));
  return c.json({ ok: true });
});

export default learnings;
