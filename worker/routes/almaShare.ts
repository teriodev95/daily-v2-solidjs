import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { asc, eq, lt } from 'drizzle-orm';
import type { AppDb, Env, Variables } from '../types';
import * as schema from '../db/schema';
import { hashToken } from '../lib/tokenCrypto';

const almaShare = new Hono<{ Bindings: Env; Variables: Variables }>();

type AlmaRow = typeof schema.almaDocuments.$inferSelect;

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function recordAlmaShareEvent(
  db: AppDb,
  c: { get: (key: 'user' | 'tokenKind' | 'tokenId') => any },
  args: {
    alma: Pick<AlmaRow, 'id' | 'team_id'>;
    eventType: 'alma.share_created' | 'alma.share_resolved' | 'alma.share_revoked';
    linkId: string;
  },
): Promise<void> {
  const user = c.get('user');
  const tokenKind = c.get('tokenKind');
  const tokenId = c.get('tokenId');
  await db.insert(schema.almaShareAuditEvents).values({
    alma_id: args.alma.id,
    team_id: args.alma.team_id,
    actor_user_id: user?.userId ?? null,
    actor_token_id: tokenId ?? null,
    actor_type: tokenKind === 'pat' ? 'pat' : user ? 'session' : 'system',
    event_type: args.eventType,
    metadata: JSON.stringify({ link_id: args.linkId }),
    created_at: new Date().toISOString(),
  });
}

// Public resolver. Missing, expired, revoked and deleted documents all return
// the same 404 so a caller cannot distinguish token state.
almaShare.get('/:ref', async (c) => {
  const db = c.get('db');
  const [link] = await db
    .select()
    .from(schema.almaShareLinks)
    .where(eq(schema.almaShareLinks.token_hash, await hashToken(c.req.param('ref'))))
    .limit(1);

  if (!link || link.revoked_at || link.expires_at <= new Date().toISOString()) {
    return c.json({ error: 'Not found' }, 404);
  }

  const [alma] = await db
    .select()
    .from(schema.almaDocuments)
    .where(eq(schema.almaDocuments.id, link.alma_id))
    .limit(1);
  if (!alma) return c.json({ error: 'Not found' }, 404);

  const blocks = await db
    .select({
      id: schema.almaBlocks.id,
      text: schema.almaBlocks.text,
      locked: schema.almaBlocks.locked,
      sort: schema.almaBlocks.sort,
    })
    .from(schema.almaBlocks)
    .where(eq(schema.almaBlocks.alma_id, alma.id))
    .orderBy(asc(schema.almaBlocks.sort));

  try {
    const usedAt = new Date().toISOString();
    await db
      .update(schema.almaShareLinks)
      .set({ last_used_at: usedAt })
      .where(eq(schema.almaShareLinks.id, link.id));
  } catch {
    // Usage timestamp is best-effort; the append-only audit below is required.
  }
  await recordAlmaShareEvent(db, c, {
    alma,
    eventType: 'alma.share_resolved',
    linkId: link.id,
  });

  c.header('Cache-Control', 'private, no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  return c.json({
    title: alma.title,
    tier: alma.tier,
    kind: alma.kind,
    content: blocks.length > 0 ? blocks.map((block) => block.text).join('\n\n') : alma.content,
    tags: parseTags(alma.tags),
    source: alma.source,
    updated_at: alma.updated_at,
    expires_at: link.expires_at,
    blocks,
  });
});

export async function purgeExpiredAlmaShareLinks(env: Env): Promise<void> {
  const db = drizzle(env.DB, { schema });
  try {
    await db
      .delete(schema.almaShareLinks)
      .where(lt(schema.almaShareLinks.expires_at, new Date().toISOString()));
  } catch {
    // Best-effort cron cleanup; expiration is still enforced on every resolve.
  }
}

export default almaShare;
