import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, lt } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';
import { decryptString } from '../lib/aesGcm';
import { hashToken } from '../lib/tokenCrypto';
import { recordSecretEvent } from './secrets';

/**
 * PUBLIC resolve endpoint for ephemeral secret share links (issue #8). No
 * auth: the security model is the unguessable `ss_` token (only its hash is
 * stored), a 5-minute server-side TTL, IP rate limiting and per-resolve
 * auditing. 404 is uniform across missing / revoked / expired / dead-secret
 * so the endpoint leaks nothing about why a ref failed.
 */
const secretShare = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /:ref — resolve a share link to the secret plaintext while the link is
// alive (not revoked, not past its 5-minute window). The value is NEVER logged.
secretShare.get('/:ref', async (c) => {
  const ref = c.req.param('ref');
  const db = c.get('db');

  const [link] = await db
    .select()
    .from(schema.secretShareLinks)
    .where(eq(schema.secretShareLinks.token_hash, await hashToken(ref)))
    .limit(1);

  // Uniform 404: missing, revoked or expired all look the same to the caller.
  if (!link || link.revoked_at || link.expires_at <= new Date().toISOString()) {
    return c.json({ error: 'Not found' }, 404);
  }

  const [secret] = await db
    .select()
    .from(schema.secrets)
    .where(eq(schema.secrets.id, link.secret_id))
    .limit(1);

  if (!secret || secret.revoked_at) {
    return c.json({ error: 'Not found' }, 404);
  }

  const keyHex = c.env.SECRETS_ENCRYPTION_KEY;
  if (!keyHex) {
    return c.json({ error: 'SECRETS_ENCRYPTION_KEY not configured' }, 500);
  }

  let value: string;
  try {
    value = await decryptString(secret.encrypted_value, keyHex);
  } catch {
    return c.json({ error: 'Failed to decrypt secret value' }, 500);
  }

  // Best-effort usage tracking — never block the resolve on a write failure.
  try {
    await db
      .update(schema.secretShareLinks)
      .set({ last_used_at: new Date().toISOString() })
      .where(eq(schema.secretShareLinks.id, link.id));
  } catch {
    // swallow
  }

  // Audit: metadata carries ids only; the value never touches the log. There
  // is no auth context here, so the actor is recorded as 'system'.
  await recordSecretEvent(db, c, {
    secret,
    event_type: 'secret.share_resolved',
    metadata: { link_id: link.id },
  });

  return c.json({ value, key: secret.key, name: secret.name });
});

// Cron hygiene: hard-delete links past their TTL. Revocation/audit history
// lives in secret_audit_events, so dropping the rows loses nothing.
export async function purgeExpiredSecretShareLinks(env: Env): Promise<void> {
  const db = drizzle(env.DB, { schema });
  try {
    await db
      .delete(schema.secretShareLinks)
      .where(lt(schema.secretShareLinks.expires_at, new Date().toISOString()));
  } catch {
    // Best-effort — next tick retries.
  }
}

export default secretShare;
