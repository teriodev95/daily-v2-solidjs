import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { Env, Variables, AppDb } from '../../types';
import { projects } from '../../db/schema';
import {
  clients,
  invoiceSchedules,
  invoices,
  invoiceFiles,
  billingShareTokens,
} from './schema';
import {
  toPublicInvoice,
  loadFilesByInvoice,
  rotateBillingShareToken,
} from './lib';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const FILE_KINDS = ['pdf', 'xml'] as const;
type FileKind = (typeof FILE_KINDS)[number];

const billing = new Hono<{ Bindings: Env; Variables: Variables }>();

// ----- Validation helpers --------------------------------------------------

// Verifies a project belongs to the caller's team.
async function projectInTeam(db: AppDb, projectId: string, teamId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.team_id, teamId)))
    .limit(1);
  return Boolean(row);
}

// Loads a team-scoped client or returns null.
async function loadClient(db: AppDb, id: string, teamId: string) {
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!row || row.team_id !== teamId) return null;
  return row;
}

// Maps a mime type to our pdf/xml whitelist, or null if unsupported.
function inferKind(mime: string): FileKind | null {
  const m = mime.toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m === 'application/xml' || m === 'text/xml') return 'xml';
  return null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// Returns the public Invoice for a single row, loading its files.
async function publicInvoiceById(db: AppDb, row: typeof invoices.$inferSelect) {
  const filesMap = await loadFilesByInvoice(db, [row.id]);
  return toPublicInvoice(row, filesMap.get(row.id) ?? []);
}

// ----- Clients -------------------------------------------------------------

billing.get('/clients', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const rows = await db.select().from(clients).where(eq(clients.team_id, user.teamId));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return c.json(rows);
});

billing.post('/clients', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body.name !== 'string') {
    return c.json({ error: 'name is required', field: 'name' }, 400);
  }
  const name = body.name.trim();
  if (name.length < 1 || name.length > 200) {
    return c.json({ error: 'name must be 1-200 chars', field: 'name' }, 400);
  }

  const razonSocial = typeof body.razon_social === 'string' ? body.razon_social.trim() : '';
  const rfc = typeof body.rfc === 'string' ? body.rfc.trim() : '';

  let projectId: string | null = null;
  if (body.project_id !== undefined && body.project_id !== null) {
    if (typeof body.project_id !== 'string') {
      return c.json({ error: 'project_id must be a string', field: 'project_id' }, 400);
    }
    if (!(await projectInTeam(db, body.project_id, user.teamId))) {
      return c.json({ error: 'project_id not found in team', field: 'project_id' }, 400);
    }
    projectId = body.project_id;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(clients).values({
    id,
    team_id: user.teamId,
    name,
    razon_social: razonSocial,
    rfc,
    project_id: projectId,
    created_at: now,
    updated_at: now,
  });

  const created = await loadClient(db, id, user.teamId);
  return c.json(created, 201);
});

billing.get('/clients/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const row = await loadClient(db, c.req.param('id'), user.teamId);
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

billing.patch('/clients/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const row = await loadClient(db, id, user.teamId);
  if (!row) return c.json({ error: 'Not found' }, 404);

  const updates: Partial<typeof clients.$inferInsert> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return c.json({ error: 'name must be a string', field: 'name' }, 400);
    }
    const name = body.name.trim();
    if (name.length < 1 || name.length > 200) {
      return c.json({ error: 'name must be 1-200 chars', field: 'name' }, 400);
    }
    updates.name = name;
  }
  if (body.razon_social !== undefined) {
    if (typeof body.razon_social !== 'string') {
      return c.json({ error: 'razon_social must be a string', field: 'razon_social' }, 400);
    }
    updates.razon_social = body.razon_social.trim();
  }
  if (body.rfc !== undefined) {
    if (typeof body.rfc !== 'string') {
      return c.json({ error: 'rfc must be a string', field: 'rfc' }, 400);
    }
    updates.rfc = body.rfc.trim();
  }
  if (body.project_id !== undefined) {
    if (body.project_id === null) {
      updates.project_id = null;
    } else if (typeof body.project_id !== 'string') {
      return c.json({ error: 'project_id must be a string or null', field: 'project_id' }, 400);
    } else {
      if (!(await projectInTeam(db, body.project_id, user.teamId))) {
        return c.json({ error: 'project_id not found in team', field: 'project_id' }, 400);
      }
      updates.project_id = body.project_id;
    }
  }

  await db
    .update(clients)
    .set({ ...updates, updated_at: new Date().toISOString() })
    .where(eq(clients.id, id));

  const updated = await loadClient(db, id, user.teamId);
  return c.json(updated);
});

