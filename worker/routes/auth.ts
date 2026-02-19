import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';
import { verifyPassword, createJWT } from '../lib/crypto';
import { authMiddleware } from '../middleware/auth';

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

auth.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  const db = c.get('db');

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) return c.json({ error: 'Invalid credentials' }, 401);
  if (!user.is_active) return c.json({ error: 'Account deactivated' }, 401);

  const valid = await verifyPassword(password, user.password);
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401);

  const token = await createJWT(
    { userId: user.id, teamId: user.team_id, role: user.role },
    c.env.JWT_SECRET,
  );

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.insert(schema.sessions).values({
    id: sessionId,
    user_id: user.id,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  });

  c.header(
    'Set-Cookie',
    `session=${token}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=604800`,
  );

  const { password: _, ...safeUser } = user;
  return c.json(safeUser);
});

auth.post('/logout', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  await db.delete(schema.sessions).where(eq(schema.sessions.user_id, user.userId));

  c.header(
    'Set-Cookie',
    'session=; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=0',
  );

  return c.json({ ok: true });
});

auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.userId)).limit(1);
  if (!row) return c.json({ error: 'User not found' }, 404);

  const { password: _, ...safeUser } = row;
  return c.json(safeUser);
});

export default auth;
