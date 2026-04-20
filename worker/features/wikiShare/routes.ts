import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env, Variables } from '../../types';
import * as schema from '../../db/schema';
import { wikiShareTokens } from './schema';
import { buildManifest, type ManifestAuth } from './manifest';
import {
  buildNeighborSet,
  expandGraph,
  loadProjectArticles,
} from './graph';
import {
  listProjectIndex,
  listProjectTags,
  searchProject,
} from './search';
import { extractOutline } from './utils';

/**
 * Hono router for the public agent-facing wiki surface (`/agent/wiki/*`).
 *
 * Auth is already enforced upstream by the central wiki-share middleware,
 * which populates `c.var.user`, `c.var.scopes`, `c.var.tokenKind`, and for
 * share-token requests `c.var.shareTokenId` + `c.var.shareTokenScope`.
 */
const agentWiki = new Hono<{ Bindings: Env; Variables: Variables }>();

type ArticleRow = typeof schema.wikiArticles.$inferSelect;
type ProjectRow = typeof schema.projects.$inferSelect;
type ScopeLevel = 'none' | 'read' | 'write';
type ScopeMap = Record<string, ScopeLevel>;

function absBase(c: Context): string {
  return new URL(c.req.url).origin;
}

function flattenScopes(scopes: ScopeMap | undefined): string[] {
  if (!scopes) return [];
  const out: string[] = [];
  for (const [mod, level] of Object.entries(scopes)) {
    if (level === 'none') continue;
    out.push(`${mod}:${level}`);
  }
  return out.sort();
}

/**
 * Resolve auth context into the manifest's `auth` block.
 * - `scope_bound_to` is only set for share tokens (project-scoped).
 * - `expires_at` is only fetched for share tokens.
 */
async function buildAuthBlock(
  c: Context<{ Bindings: Env; Variables: Variables }>,
): Promise<ManifestAuth> {
  const scopes = c.get('scopes') as ScopeMap | undefined;
  const tokenKind = c.get('tokenKind');
  const kind: ManifestAuth['kind'] =
    tokenKind === 'share' ? 'share_token' : tokenKind === 'pat' ? 'pat' : 'session';

  const granted = flattenScopes(scopes);
  const auth: ManifestAuth = {
    kind,
    granted_scopes: granted,
    missing_scopes: [],
  };

  if (tokenKind === 'share') {
    const scope = (c as any).var?.shareTokenScope as { type: 'project'; id: string } | undefined;
    if (scope) auth.scope_bound_to = { type: 'project', id: scope.id };

    const shareTokenId = c.get('shareTokenId');
    if (shareTokenId) {
      const db = c.get('db');
      const [row] = await db
        .select()
        .from(wikiShareTokens)
        .where(eq(wikiShareTokens.id, shareTokenId))
        .limit(1);
      if (row) auth.expires_at = row.expires_at;
    }
  }

  return auth;
}

/**
 * Gate: the article/project must belong to the caller's scope.
 * - share token: must match `shareTokenScope.id`
 * - pat/session: must match the authed user's team
 *
 * Returns `null` on mismatch (caller should 404). Avoids 403s so callers
 * can't enumerate article IDs across projects.
 */
async function loadAccessibleArticle(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  articleId: string,
): Promise<ArticleRow | null> {
  const db = c.get('db');
  const user = c.get('user');
  const [article] = await db
    .select()
    .from(schema.wikiArticles)
    .where(eq(schema.wikiArticles.id, articleId))
    .limit(1);
  if (!article) return null;
  if (article.is_archived) return null;

  const tokenKind = c.get('tokenKind');
  if (tokenKind === 'share') {
    const scope = (c as any).var?.shareTokenScope as { type: 'project'; id: string } | undefined;
    if (!scope || scope.type !== 'project') return null;
    if (article.project_id !== scope.id) return null;
    // Also enforce team binding as defense in depth.
    if (user && article.team_id !== user.teamId) return null;
    return article;
  }

  if (!user) return null;
  if (article.team_id !== user.teamId) return null;
  return article;
}

