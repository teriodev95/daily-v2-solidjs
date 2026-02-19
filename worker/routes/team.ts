import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';
import { requireAdmin } from '../middleware/auth';
import { hashPassword } from '../lib/crypto';

const team = new Hono<{ Bindings: Env; Variables: Variables }>();

team.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, user.teamId)).limit(1);
  if (!row) return c.json({ error: 'Team not found' }, 404);
  return c.json(row);
});

team.get('/members', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const rows = await db
    .select({
      id: schema.users.id,
      team_id: schema.users.team_id,
      name: schema.users.name,
      email: schema.users.email,
      avatar_url: schema.users.avatar_url,
      role: schema.users.role,
      is_active: schema.users.is_active,
      created_at: schema.users.created_at,
    })
    .from(schema.users)
    .where(eq(schema.users.team_id, user.teamId));
  return c.json(rows);
});

team.post('/members', requireAdmin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json<{
    name: string;
    email: string;
    password: string;
    role?: 'admin' | 'collaborator';
    avatar_url?: string;
  }>();

  const id = crypto.randomUUID();
  const hashedPw = await hashPassword(body.password);
  const now = new Date().toISOString();

  await db.insert(schema.users).values({
    id,
    team_id: user.teamId,
    name: body.name,
    email: body.email,
    password: hashedPw,
    role: body.role ?? 'collaborator',
    avatar_url: body.avatar_url ?? null,
    is_active: true,
    created_at: now,
  });

  const [created] = await db
    .select({
      id: schema.users.id,
      team_id: schema.users.team_id,
      name: schema.users.name,
      email: schema.users.email,
      avatar_url: schema.users.avatar_url,
      role: schema.users.role,
      is_active: schema.users.is_active,
      created_at: schema.users.created_at,
    })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);

  return c.json(created, 201);
});

team.patch('/members/:id', requireAdmin, async (c) => {
  const db = c.get('db');
  const memberId = c.req.param('id');
  const body = await c.req.json<Partial<{ name: string; role: 'admin' | 'collaborator'; is_active: boolean; avatar_url: string }>>();

  await db.update(schema.users).set(body).where(eq(schema.users.id, memberId));

  const [updated] = await db
    .select({
      id: schema.users.id,
      team_id: schema.users.team_id,
      name: schema.users.name,
      email: schema.users.email,
      avatar_url: schema.users.avatar_url,
      role: schema.users.role,
      is_active: schema.users.is_active,
      created_at: schema.users.created_at,
    })
    .from(schema.users)
    .where(eq(schema.users.id, memberId))
    .limit(1);

  return c.json(updated);
});

export default team;
