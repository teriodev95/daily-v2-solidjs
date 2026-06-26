import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';
import { decryptString } from '../lib/aesGcm';
import { hashToken } from '../lib/tokenCrypto';
import { recordSecretEvent } from './secrets';

/**
 * Resolve endpoint for secret share links. Lives OUTSIDE the `/api/secrets/*`
 * gate on purpose: it authorizes by "this URL token is bound to the PAT making
 * the request" (`link.token_id === tokenId`) — the least privilege needed — and
 * NOT by the `secrets` scope. A holder of the URL still needs the exact PAT it
 * was minted for; either factor alone resolves nothing.
 *
 * Mounted in index.ts behind the same global-API-key guard as secrets, plus
 * tokenAuthMiddleware + authMiddleware. No requireAdmin, no enforceScope.
 */
const secretShare = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /:ref — resolve a share link to the secret plaintext. Two factors: the
// `ss_` URL token (`ref`) AND its bound PAT. The value is NEVER logged.
secretShare.get('/:ref', async (c) => {
  // Must be a PAT — session cookies / the global API key can't drive a link.
  if (c.get('tokenKind') !== 'pat') {
    return c.json({ error: 'pat_required' }, 403);
  }
  const tokenId = c.get('tokenId');

  const ref = c.req.param('ref');
  const db = c.get('db');

  const [link] = await db
    .select()
    .from(schema.secretShareLinks)
    .where(eq(schema.secretShareLinks.token_hash, await hashToken(ref)))
    .limit(1);

  if (!link || link.revoked_at) {
    return c.json({ error: 'Not found' }, 404);
  }

  // The URL only resolves for the PAT it was bound to. Return 404 (not 403) so
  // a non-bound PAT can't tell "this link exists but isn't mine" from "no such
  // link" — same opaque response as a revoked/missing link above.
  if (link.token_id !== tokenId) {
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

  // Audit: metadata carries ids only; the value never touches the log.
  await recordSecretEvent(db, c, {
    secret,
    event_type: 'secret.share_resolved',
    metadata: { link_id: link.id, token_id: link.token_id },
  });

  return c.json({ value, key: secret.key, name: secret.name });
});

export default secretShare;
