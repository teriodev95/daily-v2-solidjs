import { Hono } from 'hono';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { Env, Variables, AppDb } from '../types';
import * as schema from '../db/schema';
import { encryptString, decryptString } from '../lib/aesGcm';

const secrets = new Hono<{ Bindings: Env; Variables: Variables }>();

// ----- Validation helpers --------------------------------------------------

const KNOWN_ENVIRONMENTS = ['dev', 'staging', 'prod', 'local'] as const;
const ENV_SLUG_RE = /^[a-z0-9_-]{1,20}$/;

type SecretRow = typeof schema.secrets.$inferSelect;

function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === 'string');
    }
  } catch {
    // fallthrough
  }
  return [];
}

// Validates a tags input: must be an array of non-empty strings.
function validateTags(raw: unknown): { ok: true; tags: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'tags must be an array of strings' };
  }
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') {
      return { ok: false, error: 'tags must be an array of strings' };
    }
    const trimmed = t.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > 40) {
      return { ok: false, error: 'each tag must be 1-40 chars' };
    }
    out.push(trimmed);
  }
  return { ok: true, tags: out };
}

// A secret can apply to several environments at once (e.g. an API key valid in
// dev + prod). They're stored JSON-encoded in the `environment` column; reads
// stay tolerant of legacy single-string values written before multi-env.
function parseEnvironments(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((e): e is string => typeof e === 'string');
  } catch {
    // Legacy single-string value (e.g. "prod").
  }
  const trimmed = raw.trim();
  return trimmed ? [trimmed] : [];
}

function isValidEnv(value: string): boolean {
  return (
    KNOWN_ENVIRONMENTS.includes(value as (typeof KNOWN_ENVIRONMENTS)[number]) ||
    ENV_SLUG_RE.test(value)
  );
}

// Validates an `environments` array: each entry a known label or a simple slug.
function validateEnvironments(
  raw: unknown,
): { ok: true; environments: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'environments must be an array of strings' };
  }
  const out: string[] = [];
  for (const e of raw) {
    if (typeof e !== 'string') {
      return { ok: false, error: 'environments must be an array of strings' };
    }
    const value = e.trim();
    if (value === '') continue;
    if (!isValidEnv(value)) {
      return {
        ok: false,
        error: "each environment must be 'dev'|'staging'|'prod'|'local' or a slug ^[a-z0-9_-]{1,20}$",
      };
    }
    if (!out.includes(value)) out.push(value);
  }
  return { ok: true, environments: out };
}

// Serialize an environments array for storage (null when empty).
function serializeEnvironments(envs: string[]): string | null {
  return envs.length ? JSON.stringify(envs) : null;
}

// Verifies a project belongs to the caller's team. Returns null if it does,
// otherwise a ready-to-return error object.
async function assertProjectInTeam(
  db: AppDb,
  projectId: string,
  teamId: string,
): Promise<{ ok: true } | { ok: false }> {
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.team_id, teamId)))
    .limit(1);
  return project ? { ok: true } : { ok: false };
}

// Strip the encrypted value before returning a secret to the client. The value
// is ONLY ever exposed via the reveal endpoint. `last_event` is attached by the
// caller (list endpoint); single-row reads return it as null.
function toPublicSecret(
  row: SecretRow,
  lastEvent: { event_type: string; created_at: string } | null = null,
) {
  return {
    id: row.id,
    team_id: row.team_id,
    project_id: row.project_id,
    name: row.name,
    key: row.key,
    environments: parseEnvironments(row.environment),
    tags: parseTags(row.tags),
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    revoked_at: row.revoked_at,
    last_event: lastEvent,
  };
}

