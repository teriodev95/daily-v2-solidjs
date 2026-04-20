import { Hono } from 'hono';
import { eq, and, isNull } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';

// Hard cap on concurrently-active (non-revoked) tokens per user.
// Protects against accidental or malicious spam of POST /api/tokens.
const MAX_ACTIVE_TOKENS_PER_USER = 20;
import {
  generateRawToken,
  hashToken,
  encryptToken,
  decryptToken,
  tokenPrefix,
} from '../lib/tokenCrypto';

const tokens = new Hono<{ Bindings: Env; Variables: Variables }>();

// ----- Validation helpers --------------------------------------------------

const VALID_MODULES = [
  'wiki',
  'reports',
  'stories',
  'team',
  'projects',
  'tasks',
  'calendar',
  'learnings',
  'goals',
] as const;

type ModuleName = (typeof VALID_MODULES)[number];
type ScopeAction = 'none' | 'read' | 'write';
type ScopeMap = Record<string, ScopeAction>;

const VALID_ACTIONS: ScopeAction[] = ['none', 'read', 'write'];

function validateScopes(raw: unknown): { ok: true; scopes: ScopeMap } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'scopes must be an object' };
  }
  const out: ScopeMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID_MODULES.includes(key as ModuleName)) {
      return { ok: false, error: `invalid module "${key}"` };
    }
    if (typeof value !== 'string' || !VALID_ACTIONS.includes(value as ScopeAction)) {
      return { ok: false, error: `invalid action for "${key}": must be none|read|write` };
    }
    out[key] = value as ScopeAction;
  }
  return { ok: true, scopes: out };
}

function parseScopes(json: string): ScopeMap {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ScopeMap;
    }
  } catch {
    // fallthrough
  }
  return {};
}

// Strip sensitive fields from a token row before returning it to the client.
function toPublicToken(row: typeof schema.apiTokens.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: parseScopes(row.scopes),
    expires_at: row.expires_at,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
  };
}

// ----- Routes --------------------------------------------------------------

// GET / — list current user's tokens (exclude revoked > 30 days ago)
tokens.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  const rows = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.user_id, user.userId));

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const visible = rows.filter((r) => !r.revoked_at || r.revoked_at >= cutoff);

  visible.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return c.json(visible.map(toPublicToken));
});

// POST / — create new token
tokens.post('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  let body: { name?: unknown; scopes?: unknown; expires_in_days?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // name
  if (typeof body.name !== 'string') {
    return c.json({ error: 'name is required', field: 'name' }, 400);
  }
  const name = body.name.trim();
  if (name.length < 1 || name.length > 50) {
    return c.json({ error: 'name must be 1-50 chars', field: 'name' }, 400);
  }

  // scopes
  const scopesResult = validateScopes(body.scopes);
  if (!scopesResult.ok) {
    return c.json({ error: scopesResult.error, field: 'scopes' }, 400);
  }

  // expires_in_days
  let expiresAt: string | null = null;
  if (body.expires_in_days !== undefined && body.expires_in_days !== null) {
    if (
      typeof body.expires_in_days !== 'number' ||
      !Number.isInteger(body.expires_in_days) ||
      body.expires_in_days < 1 ||
      body.expires_in_days > 3650
    ) {
      return c.json(
        { error: 'expires_in_days must be an integer between 1 and 3650, or null', field: 'expires_in_days' },
        400,
      );
    }
    expiresAt = new Date(Date.now() + body.expires_in_days * 24 * 60 * 60 * 1000).toISOString();
  }

  // Require encryption key
  const keyHex = c.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    return c.json({ error: 'TOKEN_ENCRYPTION_KEY not configured' }, 500);
  }

  // Enforce per-user active token cap (simple abuse/spam guard).
  const activeRows = await db
    .select({ id: schema.apiTokens.id })
    .from(schema.apiTokens)
    .where(and(eq(schema.apiTokens.user_id, user.userId), isNull(schema.apiTokens.revoked_at)));
  if (activeRows.length >= MAX_ACTIVE_TOKENS_PER_USER) {
    return c.json(
      {
        error: `Token limit reached: max ${MAX_ACTIVE_TOKENS_PER_USER} active tokens per user. Revoke an existing one before creating a new one.`,
        field: 'name',
      },
      429,
    );
  }

  const rawToken = generateRawToken();
  const [hash, encrypted] = await Promise.all([
    hashToken(rawToken),
    encryptToken(rawToken, keyHex),
  ]);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const prefix = tokenPrefix(rawToken);
  const scopesJson = JSON.stringify(scopesResult.scopes);

  await db.insert(schema.apiTokens).values({
    id,
    user_id: user.userId,
    name,
    token_encrypted: encrypted,
    token_hash: hash,
    prefix,
    scopes: scopesJson,
    expires_at: expiresAt,
    last_used_at: null,
    last_used_ip: null,
    created_at: now,
    revoked_at: null,
  });

  return c.json(
    {
      id,
      name,
      token: rawToken, // raw token returned ONLY on creation
      prefix,
      scopes: scopesResult.scopes,
      expires_at: expiresAt,
      created_at: now,
    },
    201,
  );
});

// GET /:id/reveal — return decrypted token (only owner)
tokens.get('/:id/reveal', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const [row] = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.id, id))
    .limit(1);

  if (!row || row.user_id !== user.userId) {
    return c.json({ error: 'Not found' }, 404);
  }

  const keyHex = c.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    return c.json({ error: 'TOKEN_ENCRYPTION_KEY not configured' }, 500);
  }

  try {
    const raw = await decryptToken(row.token_encrypted, keyHex);
    return c.json({ token: raw });
  } catch {
    return c.json({ error: 'Failed to decrypt token' }, 500);
  }
});

// DELETE /:id — soft revoke
tokens.delete('/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const [row] = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.id, id))
    .limit(1);

  if (!row || row.user_id !== user.userId) {
    return c.json({ error: 'Not found' }, 404);
  }

  if (!row.revoked_at) {
    await db
      .update(schema.apiTokens)
      .set({ revoked_at: new Date().toISOString() })
      .where(eq(schema.apiTokens.id, id));
  }

  return c.json({ ok: true });
});

export default tokens;
