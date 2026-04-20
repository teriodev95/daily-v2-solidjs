import { and, eq, isNull } from 'drizzle-orm';
import type { AppDb } from '../../types';
import {
  generateShareToken,
  hashToken,
  shareTokenPrefix,
} from '../../lib/tokenCrypto';
import { wikiShareTokens } from './schema';

const SHARE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type WikiShareTokenRow = typeof wikiShareTokens.$inferSelect;

export class WikiShareTokenConflictError extends Error {
  constructor(message = 'share_token_rotation_conflict') {
    super(message);
    this.name = 'WikiShareTokenConflictError';
  }
}

/**
 * Rotates the active share token for a (project, user) pair.
 *
 * Behavior:
 *  1. Any existing active (non-revoked) token for the pair is revoked
 *     (UPDATE revoked_at = now). The partial unique index on the table
 *     (migration 0014) requires the previous active row to be revoked
 *     BEFORE the new one is inserted.
 *  2. A fresh token with a 30-day TTL is minted.
 *
 * On UNIQUE collision (a concurrent rotation raced us), throws
 * `WikiShareTokenConflictError` so the caller can surface a 409.
 */
export async function rotateWikiShareToken(
  db: AppDb,
  params: {
    projectId: string;
    userId: string;
    entryArticleId: string;
    baseUrl: string;
  },
): Promise<{
  shareUrl: string;
  rawToken: string;
  expiresAt: string;
  previousRevoked: boolean;
}> {
  const nowIso = new Date().toISOString();

  // 1) Revoke previous active token(s) for this pair, if any.
  const existing = await db
    .select()
    .from(wikiShareTokens)
    .where(
      and(
        eq(wikiShareTokens.project_id, params.projectId),
        eq(wikiShareTokens.user_id, params.userId),
        isNull(wikiShareTokens.revoked_at),
      ),
    );

  let previousRevoked = false;
  for (const row of existing) {
    await db
      .update(wikiShareTokens)
      .set({ revoked_at: nowIso })
      .where(eq(wikiShareTokens.id, row.id));
    previousRevoked = true;
  }

  // 2) Mint the new token.
  const rawToken = generateShareToken();
  const tokenHash = await hashToken(rawToken);
  const prefix = shareTokenPrefix(rawToken);
  const expiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_MS).toISOString();
  const id = crypto.randomUUID();

  try {
    await db.insert(wikiShareTokens).values({
      id,
      project_id: params.projectId,
      user_id: params.userId,
      entry_article_id: params.entryArticleId,
      token_hash: tokenHash,
      prefix,
      expires_at: expiresAt,
      created_at: nowIso,
      revoked_at: null,
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (/UNIQUE/i.test(msg) || /constraint/i.test(msg)) {
      throw new WikiShareTokenConflictError();
    }
    throw err;
  }

  const shareUrl = `${params.baseUrl}/agent/wiki/${params.entryArticleId}?s=${rawToken}`;

  return { shareUrl, rawToken, expiresAt, previousRevoked };
}

/**
 * Revokes a specific token by its id. Idempotent — revoking an already-revoked
 * row is a no-op (revoked_at is preserved at its original value).
 */
export async function revokeWikiShareToken(db: AppDb, tokenId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await db
    .update(wikiShareTokens)
    .set({ revoked_at: nowIso })
    .where(
      and(
        eq(wikiShareTokens.id, tokenId),
        isNull(wikiShareTokens.revoked_at),
      ),
    );
}

/**
 * Returns all active (non-revoked, non-expired) share tokens owned by a user.
 * "Expired" is computed in-memory because expires_at is an ISO string.
 */
export async function listActiveWikiShareTokens(
  db: AppDb,
  userId: string,
): Promise<WikiShareTokenRow[]> {
  const rows = await db
    .select()
    .from(wikiShareTokens)
    .where(
      and(
        eq(wikiShareTokens.user_id, userId),
        isNull(wikiShareTokens.revoked_at),
      ),
    );

  const now = Date.now();
  return rows.filter((r) => {
    const ms = Date.parse(r.expires_at);
    return !Number.isNaN(ms) && ms > now;
  });
}