billing.delete('/clients/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const row = await loadClient(db, id, user.teamId);
  if (!row) return c.json({ error: 'Not found' }, 404);

  // Cascade handles schedules, invoices, files (FK ON DELETE CASCADE) and the
  // share tokens. R2 objects are best-effort cleaned here first.
  const clientInvoices = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.client_id, id));
  if (clientInvoices.length > 0) {
    const invoiceIds = new Set(clientInvoices.map((r) => r.id));
    const fileRows = await db.select().from(invoiceFiles);
    for (const f of fileRows) {
      if (invoiceIds.has(f.invoice_id)) {
        await c.env.BUCKET.delete(f.r2_key).catch(() => {});
      }
    }
  }

  await db.delete(clients).where(eq(clients.id, id));
  return c.json({ ok: true });
});

// ----- Internal statement (includes total_paid) ---------------------------

billing.get('/clients/:id/statement', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const client = await loadClient(db, id, user.teamId);
  if (!client) return c.json({ error: 'Not found' }, 404);

  const rows = await db.select().from(invoices).where(eq(invoices.client_id, id));
  rows.sort((a, b) => b.period.localeCompare(a.period) || b.created_at.localeCompare(a.created_at));

  const filesMap = await loadFilesByInvoice(db, rows.map((r) => r.id));
  const list = rows.map((r) => toPublicInvoice(r, filesMap.get(r.id) ?? []));

  let totalPaid = 0;
  let totalPending = 0;
  for (const r of rows) {
    if (r.status === 'paid') totalPaid += r.total;
    else totalPending += r.total;
  }

  return c.json({ client, invoices: list, total_paid: totalPaid, total_pending: totalPending });
});

// ----- Schedules -----------------------------------------------------------

billing.get('/schedules', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const clientId = c.req.query('client_id');

  let rows = await db
    .select()
    .from(invoiceSchedules)
    .where(eq(invoiceSchedules.team_id, user.teamId));
  if (clientId) rows = rows.filter((r) => r.client_id === clientId);
  rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return c.json(rows);
});

billing.post('/schedules', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body.client_id !== 'string') {
    return c.json({ error: 'client_id is required', field: 'client_id' }, 400);
  }
  const client = await loadClient(db, body.client_id, user.teamId);
  if (!client) return c.json({ error: 'client_id not found in team', field: 'client_id' }, 400);

  if (!isFiniteNumber(body.day_of_month) || !Number.isInteger(body.day_of_month) || body.day_of_month < 1 || body.day_of_month > 31) {
    return c.json({ error: 'day_of_month must be an integer 1-31', field: 'day_of_month' }, 400);
  }
  if (!isFiniteNumber(body.amount) || body.amount < 0) {
    return c.json({ error: 'amount must be a non-negative number', field: 'amount' }, 400);
  }
  const kind = body.kind ?? 'fixed';
  if (kind !== 'fixed' && kind !== 'variable') {
    return c.json({ error: "kind must be 'fixed' or 'variable'", field: 'kind' }, 400);
  }
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const isActive = body.is_active === undefined ? true : Boolean(body.is_active);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(invoiceSchedules).values({
    id,
    team_id: user.teamId,
    client_id: body.client_id,
    day_of_month: body.day_of_month,
    amount: body.amount,
    kind,
    description,
    is_active: isActive,
    created_at: now,
    updated_at: now,
  });

  const [created] = await db.select().from(invoiceSchedules).where(eq(invoiceSchedules.id, id)).limit(1);
  return c.json(created, 201);
});

