import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import type { Env, Variables } from './types';
import * as dbSchema from './db/schema';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import teamRoutes from './routes/team';
import projectRoutes from './routes/projects';
import storiesRoutes from './routes/stories';
import reportsRoutes from './routes/reports';
import goalsRoutes from './routes/goals';
import assignmentsRoutes from './routes/assignments';
import attachmentsRoutes from './routes/attachments';
import completionsRoutes from './routes/completions';
import learningsRoutes from './routes/learnings';
import wikiRoutes from './routes/wiki';
import seedRoutes from './db/seed';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS
app.use('/api/*', cors({
  origin: (origin) => origin ?? '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Inject DB into context for all /api routes
app.use('/api/*', async (c, next) => {
  const db = drizzle(c.env.DB, { schema: dbSchema });
  c.set('db', db);
  await next();
});

// Public routes (no auth required)
app.route('/api/auth', authRoutes);
app.route('/api/admin', seedRoutes);

// Public avatar serve (img tags can't send cookies cross-origin)
app.get('/api/avatars/:key{.+}', async (c) => {
  const r2Key = decodeURIComponent(c.req.param('key'));
  const obj = await c.env.BUCKET.get(r2Key);
  if (!obj) return c.json({ error: 'Not found' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

// Auth middleware for protected routes
app.use('/api/meta', authMiddleware);
app.use('/api/team/*', authMiddleware);
app.use('/api/projects/*', authMiddleware);
app.use('/api/stories/*', authMiddleware);
app.use('/api/reports/*', authMiddleware);
app.use('/api/goals/*', authMiddleware);
app.use('/api/assignments/*', authMiddleware);
app.use('/api/attachments/*', authMiddleware);
app.use('/api/completions/*', authMiddleware);
app.use('/api/learnings/*', authMiddleware);
app.use('/api/wiki/*', authMiddleware);

// Meta endpoint — discovery for agents
app.get('/api/meta', async (c) => {
  return c.json({
    priorities: ['low', 'medium', 'high', 'critical'],
    statuses: ['backlog', 'todo', 'in_progress', 'done'],
    categories: ['yesterday', 'today', 'backlog'],
    frequencies: ['daily', 'weekly', 'monthly'],
    endpoints: {
      stories: { list: 'GET /api/stories', create: 'POST /api/stories', get: 'GET /api/stories/:id', update: 'PATCH /api/stories/:id', delete: 'DELETE /api/stories/:id' },
      projects: { list: 'GET /api/projects' },
      members: { list: 'GET /api/team/members' },
      attachments: { list: 'GET /api/attachments/story/:storyId', upload: 'POST /api/attachments/story/:storyId', download: 'GET /api/attachments/file/:id', delete: 'DELETE /api/attachments/:id' },
      learnings: { list: 'GET /api/learnings', create: 'POST /api/learnings', get: 'GET /api/learnings/:id', update: 'PATCH /api/learnings/:id', delete: 'DELETE /api/learnings/:id' },
      wiki: { list: 'GET /api/wiki?project_id=X', search: 'GET /api/wiki/search?q=X', graph: 'GET /api/wiki/graph?project_id=X', create: 'POST /api/wiki', get: 'GET /api/wiki/:id', update: 'PATCH /api/wiki/:id', delete: 'DELETE /api/wiki/:id' },
      meta: { get: 'GET /api/meta' },
    },
  });
});

// Protected routes
app.route('/api/team', teamRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/stories', storiesRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/goals', goalsRoutes);
app.route('/api/assignments', assignmentsRoutes);
app.route('/api/attachments', attachmentsRoutes);
app.route('/api/completions', completionsRoutes);
app.route('/api/learnings', learningsRoutes);
app.route('/api/wiki', wikiRoutes);

export default app;