// Append-only audit write. Derives the actor from auth context:
// - actor_type: 'pat' when authenticated via a Personal Access Token, else 'session'.
// - actor_token_id: the PAT id when present, else null.
// - actor_user_id: the resolved user id.
// Best-effort metadata is JSON-serialized. NEVER include the secret value.
async function recordSecretEvent(
  db: AppDb,
  c: { get: (k: 'user' | 'tokenKind' | 'tokenId') => any },
  args: {
    secret: Pick<SecretRow, 'id' | 'team_id' | 'project_id'>;
    event_type: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const user = c.get('user');
  const tokenKind = c.get('tokenKind');
  const tokenId = c.get('tokenId');
  await db.insert(schema.secretAuditEvents).values({
    secret_id: args.secret.id,
    team_id: args.secret.team_id,
    project_id: args.secret.project_id,
    actor_user_id: user.userId,
    actor_token_id: tokenId ?? null,
    actor_type: tokenKind === 'pat' ? 'pat' : 'session',
    event_type: args.event_type,
    metadata: JSON.stringify(args.metadata ?? {}),
    created_at: new Date().toISOString(),
  });
}

// ----- Routes --------------------------------------------------------------

// GET / — list team secrets metadata (non-revoked by default). Never includes
// the value. Optional filters: project_id, environment, tag, q (name/key).
secrets.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  const projectId = c.req.query('project_id');
  const environment = c.req.query('environment');
  const tag = c.req.query('tag');
  const q = c.req.query('q');

  let rows = await db
    .select()
    .from(schema.secrets)
    .where(and(eq(schema.secrets.team_id, user.teamId), isNull(schema.secrets.revoked_at)));

  if (projectId) rows = rows.filter((r) => r.project_id === projectId);
  if (environment) rows = rows.filter((r) => parseEnvironments(r.environment).includes(environment));
  if (tag) rows = rows.filter((r) => parseTags(r.tags).includes(tag));
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.key.toLowerCase().includes(needle),
    );
  }

  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Attach last_event per secret. N is small (team-scoped, non-revoked), so a
  // per-secret latest-event lookup is fine.
  const result = await Promise.all(
    rows.map(async (row) => {
      const [last] = await db
        .select({
          event_type: schema.secretAuditEvents.event_type,
          created_at: schema.secretAuditEvents.created_at,
        })
        .from(schema.secretAuditEvents)
        .where(eq(schema.secretAuditEvents.secret_id, row.id))
        .orderBy(desc(schema.secretAuditEvents.created_at))
        .limit(1);
      return toPublicSecret(row, last ?? null);
    }),
  );

  return c.json(result);
});

// POST / — create a secret. Encrypts the value; returns metadata only.
secrets.post('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  let body: {
    name?: unknown;
    key?: unknown;
    value?: unknown;
    project_id?: unknown;
    environments?: unknown;
    tags?: unknown;
  };
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
  if (name.length < 1 || name.length > 100) {
    return c.json({ error: 'name must be 1-100 chars', field: 'name' }, 400);
  }

  // key
  if (typeof body.key !== 'string') {
    return c.json({ error: 'key is required', field: 'key' }, 400);
  }
  const key = body.key.trim();
  if (key.length < 1 || key.length > 100) {
    return c.json({ error: 'key must be 1-100 chars', field: 'key' }, 400);
  }

  // value (never logged, never echoed back)
  if (typeof body.value !== 'string' || body.value.length === 0) {
    return c.json({ error: 'value is required', field: 'value' }, 400);
  }

  // project_id (optional, must belong to the team)
  let projectId: string | null = null;
  if (body.project_id !== undefined && body.project_id !== null) {
    if (typeof body.project_id !== 'string') {
      return c.json({ error: 'project_id must be a string', field: 'project_id' }, 400);
    }
    const check = await assertProjectInTeam(db, body.project_id, user.teamId);
    if (!check.ok) {
      return c.json({ error: 'project_id not found in team', field: 'project_id' }, 400);
    }
    projectId = body.project_id;
  }

  // environments (optional; a secret can apply to several at once)
  let environments: string[] = [];
  if (body.environments !== undefined && body.environments !== null) {
    const envResult = validateEnvironments(body.environments);
    if (!envResult.ok) {
      return c.json({ error: envResult.error, field: 'environments' }, 400);
    }
    environments = envResult.environments;
  }

  // tags (optional)
  let tags: string[] = [];
  if (body.tags !== undefined && body.tags !== null) {
    const tagsResult = validateTags(body.tags);
    if (!tagsResult.ok) {
      return c.json({ error: tagsResult.error, field: 'tags' }, 400);
    }
    tags = tagsResult.tags;
  }

  // Require encryption key.
  const keyHex = c.env.SECRETS_ENCRYPTION_KEY;
  if (!keyHex) {
    return c.json({ error: 'SECRETS_ENCRYPTION_KEY not configured' }, 500);
  }

  let encryptedValue: string;
  try {
    encryptedValue = await encryptString(body.value, keyHex);
  } catch {
    // Do NOT leak the value or key details.
    return c.json({ error: 'Failed to encrypt secret value' }, 500);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.secrets).values({
    id,
    team_id: user.teamId,
    project_id: projectId,
    name,
    key,
    encrypted_value: encryptedValue,
    environment: serializeEnvironments(environments),
    tags: JSON.stringify(tags),
    created_by: user.userId,
    updated_by: null,
    created_at: now,
    updated_at: now,
    revoked_at: null,
  });

  const [created] = await db
    .select()
    .from(schema.secrets)
    .where(eq(schema.secrets.id, id))
    .limit(1);

  await recordSecretEvent(db, c, {
    secret: created,
    event_type: 'secret.created',
  });

  return c.json(toPublicSecret(created), 201);
});