billing.patch('/schedules/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const [row] = await db.select().from(invoiceSchedules).where(eq(invoiceSchedules.id, id)).limit(1);
  if (!row || row.team_id !== user.teamId) return c.json({ error: 'Not found' }, 404);

  const updates: Partial<typeof invoiceSchedules.$inferInsert> = {};
  if (body.day_of_month !== undefined) {
    if (!isFiniteNumber(body.day_of_month) || !Number.isInteger(body.day_of_month) || body.day_of_month < 1 || body.day_of_month > 31) {
      return c.json({ error: 'day_of_month must be an integer 1-31', field: 'day_of_month' }, 400);
    }
    updates.day_of_month = body.day_of_month;
  }
  if (body.amount !== undefined) {
    if (!isFiniteNumber(body.amount) || body.amount < 0) {
      return c.json({ error: 'amount must be a non-negative number', field: 'amount' }, 400);
    }
    updates.amount = body.amount;
  }
  if (body.kind !== undefined) {
    if (body.kind !== 'fixed' && body.kind !== 'variable') {
      return c.json({ error: "kind must be 'fixed' or 'variable'", field: 'kind' }, 400);
    }
    updates.kind = body.kind;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      return c.json({ error: 'description must be a string', field: 'description' }, 400);
    }
    updates.description = body.description.trim();
  }
  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
  }

  await db
    .update(invoiceSchedules)
    .set({ ...updates, updated_at: new Date().toISOString() })
    .where(eq(invoiceSchedules.id, id));

  const [updated] = await db.select().from(invoiceSchedules).where(eq(invoiceSchedules.id, id)).limit(1);
  return c.json(updated);
});

billing.delete('/schedules/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const [row] = await db.select().from(invoiceSchedules).where(eq(invoiceSchedules.id, id)).limit(1);
  if (!row || row.team_id !== user.teamId) return c.json({ error: 'Not found' }, 404);

  await db.delete(invoiceSchedules).where(eq(invoiceSchedules.id, id));
  return c.json({ ok: true });
});

// ----- Invoices / collection records ---------------------------------------

billing.get('/invoices', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const clientId = c.req.query('client_id');
  const status = c.req.query('status');

  let rows = await db.select().from(invoices).where(eq(invoices.team_id, user.teamId));
  if (clientId) rows = rows.filter((r) => r.client_id === clientId);
  if (status === 'paid' || status === 'pending') rows = rows.filter((r) => r.status === status);
  rows.sort((a, b) => b.period.localeCompare(a.period) || b.created_at.localeCompare(a.created_at));

  const filesMap = await loadFilesByInvoice(db, rows.map((r) => r.id));
  return c.json(rows.map((r) => toPublicInvoice(r, filesMap.get(r.id) ?? [])));
});

billing.post('/invoices', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body.client_id !== 'string') {
    return c.json({ error: 'client_id is required', field: 'client_id' }, 400);
  }
  const client = await loadClient(db, body.client_id, user.teamId);
  if (!client) return c.json({ error: 'client_id not found in team', field: 'client_id' }, 400);

  if (typeof body.period !== 'string' || !/^\d{4}-\d{2}$/.test(body.period)) {
    return c.json({ error: "period must be 'YYYY-MM'", field: 'period' }, 400);
  }

  // schedule_id optional; if present must belong to the same client/team.
  let scheduleId: string | null = null;
  if (body.schedule_id !== undefined && body.schedule_id !== null) {
    if (typeof body.schedule_id !== 'string') {
      return c.json({ error: 'schedule_id must be a string', field: 'schedule_id' }, 400);
    }
    const [sched] = await db.select().from(invoiceSchedules).where(eq(invoiceSchedules.id, body.schedule_id)).limit(1);
    if (!sched || sched.team_id !== user.teamId || sched.client_id !== body.client_id) {
      return c.json({ error: 'schedule_id not found for client', field: 'schedule_id' }, 400);
    }
    scheduleId = body.schedule_id;
  }

  const subtotal = isFiniteNumber(body.subtotal) ? body.subtotal : 0;
  const discount = isFiniteNumber(body.discount) ? body.discount : 0;
  // total defaults to subtotal - discount when not explicitly provided.
  const total = isFiniteNumber(body.total) ? body.total : subtotal - discount;
  const status = body.status === 'paid' ? 'paid' : 'pending';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const isEstimated = Boolean(body.is_estimated);
  const issueDate = typeof body.issue_date === 'string' && body.issue_date.trim()
    ? body.issue_date.trim()
    : new Date().toISOString().slice(0, 10);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(invoices).values({
    id,
    team_id: user.teamId,
    client_id: body.client_id,
    schedule_id: scheduleId,
    period: body.period,
    issue_date: issueDate,
    description,
    subtotal,
    discount,
    total,
    status,
    paid_at: status === 'paid' ? now : null,
    is_estimated: isEstimated,
    note,
    created_at: now,
    updated_at: now,
  });

  const [created] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return c.json(await publicInvoiceById(db, created), 201);
});

