import { createMiddleware } from 'hono/factory';
import type { Env, Variables } from '../types';
import { verifyJWT } from '../lib/crypto';

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const cookie = c.req.header('Cookie') ?? '';
    const match = cookie.match(/session=([^;]+)/);
    if (!match) return c.json({ error: 'Unauthorized' }, 401);

    const payload = await verifyJWT(match[1], c.env.JWT_SECRET);
    if (!payload) return c.json({ error: 'Unauthorized' }, 401);

    c.set('user', {
      userId: payload.userId as string,
      teamId: payload.teamId as string,
      role: payload.role as 'admin' | 'collaborator',
    });

    await next();
  },
);

export const requireAdmin = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const user = c.get('user');
    if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
    await next();
  },
);
