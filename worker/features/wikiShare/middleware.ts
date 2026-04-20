import { eq } from 'drizzle-orm';
import type { AppDb } from '../../types';
import { hashToken } from '../../lib/tokenCrypto';
import { users, wikiArticles } from '../../db/schema';
import { wikiShareTokens } from './schema';
import type { PathClass, ShareTokenValidation } from './types';

/**
 * Parses a path into the shape the wiki-share middleware recognizes.
 *
 * Accepted shapes (segments-exact, no prefix/substring matches):
 *  - /agent/wiki/<article_id>                          → article manifest
 *  - /agent/wiki/<article_id>/<sub>                    → article sub-resource
 *    where <sub> ∈ { content | outline | graph }
 *  - /agent/wiki/space/<project_id>/<...rest>          → project-level endpoints
 *
 * Anything else is returned as 'unknown' — the caller must reject it.
 */
function classifyPath(urlPath: string): PathClass {
  const segments = urlPath.split('/').filter((s) => s.length > 0);

  // All valid shapes start with 'agent', 'wiki'.
  if (segments[0] !== 'agent' || segments[1] !== 'wiki') {
    return { kind: 'unknown' };
  }

  // /agent/wiki/space/<project_id>/<rest...>
  if (segments[2] === 'space') {
    const projectId = segments[3];
    if (!projectId) return { kind: 'unknown' };
    return { kind: 'space', projectId, rest: segments.slice(4) };
  }

  // /agent/wiki/<article_id>[/<sub>]
  const articleId = segments[2];
  if (!articleId) return { kind: 'unknown' };
  const sub = segments[3];
  if (sub !== undefined) {
    const ALLOWED_SUB = new Set(['content', 'outline', 'graph']);
    if (!ALLOWED_SUB.has(sub)) return { kind: 'unknown' };
    // Disallow deeper nesting for now — keeps the surface tight.
    if (segments.length > 4) return { kind: 'unknown' };
  }
  return { kind: 'article', articleId, sub };
}

/**
 * Validates a raw share token against the request URL.
 *
 * Returns a discriminated union; callers (typically the central
 * `tokenAuthMiddleware`) map the `error` into an HTTP response. This function
 * is intentionally not a Hono middleware so it can be unit-tested and reused
 * by other dispatch points.
 */
export async function validateWikiShareToken(args: {
  rawToken: string;
  urlPath: string;
  db: AppDb;
}): Promise<ShareTokenValidation> {
  const { rawToken, urlPath, db } = args;

  // 1) Hash + lookup.
  const tokenHash = await hashToken(rawToken);
  const [row] = await db
    .select()
    .from(wikiShareTokens)
    .where(eq(wikiShareTokens.token_hash, tokenHash))
    .limit(1);

  if (!row) return { ok: false, error: 'invalid' };

  // 2) Lifecycle checks.
  if (row.revoked_at) return { ok: false, error: 'revoked' };
  const expiresMs = Date.parse(row.expires_at);
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    return { ok: false, error: 'expired' };
  }

  // 3) Path classification + scope check.
  const cls = classifyPath(urlPath);
  if (cls.kind === 'unknown') return { ok: false, error: 'wrong_scope' };

  if (cls.kind === 'space') {
    if (cls.projectId !== row.project_id) {
      return { ok: false, error: 'wrong_scope' };
    }
  } else if (cls.kind === 'article') {
    // Article must live in the token's project. We hit the DB once — cheap
    // and keeps the middleware authoritative instead of trusting path shape.
    const [article] = await db
      .select({ project_id: wikiArticles.project_id })
      .from(wikiArticles)
      .where(eq(wikiArticles.id, cls.articleId))
      .limit(1);

    if (!article) return { ok: false, error: 'wrong_scope' };
    if (article.project_id !== row.project_id) {
      return { ok: false, error: 'wrong_scope' };
    }
  }

  // 4) Resolve team via owning user (active-check is re-asserted by the
  // central middleware, which also sets the Hono context).
  const [owner] = await db
    .select({ team_id: users.team_id })
    .from(users)
    .where(eq(users.id, row.user_id))
    .limit(1);

  if (!owner) return { ok: false, error: 'invalid' };

  return {
    ok: true,
    projectId: row.project_id,
    userId: row.user_id,
    teamId: owner.team_id,
    tokenId: row.id,
    expiresAt: row.expires_at,
  };
}