billing.get('/invoices/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const [row] = await db.select().from(invoices).where(eq(invoices.id, c.req.param('id'))).limit(1);
  if (!row || row.team_id !== user.teamId) return c.json({ error: 'Not found' }, 404);
  return c.json(await publicInvoiceById(db, row));
});

billing.patch('/invoices/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const [row] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!row || row.team_id !== user.teamId) return c.json({ error: 'Not found' }, 404);

  const updates: Partial<typeof invoices.$inferInsert> = {};

  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      return c.json({ error: 'description must be a string', field: 'description' }, 400);
    }
    updates.description = body.description.trim();
  }
  if (body.note !== undefined) {
    if (typeof body.note !== 'string') {
      return c.json({ error: 'note must be a string', field: 'note' }, 400);
    }
    updates.note = body.note.trim();
  }
  if (body.issue_date !== undefined) {
    if (typeof body.issue_date !== 'string') {
      return c.json({ error: 'issue_date must be a string', field: 'issue_date' }, 400);
    }
    updates.issue_date = body.issue_date.trim();
  }
  if (body.subtotal !== undefined) {
    if (!isFiniteNumber(body.subtotal)) {
      return c.json({ error: 'subtotal must be a number', field: 'subtotal' }, 400);
    }
    updates.subtotal = body.subtotal;
  }
  if (body.discount !== undefined) {
    if (!isFiniteNumber(body.discount)) {
      return c.json({ error: 'discount must be a number', field: 'discount' }, 400);
    }
    updates.discount = body.discount;
  }
  if (body.total !== undefined) {
    if (!isFiniteNumber(body.total)) {
      return c.json({ error: 'total must be a number', field: 'total' }, 400);
    }
    updates.total = body.total;
  }
  if (body.is_estimated !== undefined) {
    updates.is_estimated = Boolean(body.is_estimated);
  }
  if (body.period !== undefined) {
    if (typeof body.period !== 'string' || !/^\d{4}-\d{2}$/.test(body.period)) {
      return c.json({ error: "period must be 'YYYY-MM'", field: 'period' }, 400);
    }
    updates.period = body.period;
  }
  if (body.status !== undefined) {
    if (body.status !== 'paid' && body.status !== 'pending') {
      return c.json({ error: "status must be 'paid' or 'pending'", field: 'status' }, 400);
    }
    updates.status = body.status;
    // Marking paid sets paid_at (only when transitioning); marking pending clears it.
    if (body.status === 'paid') {
      updates.paid_at = row.paid_at ?? new Date().toISOString();
    } else {
      updates.paid_at = null;
    }
  }

  await db
    .update(invoices)
    .set({ ...updates, updated_at: new Date().toISOString() })
    .where(eq(invoices.id, id));

  const [updated] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return c.json(await publicInvoiceById(db, updated));
});

billing.delete('/invoices/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const [row] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!row || row.team_id !== user.teamId) return c.json({ error: 'Not found' }, 404);

  // Best-effort R2 cleanup before the cascade drops the file rows.
  const files = await db.select().from(invoiceFiles).where(eq(invoiceFiles.invoice_id, id));
  for (const f of files) {
    await c.env.BUCKET.delete(f.r2_key).catch(() => {});
  }

  await db.delete(invoices).where(eq(invoices.id, id));
  return c.json({ ok: true });
});

