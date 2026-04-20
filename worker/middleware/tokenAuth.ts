import { createMiddleware } from 'hono/factory';
import { eq, and } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import { hashToken } from '../lib/tokenCrypto';
import * as schema from '../db/schema';
import { validateWikiShareToken } from '../features/wikiShare/middleware';

type ScopeLevel = 'none' | 'read' | 'write';

const BEARER_PREFIX = 'Bearer ';
const PAT_PREFIX = 'dk_';
const SHARE_TOKEN_PREFIX = 'st_';
// Read-only scopes granted by any valid share token. Whatever the manifest
// exposes, the bearer can only GET it.
const SHARE_TOKEN_SCOPES: Record<string, ScopeLevel> = {
  stories: 'read',
  attachments: 'read',
  wiki: 'read',
  projects: 'read',
};

/**
 * Detects `Authorization: Bearer dk_*` PATs and authenticates the request.
 *
 * Behavior:
 * - No `Bearer dk_*` header → calls next() without setting user (the regular
 *   authMiddleware runs after this and handles session cookie / global API_KEY).
 * - Valid PAT → sets c.var.user, c.var.scopes (parsed JSON), c.var.tokenId.
 *   Best-effort updates `last_used_at` + `last_used_ip`.
 * - Invalid / expired / revoked PAT → returns 401 with a clear error code.
 *
 * Security: lookup is always by SHA-256 hash, never by raw token.
 */
export const tokenAuthMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  // --- Share-token path (?s=st_*) --------------------------------------
  // Share tokens arrive as a query param because they're embedded in URLs
  // that browsers / LLM agents can fetch directly. They grant read-only
  // access to a SINGLE story's resources and are bound to that story's id
  // in the URL path, so token A cannot read story B.
  const shareRaw = c.req.query('s');
  if (shareRaw && shareRaw.startsWith(SHARE_TOKEN_PREFIX)) {
    const db = c.get('db');
    const urlPath = new URL(c.req.url).pathname;

    // --- Wiki share-token branch -------------------------------------
    // Wiki share URLs live under /agent/wiki/*. The token is bound to a
    // PROJECT (not a single article), so validation is delegated to the
    // feature module which knows the path grammar + scope rules.
    if (urlPath.startsWith('/agent/wiki/')) {
      const result = await validateWikiShareToken({
        rawToken: shareRaw,
        urlPath,
        db,
      });
      if (!result.ok) {
        const status = result.error === 'wrong_scope' ? 403 : 401;
        return c.json({ error: `share_token_${result.error}` }, status);
      }

      const [u] = await db
        .select()
        .from(schema.users)
        .where(
          and(
            eq(schema.users.id, result.userId),
            eq(schema.users.is_active, true),
          ),
        )
        .limit(1);
      if (!u) return c.json({ error: 'share_token_invalid' }, 401);

      c.set('user', {
        userId: u.id,
        teamId: u.team_id,
        role: u.role as 'admin' | 'collaborator',
      });
      // Wiki share tokens grant project-scoped read access; they don't
      // need stories / attachments scopes (those belong to story shares).
      c.set('scopes', { wiki: 'read', projects: 'read' });
      c.set('tokenKind', 'share');
      c.set('shareTokenId', result.tokenId);
      c.set('shareTokenScope', { type: 'project', id: result.projectId });

      await next();
      return;
    }

    // --- Story share-token branch (legacy path shape) ----------------
    const shareHash = await hashToken(shareRaw);

    const [shareRow] = await db
      .select()
      .from(schema.storyShareTokens)
      .where(eq(schema.storyShareTokens.token_hash, shareHash))
      .limit(1);

    if (!shareRow) {
      return c.json({ error: 'share_token_invalid' }, 401);
    }
    if (shareRow.revoked_at) {
      return c.json({ error: 'share_token_revoked' }, 401);
    }
    const expiresMs = Date.parse(shareRow.expires_at);
    if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
      return c.json({ error: 'share_token_expired' }, 401);
    }

    // Bind the token to its story: the URL must target this exact story.
    // Allowed path shapes:
    //   - /agent/story/<bound_id>            (manifest)
    //   - /agent/story/<bound_id>/<sub>      (description, criteria, ...)
    //   - /agent/story/<bound_id>/attachment/<any_id>
    //     (attachment download — the handler re-verifies that the
    //     attachment belongs to the bound story + team).
    //   - /agent/project/<project_id>/context (ONLY if the bound story
    //     lives in that project — the handler re-verifies this).
    //
    // We match on exact path segments (no substring / prefix tricks) to
    // avoid edge cases where a crafted URL incidentally contains the
    // bound id as a substring.
    const segments = urlPath.split('/').filter((s) => s.length > 0);
    // segments[0] must be 'agent' for any of our routes.
    const isStoryPath =
      segments[0] === 'agent' &&
      segments[1] === 'story' &&
      segments[2] === shareRow.story_id;
    const isProjectPath =
      segments[0] === 'agent' &&
      segments[1] === 'project' &&
      segments[3] === 'context';
    if (!isStoryPath && !isProjectPath) {
      return c.json({ error: 'share_token_wrong_story' }, 401);
    }

    // Resolve the owning user for team context.
    const [shareUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, shareRow.user_id))
      .limit(1);

    if (!shareUser || !shareUser.is_active) {
      return c.json({ error: 'share_token_invalid' }, 401);
    }

    c.set('user', {
      userId: shareUser.id,
      teamId: shareUser.team_id,
      role: shareUser.role as 'admin' | 'collaborator',
    });
    c.set('scopes', { ...SHARE_TOKEN_SCOPES });
    c.set('tokenKind', 'share');
    c.set('shareTokenId', shareRow.id);
    c.set('shareTokenScope', { type: 'story', id: shareRow.story_id });

    // Note: we intentionally do NOT track last_used_at on share tokens.
    // They're ephemeral / regeneratable and audit is better served by the
    // rate-limiter + Cloudflare request logs.

    await next();
    return;
  }

  // --- PAT path (Authorization: Bearer dk_*) ---------------------------
  const authHeader = c.req.header('Authorization') ?? '';
  if (!authHeader.startsWith(BEARER_PREFIX)) {
    return next();
  }
  const token = authHeader.slice(BEARER_PREFIX.length);
  if (!token.startsWith(PAT_PREFIX)) {
    // Not a PAT (e.g. the legacy global API_KEY). Let authMiddleware handle it.
    return next();
  }

  const db = c.get('db');
  const tokenHash = await hashToken(token);

  const [row] = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.token_hash, tokenHash))
    .limit(1);

  if (!row) {
    return c.json({ error: 'token_invalid' }, 401);
  }
  if (row.revoked_at) {
    return c.json({ error: 'token_revoked' }, 401);
  }
  if (row.expires_at) {
    const expiresMs = Date.parse(row.expires_at);
    if (!Number.isNaN(expiresMs) && expiresMs <= Date.now()) {
      return c.json({ error: 'token_expired' }, 401);
    }
  }

  // Resolve the owning user to get teamId/role.
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, row.user_id))
    .limit(1);

  if (!user || !user.is_active) {
    return c.json({ error: 'token_invalid' }, 401);
  }

  let scopes: Record<string, ScopeLevel> = {};
  try {
    const parsed = JSON.parse(row.scopes);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      scopes = parsed as Record<string, ScopeLevel>;
    }
  } catch {
    // Malformed scope JSON → treat as no scopes.
    scopes = {};
  }

  c.set('user', {
    userId: user.id,
    teamId: user.team_id,
    role: user.role as 'admin' | 'collaborator',
  });
  c.set('scopes', scopes);
  c.set('tokenId', row.id);
  c.set('tokenKind', 'pat');

  // Best-effort last-used tracking. Never throw from this path.
  // Only trust CF-Connecting-IP (set by Cloudflare on the edge). Do NOT
  // fall back to X-Forwarded-For: on Workers that header is client-supplied
  // and trivially spoofable, which would poison the audit trail.
  const ip = c.req.header('CF-Connecting-IP') ?? null;
  try {
    await db
      .update(schema.apiTokens)
      .set({
        last_used_at: new Date().toISOString(),
        last_used_ip: ip,
      })
      .where(eq(schema.apiTokens.id, row.id));
  } catch {
    // Swallow: tracking failure must not block auth.
  }

  await next();
});