// GET /:id — single secret metadata (team-scoped). Never includes the value.
secrets.get('/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const [row] = await db
    .select()
    .from(schema.secrets)
    .where(eq(schema.secrets.id, id))
    .limit(1);

  if (!row || row.team_id !== user.teamId) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(toPublicSecret(row));
});

// PATCH /:id — update metadata and/or value. Re-encrypts only if `value` is
// present. Emits secret.updated always, plus targeted events on project/tag
// changes.
secrets.patch('/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const [row] = await db
    .select()
    .from(schema.secrets)
    .where(eq(schema.secrets.id, id))
    .limit(1);

  if (!row || row.team_id !== user.teamId || row.revoked_at) {
    return c.json({ error: 'Not found' }, 404);
  }

  const updates: Partial<SecretRow> = {};
  let projectChanged = false;
  let tagsChanged = false;
  let nextProjectId = row.project_id;

  // name
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return c.json({ error: 'name must be a string', field: 'name' }, 400);
    }
    const name = body.name.trim();
    if (name.length < 1 || name.length > 100) {
      return c.json({ error: 'name must be 1-100 chars', field: 'name' }, 400);
    }
    updates.name = name;
  }

  // key
  if (body.key !== undefined) {
    if (typeof body.key !== 'string') {
      return c.json({ error: 'key must be a string', field: 'key' }, 400);
    }
    const key = body.key.trim();
    if (key.length < 1 || key.length > 100) {
      return c.json({ error: 'key must be 1-100 chars', field: 'key' }, 400);
    }
    updates.key = key;
  }

  // value → re-encrypt
  if (body.value !== undefined) {
    if (typeof body.value !== 'string' || body.value.length === 0) {
      return c.json({ error: 'value must be a non-empty string', field: 'value' }, 400);
    }
    const keyHex = c.env.SECRETS_ENCRYPTION_KEY;
    if (!keyHex) {
      return c.json({ error: 'SECRETS_ENCRYPTION_KEY not configured' }, 500);
    }
    try {
      updates.encrypted_value = await encryptString(body.value, keyHex);
    } catch {
      return c.json({ error: 'Failed to encrypt secret value' }, 500);
    }
  }

  // project_id (nullable; must belong to team when set)
  if (body.project_id !== undefined) {
    if (body.project_id === null) {
      nextProjectId = null;
    } else if (typeof body.project_id !== 'string') {
      return c.json({ error: 'project_id must be a string or null', field: 'project_id' }, 400);
    } else {
      const check = await assertProjectInTeam(db, body.project_id, user.teamId);
      if (!check.ok) {
        return c.json({ error: 'project_id not found in team', field: 'project_id' }, 400);
      }
      nextProjectId = body.project_id;
    }
    if (nextProjectId !== row.project_id) {
      projectChanged = true;
      updates.project_id = nextProjectId;
    }
  }

  // environments (nullable; replaces the whole set when provided)
  if (body.environments !== undefined) {
    if (body.environments === null) {
      updates.environment = null;
    } else {
      const envResult = validateEnvironments(body.environments);
      if (!envResult.ok) {
        return c.json({ error: envResult.error, field: 'environments' }, 400);
      }
      updates.environment = serializeEnvironments(envResult.environments);
    }
  }

  // tags
  if (body.tags !== undefined) {
    const tagsResult = validateTags(body.tags);
    if (!tagsResult.ok) {
      return c.json({ error: tagsResult.error, field: 'tags' }, 400);
    }
    const nextTags = tagsResult.tags;
    const prevTags = parseTags(row.tags);
    const sameTags =
      prevTags.length === nextTags.length && prevTags.every((t, i) => t === nextTags[i]);
    if (!sameTags) {
      tagsChanged = true;
      updates.tags = JSON.stringify(nextTags);
    }
  }

  const now = new Date().toISOString();
  await db
    .update(schema.secrets)
    .set({ ...updates, updated_by: user.userId, updated_at: now })
    .where(eq(schema.secrets.id, id));

  const [updated] = await db
    .select()
    .from(schema.secrets)
    .where(eq(schema.secrets.id, id))
    .limit(1);

  // Always emit secret.updated; add targeted events for the deltas that matter.
  await recordSecretEvent(db, c, { secret: updated, event_type: 'secret.updated' });
  if (projectChanged) {
    await recordSecretEvent(db, c, {
      secret: updated,
      event_type: 'secret.associated_project_changed',
      metadata: { from: row.project_id, to: updated.project_id },
    });
  }
  if (tagsChanged) {
    await recordSecretEvent(db, c, {
      secret: updated,
      event_type: 'secret.tags_changed',
      metadata: { from: parseTags(row.tags), to: parseTags(updated.tags) },
    });
  }

  return c.json(toPublicSecret(updated));
});

