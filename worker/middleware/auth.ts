import { createMiddleware } from 'hono/factory';
import { eq, and } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import { verifyJWT } from '../lib/crypto';
import * as schema from '../db/schema';

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    // If a previous middleware (e.g. tokenAuthMiddleware for PATs) already
    // resolved a user, skip — don't try to overwrite or re-validate.
    if (c.get('user')) {
      return next();
    }

    // Try 1: Bearer token (API key for agents)
    const authHeader = c.req.header('Authorization') ?? '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (!c.env.API_KEY || token !== c.env.API_KEY) {
        return c.json({ error: 'Invalid API key' }, 401);
      }
      // API key auth: resolve to the first active admin user in the team
      const db = c.get('db');
      const [adminUser] = await db
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.role, 'admin'), eq(schema.users.is_active, true)))
        .limit(1);
      if (!adminUser) return c.json({ error: 'No admin user found' }, 500);
      c.set('user', {
        userId: adminUser.id,
        teamId: adminUser.team_id,
        role: adminUser.role as 'admin' | 'collaborator',
      });
      return next();
    }

    // Try 2: Cookie JWT (frontend sessions)
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
