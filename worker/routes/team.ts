import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';
import { requireAdmin } from '../middleware/auth';
import { hashPassword } from '../lib/crypto';

const team = new Hono<{ Bindings: Env; Variables: Variables }>();

const safeUserSelect = {
  id: schema.users.id,
  team_id: schema.users.team_id,
  name: schema.users.name,
  email: schema.users.email,
  avatar_url: schema.users.avatar_url,
  role: schema.users.role,
  is_active: schema.users.is_active,
  created_at: schema.users.created_at,
};

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
  const rows = await db.select(safeUserSelect).from(schema.users).where(eq(schema.users.team_id, user.teamId));
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

  const [created] = await db.select(safeUserSelect).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return c.json(created, 201);
});

team.patch('/members/:id', requireAdmin, async (c) => {
  const db = c.get('db');
  const memberId = c.req.param('id');
  const body = await c.req.json<Partial<{
    name: string;
    email: string;
    role: 'admin' | 'collaborator';
    is_active: boolean;
    avatar_url: string;
    password: string;
  }>>();

  // Whitelist fields to prevent injection of arbitrary columns
  const allowed: Record<string, unknown> = {};
  if (body.name !== undefined) allowed.name = body.name;
  if (body.email !== undefined) allowed.email = body.email;
  if (body.role !== undefined) allowed.role = body.role;
  if (body.is_active !== undefined) allowed.is_active = body.is_active;
  if (body.avatar_url !== undefined) allowed.avatar_url = body.avatar_url;
  if (body.password) allowed.password = await hashPassword(body.password);

  if (Object.keys(allowed).length > 0) {
    await db.update(schema.users).set(allowed).where(eq(schema.users.id, memberId));
  }

  const [updated] = await db.select(safeUserSelect).from(schema.users).where(eq(schema.users.id, memberId)).limit(1);
  return c.json(updated);
});

// ─── Avatar Upload (R2) ──────────────────────────
team.post('/members/:id/avatar', requireAdmin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const memberId = c.req.param('id');

  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400);
  }

  if (!file.type.startsWith('image/')) {
    return c.json({ error: 'Only images allowed' }, 400);
  }

  if (file.size > 5 * 1024 * 1024) {
    return c.json({ error: 'Max file size 5MB' }, 400);
  }

  // Delete old R2 avatar if exists
  const [existing] = await db.select({ avatar_url: schema.users.avatar_url }).from(schema.users).where(eq(schema.users.id, memberId)).limit(1);
  if (existing?.avatar_url?.includes('/api/avatars/')) {
    const oldKey = decodeURIComponent(existing.avatar_url.replace(/^.*\/api\/avatars\//, ''));
    try { await c.env.BUCKET.delete(oldKey); } catch { /* ignore */ }
  }

  // Upload new avatar
  const ext = file.name.split('.').pop() || 'jpg';
  const r2Key = `${user.teamId}/avatars/${memberId}-${Date.now()}.${ext}`;
  await c.env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const avatarUrl = `/api/avatars/${encodeURIComponent(r2Key)}`;
  await db.update(schema.users).set({ avatar_url: avatarUrl }).where(eq(schema.users.id, memberId));

  const [updated] = await db.select(safeUserSelect).from(schema.users).where(eq(schema.users.id, memberId)).limit(1);
  return c.json(updated);
});

export default team;