// DELETE /:id — soft delete (set revoked_at). Keeps the audit trail intact.
secrets.delete('/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const [row] = await db
    .select()
    .from(schema.secrets)
    .where(eq(schema.secrets.id, id))
    .limit(1);

  if (!row || row.team_id !== user.teamId) {
    return c.json({ error: 'Not found' }, 404);
  }

  if (!row.revoked_at) {
    await db
      .update(schema.secrets)
      .set({ revoked_at: new Date().toISOString(), updated_by: user.userId })
      .where(eq(schema.secrets.id, id));
    await recordSecretEvent(db, c, { secret: row, event_type: 'secret.deleted' });
  }

  return c.json({ ok: true });
});

// POST /:id/reveal — decrypt and return the value. POST so enforceScope demands
// secrets:write (a secrets:read PAT cannot reveal). Records secret.revealed.
secrets.post('/:id/reveal', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const [row] = await db
    .select()
    .from(schema.secrets)
    .where(eq(schema.secrets.id, id))
    .limit(1);

  if (!row || row.team_id !== user.teamId || row.revoked_at) {
    return c.json({ error: 'Not found' }, 404);
  }

  const keyHex = c.env.SECRETS_ENCRYPTION_KEY;
  if (!keyHex) {
    return c.json({ error: 'SECRETS_ENCRYPTION_KEY not configured' }, 500);
  }

  let value: string;
  try {
    value = await decryptString(row.encrypted_value, keyHex);
  } catch {
    return c.json({ error: 'Failed to decrypt secret value' }, 500);
  }

  await recordSecretEvent(db, c, { secret: row, event_type: 'secret.revealed' });

  return c.json({ value });
});

// GET /:id/audit — audit events for a secret (team-scoped), newest first.
secrets.get('/:id/audit', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const [row] = await db
    .select()
    .from(schema.secrets)
    .where(eq(schema.secrets.id, id))
    .limit(1);

  if (!row || row.team_id !== user.teamId) {
    return c.json({ error: 'Not found' }, 404);
  }

  const events = await db
    .select()
    .from(schema.secretAuditEvents)
    .where(eq(schema.secretAuditEvents.secret_id, id))
    .orderBy(desc(schema.secretAuditEvents.created_at));

  return c.json(events);
});

export default secrets;
