import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import type { Env, Variables } from './types';
import * as dbSchema from './db/schema';
import { authMiddleware } from './middleware/auth';
import { tokenAuthMiddleware, agentRateLimitMiddleware } from './middleware/tokenAuth';
import agentRoutes from './routes/agent';
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
import tokensRoutes from './routes/tokens';
import presenceRoutes from './routes/presence';
import { wikiAgentRoutes } from './features/wikiShare';
import seedRoutes from './db/seed';
import { processLibrarianQueue } from './lib/librarian';

/**
 * Scope enforcement for PAT-authenticated requests.
 *
 * - If the request was authenticated via session/cookie (no `tokenId` set
 *   by tokenAuthMiddleware), this is a no-op: session users have full access.
 * - If PAT-authenticated, require the token's scopes to cover the module
 *   with at least the needed action (read for GET/HEAD, write otherwise).
 */
function enforceScope(moduleName: string) {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
    const tokenId = c.get('tokenId');
    if (!tokenId) return next();

    const method = c.req.method.toUpperCase();
    const needsWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const requiredAction: 'read' | 'write' = needsWrite ? 'write' : 'read';

    const scopes = c.get('scopes') ?? {};
    const granted = scopes[moduleName] ?? 'none';
    const ok =
      requiredAction === 'read'
        ? granted === 'read' || granted === 'write'
        : granted === 'write';

    if (!ok) {
      return c.json(
        {
          error: 'token_scope_insufficient',
          required: `${moduleName}:${requiredAction}`,
          granted: `${moduleName}:${granted}`,
        },
        403,
      );
    }
    return next();
  };
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global error handler: ensure unhandled route errors return a generic 500
// without leaking stack traces, schema names, or internals to the client.
// Errors are logged server-side for debugging.
app.onError((err, c) => {
  console.error('Unhandled route error:', err);
  return c.json({ error: 'internal_error' }, 500);
});