async function loadAccessibleProject(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  projectId: string,
): Promise<ProjectRow | null> {
  const db = c.get('db');
  const user = c.get('user');
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project) return null;

  const tokenKind = c.get('tokenKind');
  if (tokenKind === 'share') {
    const scope = (c as any).var?.shareTokenScope as { type: 'project'; id: string } | undefined;
    if (!scope || scope.type !== 'project') return null;
    if (project.id !== scope.id) return null;
    if (user && project.team_id !== user.teamId) return null;
    return project;
  }

  if (!user) return null;
  if (project.team_id !== user.teamId) return null;
  return project;
}

// ---------- GET /:id — manifest ----------

agentWiki.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const article = await loadAccessibleArticle(c, id);
  if (!article) return c.json({ error: 'Not found' }, 404);

  const [projectRow] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, article.project_id))
    .limit(1);
  if (!projectRow) return c.json({ error: 'Not found' }, 404);

  const base = absBase(c);
  const siblings = await loadProjectArticles(db, article.project_id, article.team_id);
  const neighbors = buildNeighborSet(article, siblings, base);
  const auth = await buildAuthBlock(c);

  const manifest = buildManifest({
    article,
    project: projectRow,
    neighbors,
    base,
    auth,
  });

  return c.json(manifest);
});

// ---------- GET /:id/content ----------

agentWiki.get('/:id/content', async (c) => {
  const id = c.req.param('id');
  const article = await loadAccessibleArticle(c, id);
  if (!article) return c.json({ error: 'Not found' }, 404);
  return c.json({ content: article.content ?? '' });
});

// ---------- GET /:id/outline ----------

agentWiki.get('/:id/outline', async (c) => {
  const id = c.req.param('id');
  const article = await loadAccessibleArticle(c, id);
  if (!article) return c.json({ error: 'Not found' }, 404);
  return c.json({ outline: extractOutline(article.content ?? '') });
});

// ---------- GET /:id/graph ----------

agentWiki.get('/:id/graph', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const article = await loadAccessibleArticle(c, id);
  if (!article) return c.json({ error: 'Not found' }, 404);

  const depthRaw = Number(c.req.query('depth') ?? '1');
  const maxRaw = Number(c.req.query('max_nodes') ?? '20');
  const depth = Number.isFinite(depthRaw) ? depthRaw : 1;
  const maxNodes = Number.isFinite(maxRaw) ? maxRaw : 20;

  const siblings = await loadProjectArticles(db, article.project_id, article.team_id);
  const base = absBase(c);
  const graph = expandGraph(article.id, siblings, { depth, maxNodes, base });
  return c.json(graph);
});

// ---------- GET /space/:pid/search ----------

agentWiki.get('/space/:pid/search', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const pid = c.req.param('pid');

  const project = await loadAccessibleProject(c, pid);
  if (!project) return c.json({ error: 'Not found' }, 404);

  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ error: 'q is required' }, 400);

  const limitRaw = Number(c.req.query('limit') ?? '10');
  const offsetRaw = Number(c.req.query('offset') ?? '0');
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitRaw) ? limitRaw : 10));
  const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);

  const response = await searchProject(db, {
    projectId: project.id,
    teamId: user.teamId,
    q,
    limit,
    offset,
    base: absBase(c),
  });

  return c.json(response);
});

// ---------- GET /space/:pid/tags ----------

agentWiki.get('/space/:pid/tags', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const pid = c.req.param('pid');

  const project = await loadAccessibleProject(c, pid);
  if (!project) return c.json({ error: 'Not found' }, 404);

  const response = await listProjectTags(db, {
    projectId: project.id,
    teamId: user.teamId,
  });
  return c.json(response);
});

// ---------- GET /space/:pid/index ----------

agentWiki.get('/space/:pid/index', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const pid = c.req.param('pid');

  const project = await loadAccessibleProject(c, pid);
  if (!project) return c.json({ error: 'Not found' }, 404);

  const response = await listProjectIndex(db, {
    projectId: project.id,
    teamId: user.teamId,
    base: absBase(c),
  });
  return c.json(response);
});

export default agentWiki;