/**
 * Enforces a scope (`module:action`) on a route. Must be placed AFTER
 * `authMiddleware` so that `c.var.user` is always set.
 *
 * Rules:
 * - If the request was authenticated via PAT (`c.var.tokenId` is set), enforce
 *   the scope. "write" grants read+write; "read" grants read only; "none" (or
 *   missing entry) denies everything.
 * - If the request was authenticated via session cookie or the global API_KEY
 *   (no `tokenId`), skip the check — session/admin users have full access.
 */
export const requireScope = (module: string, action: 'read' | 'write') =>
  createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
    const tokenId = c.get('tokenId');
    if (!tokenId) {
      // Session cookie or global API_KEY: full access.
      return next();
    }

    const scopes = (c.get('scopes') ?? {}) as Record<string, ScopeLevel>;
    const granted: ScopeLevel = scopes[module] ?? 'none';

    const allowed =
      action === 'read'
        ? granted === 'read' || granted === 'write'
        : granted === 'write';

    if (!allowed) {
      return c.json(
        {
          error: 'token_scope_insufficient',
          required: `${module}:${action}`,
          granted: `${module}:${granted}`,
        },
        403,
      );
    }

    await next();
  });

/**
 * Rate limiter for the public /agent/* surface.
 *
 * Key priority (most specific → least):
 *   1. PAT id         — one bucket per token
 *   2. share-token id — one bucket per share link
 *   3. CF-Connecting-IP — best-effort protection against unauthed bursts
 *   4. 'anonymous'    — last-resort bucket, shared by all keyless callers
 *
 * Fails open if the binding is missing (local dev without
 * --experimental-rate-limit). That matches existing "best-effort" patterns
 * in this codebase and avoids blocking legitimate local work.
 */
export const agentRateLimitMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const key =
    c.get('tokenId') ??
    c.get('shareTokenId') ??
    c.req.header('CF-Connecting-IP') ??
    'anonymous';
  try {
    const rl = (c.env as any).AGENT_RL;
    if (rl && typeof rl.limit === 'function') {
      const { success } = await rl.limit({ key });
      if (!success) {
        return c.json({ error: 'rate_limit_exceeded' }, 429);
      }
    }
  } catch {
    // Binding missing or threw — fail open.
  }
  await next();
});