// ----- Invoice files (R2) --------------------------------------------------

billing.post('/invoices/:id/files', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const invoiceId = c.req.param('id');

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv || inv.team_id !== user.teamId) return c.json({ error: 'Not found' }, 404);

  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'file field required' }, 400);
  }
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: 'File too large (max 20MB)' }, 413);
  }

  const mime = file.type || 'application/octet-stream';
  // kind from the body wins; otherwise infer from the mime type.
  let kind: FileKind | null = null;
  const bodyKind = body['kind'];
  if (typeof bodyKind === 'string' && (bodyKind === 'pdf' || bodyKind === 'xml')) {
    kind = bodyKind;
  } else {
    kind = inferKind(mime);
  }
  if (!kind) {
    return c.json({ error: 'Only PDF or XML files are allowed', field: 'file' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const r2Key = `${user.teamId}/billing/${invoiceId}/${id}-${safeName}`;

  await c.env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: mime },
  });

  await db.insert(invoiceFiles).values({
    id,
    invoice_id: invoiceId,
    kind,
    file_name: file.name,
    file_size: file.size,
    mime_type: mime,
    r2_key: r2Key,
    created_at: now,
  });

  const [updated] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  return c.json(await publicInvoiceById(db, updated), 201);
});

billing.get('/files/:fileId', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const fileId = c.req.param('fileId');

  const [file] = await db.select().from(invoiceFiles).where(eq(invoiceFiles.id, fileId)).limit(1);
  if (!file) return c.json({ error: 'Not found' }, 404);

  // Team isolation: the owning invoice must belong to the caller's team.
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, file.invoice_id)).limit(1);
  if (!inv || inv.team_id !== user.teamId) return c.json({ error: 'Not found' }, 404);

  const object = await c.env.BUCKET.get(file.r2_key);
  if (!object) return c.json({ error: 'File not found in storage' }, 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': file.mime_type,
      'Content-Disposition': `attachment; filename="${file.file_name}"`,
      'Content-Length': String(file.file_size),
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

billing.delete('/files/:fileId', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const fileId = c.req.param('fileId');

  const [file] = await db.select().from(invoiceFiles).where(eq(invoiceFiles.id, fileId)).limit(1);
  if (!file) return c.json({ error: 'Not found' }, 404);

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, file.invoice_id)).limit(1);
  if (!inv || inv.team_id !== user.teamId) return c.json({ error: 'Not found' }, 404);

  await c.env.BUCKET.delete(file.r2_key).catch(() => {});
  await db.delete(invoiceFiles).where(eq(invoiceFiles.id, fileId));
  return c.json({ ok: true });
});

// ----- Public account-statement link (per client) -------------------------

billing.post('/clients/:id/share-token', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const client = await loadClient(db, id, user.teamId);
  if (!client) return c.json({ error: 'Not found' }, 404);

  const { rawToken, prefix } = await rotateBillingShareToken(db, id);
  return c.json({
    token: rawToken, // raw token returned ONLY once
    prefix,
    url_path: `/estado-cuenta?s=${rawToken}`,
  });
});

billing.get('/clients/:id/share-token', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const client = await loadClient(db, id, user.teamId);
  if (!client) return c.json({ error: 'Not found' }, 404);

  const rows = await db
    .select()
    .from(billingShareTokens)
    .where(eq(billingShareTokens.client_id, id));
  const live = rows.find((r) => !r.revoked_at);

  return c.json({ active: Boolean(live), prefix: live?.prefix ?? null });
});

billing.delete('/clients/:id/share-token', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const client = await loadClient(db, id, user.teamId);
  if (!client) return c.json({ error: 'Not found' }, 404);

  const rows = await db
    .select()
    .from(billingShareTokens)
    .where(eq(billingShareTokens.client_id, id));
  const nowIso = new Date().toISOString();
  for (const r of rows) {
    if (!r.revoked_at) {
      await db
        .update(billingShareTokens)
        .set({ revoked_at: nowIso })
        .where(eq(billingShareTokens.id, r.id));
    }
  }
  return c.json({ ok: true });
});

export default billing;