// CORS
app.use('/api/*', cors({
  origin: (origin) => origin ?? '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Client-Id'],
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

// Auth middleware for protected routes.
// tokenAuthMiddleware runs first: if a `Bearer dk_*` PAT is present it sets
// user/scopes/tokenId; otherwise it's a no-op and authMiddleware handles
// the session cookie / global API_KEY as before.
app.use('/api/meta', tokenAuthMiddleware);
app.use('/api/meta', authMiddleware);

app.use('/api/team/*', tokenAuthMiddleware);
app.use('/api/team/*', authMiddleware);
app.use('/api/team/*', enforceScope('team'));

app.use('/api/projects/*', tokenAuthMiddleware);
app.use('/api/projects/*', authMiddleware);
app.use('/api/projects/*', enforceScope('projects'));

app.use('/api/stories/*', tokenAuthMiddleware);
app.use('/api/stories/*', authMiddleware);
app.use('/api/stories/*', enforceScope('stories'));

app.use('/api/reports/*', tokenAuthMiddleware);
app.use('/api/reports/*', authMiddleware);
app.use('/api/reports/*', enforceScope('reports'));

app.use('/api/goals/*', tokenAuthMiddleware);
app.use('/api/goals/*', authMiddleware);
app.use('/api/goals/*', enforceScope('goals'));

// /api/assignments/* is the "tasks" module
app.use('/api/assignments/*', tokenAuthMiddleware);
app.use('/api/assignments/*', authMiddleware);
app.use('/api/assignments/*', enforceScope('tasks'));

// Attachments and completions are per-story; reuse the stories scope.
app.use('/api/attachments/*', tokenAuthMiddleware);
app.use('/api/attachments/*', authMiddleware);
app.use('/api/attachments/*', enforceScope('stories'));

app.use('/api/completions/*', tokenAuthMiddleware);
app.use('/api/completions/*', authMiddleware);
app.use('/api/completions/*', enforceScope('stories'));

app.use('/api/learnings/*', tokenAuthMiddleware);
app.use('/api/learnings/*', authMiddleware);
app.use('/api/learnings/*', enforceScope('learnings'));

app.use('/api/wiki/*', tokenAuthMiddleware);
app.use('/api/wiki/*', authMiddleware);
app.use('/api/wiki/*', enforceScope('wiki'));

// Token management itself: only accessible via session auth — this is
// a user-level operation (and MUST prevent PATs from minting more PATs,
// revealing other PATs, or revoking them). We explicitly do NOT wire
// tokenAuthMiddleware here: any `Bearer dk_*` presented to /api/tokens/*
// is rejected below, and everything else falls through to authMiddleware
// (session cookie or legacy global API_KEY).
app.use('/api/tokens/*', async (c, next) => {
  const authHeader = c.req.header('Authorization') ?? '';
  if (authHeader.startsWith('Bearer dk_')) {
    return c.json({ error: 'token_forbidden_for_tokens_api' }, 403);
  }
  return next();
});
app.use('/api/tokens/*', authMiddleware);

// Presence is session-only (PATs shouldn't squat presence channels).
app.use('/api/presence/*', async (c, next) => {
  const authHeader = c.req.header('Authorization') ?? '';
  if (authHeader.startsWith('Bearer dk_')) {
    return c.json({ error: 'token_forbidden_for_presence' }, 403);
  }
  return next();
});
app.use('/api/presence/*', authMiddleware);

// Meta endpoint — discovery for agents
app.get('/api/meta', async (c) => {
  return c.json({
    priorities: ['low', 'medium', 'high', 'critical'],
    statuses: ['backlog', 'todo', 'in_progress', 'done'],
    categories: ['yesterday', 'today', 'backlog'],
    frequencies: ['daily', 'weekly', 'monthly'],
    endpoints: {
      stories: { list: 'GET /api/stories', kanban: 'GET /api/stories/kanban', search: 'GET /api/stories/search', create: 'POST /api/stories', get: 'GET /api/stories/:id', update: 'PATCH /api/stories/:id', delete: 'DELETE /api/stories/:id' },
      projects: { list: 'GET /api/projects' },
      members: { list: 'GET /api/team/members' },
      attachments: { list: 'GET /api/attachments/story/:storyId', upload: 'POST /api/attachments/story/:storyId', download: 'GET /api/attachments/file/:id', delete: 'DELETE /api/attachments/:id' },
      learnings: { list: 'GET /api/learnings', create: 'POST /api/learnings', get: 'GET /api/learnings/:id', update: 'PATCH /api/learnings/:id', delete: 'DELETE /api/learnings/:id' },
      wiki: { list: 'GET /api/wiki?project_id=X', search: 'GET /api/wiki/search?q=X', graph: 'GET /api/wiki/graph?project_id=X', create: 'POST /api/wiki', get: 'GET /api/wiki/:id', update: 'PATCH /api/wiki/:id', delete: 'DELETE /api/wiki/:id' },
      agent: {
        manifest: 'GET /agent/story/:id',
        description: 'GET /agent/story/:id/description',
        criteria: 'GET /agent/story/:id/criteria',
        attachments: 'GET /agent/story/:id/attachments',
        related: 'GET /agent/story/:id/related',
        wiki_refs: 'GET /agent/story/:id/wiki-refs',
        project_context: 'GET /agent/project/:id/context',
        wiki: {
          manifest: 'GET /agent/wiki/:id',
          content: 'GET /agent/wiki/:id/content',
          outline: 'GET /agent/wiki/:id/outline',
          graph: 'GET /agent/wiki/:id/graph?depth=1&max_nodes=20',
          space_search: 'GET /agent/wiki/space/:pid/search?q=&limit=10',
          space_tags: 'GET /agent/wiki/space/:pid/tags',
          space_index: 'GET /agent/wiki/space/:pid/index',
          share_token: 'POST /api/wiki/:id/share-token',
        },
      },
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
app.route('/api/tokens', tokensRoutes);
app.route('/api/presence', presenceRoutes);

// ---------- Agent API ----------
// Accepts share tokens (?s=st_*), PATs (Authorization: Bearer dk_*) or session
// cookies. CORS for the agent surface is broader than /api because agents may
// call from any origin with only a share URL.
app.use('/agent/*', cors({
  origin: (origin) => origin ?? '*',
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use('/agent/*', async (c, next) => {
  const db = drizzle(c.env.DB, { schema: dbSchema });
  c.set('db', db);
  await next();
});
app.use('/agent/*', tokenAuthMiddleware);
app.use('/agent/*', authMiddleware);
app.use('/agent/*', agentRateLimitMiddleware);
// Wiki agent surface (project-scoped share tokens). Same middleware chain as
// the rest of /agent/* — the /agent/* middleware above already applies.
app.route('/agent/wiki', wikiAgentRoutes);
app.route('/agent', agentRoutes);

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processLibrarianQueue(env));
  },
};
