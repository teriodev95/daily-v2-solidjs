import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';
import { publish, teamChannel } from '../lib/realtime';

const assignments = new Hono<{ Bindings: Env; Variables: Variables }>();

assignments.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const assignedTo = c.req.query('assigned_to');
  const status = c.req.query('status');

  let rows = await db
    .select()
    .from(schema.assignments)
    .where(eq(schema.assignments.team_id, user.teamId));

  if (assignedTo) rows = rows.filter(a => a.assigned_to === assignedTo);
  if (status) rows = rows.filter(a => a.status === status);

  return c.json(rows);
});

assignments.post('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json<{
    project_id?: string;
    assigned_to: string;
    title: string;
    description?: string;
    due_date?: string;
  }>();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.assignments).values({
    id,
    team_id: user.teamId,
    project_id: body.project_id ?? null,
    assigned_by: user.userId,
    assigned_to: body.assigned_to,
    title: body.title,
    description: body.description ?? '',
    status: 'open',
    due_date: body.due_date ?? null,
    created_at: now,
  });

  const [created] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, id)).limit(1);
  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), { type: 'assignment.created', id }, c.req.header('x-client-id')),
  );
  return c.json(created, 201);
});

assignments.patch('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<Partial<{ status: 'open' | 'closed'; title: string; description: string; due_date: string; closed_at: string }>>();

  if (body.status === 'closed' && !body.closed_at) {
    body.closed_at = new Date().toISOString();
  }

  await db.update(schema.assignments).set(body).where(eq(schema.assignments.id, id));

  const [updated] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, id)).limit(1);
  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), { type: 'assignment.updated', id }, c.req.header('x-client-id')),
  );
  return c.json(updated);
});

export default assignments;
