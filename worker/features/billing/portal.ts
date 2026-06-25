import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env, Variables } from '../../types';
import { clients, invoices, invoiceFiles } from './schema';
import { toPortalInvoice, loadFilesByInvoice, resolveBillingShareToken } from './lib';

/**
 * Public client portal — read-only account statement.
 *
 * Mounted at /api/public/billing/* with NO auth middleware. Access is gated by
 * a `?s=st_...` share token that resolves to a single client. The portal NEVER
 * exposes `total_paid` — only the pending balance.
 */
const portal = new Hono<{ Bindings: Env; Variables: Variables }>();

portal.get('/statement', async (c) => {
  const db = c.get('db');
  const raw = c.req.query('s') ?? '';

  const resolved = await resolveBillingShareToken(db, raw);
  if (!resolved) return c.json({ error: 'invalid_share_token' }, 401);

  const [client] = await db.select().from(clients).where(eq(clients.id, resolved.clientId)).limit(1);
  if (!client) return c.json({ error: 'invalid_share_token' }, 401);

  const rows = await db.select().from(invoices).where(eq(invoices.client_id, resolved.clientId));
  rows.sort((a, b) => b.period.localeCompare(a.period) || b.created_at.localeCompare(a.created_at));

  const filesMap = await loadFilesByInvoice(db, rows.map((r) => r.id));
  const list = rows.map((r) => toPortalInvoice(r, filesMap.get(r.id) ?? []));

  let totalPending = 0;
  for (const r of rows) {
    if (r.status !== 'paid') totalPending += r.total;
  }

  // Only the client name is exposed — no team_id, RFC or razon social leak.
  return c.json({
    client: { name: client.name },
    invoices: list,
    total_pending: totalPending,
  });
});

portal.get('/files/:fileId', async (c) => {
  const db = c.get('db');
  const raw = c.req.query('s') ?? '';
  const fileId = c.req.param('fileId');

  const resolved = await resolveBillingShareToken(db, raw);
  if (!resolved) return c.json({ error: 'invalid_share_token' }, 401);

  const [file] = await db.select().from(invoiceFiles).where(eq(invoiceFiles.id, fileId)).limit(1);
  if (!file) return c.json({ error: 'Not found' }, 404);

  // The file must belong to an invoice of the token's client.
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, file.invoice_id)).limit(1);
  if (!inv || inv.client_id !== resolved.clientId) return c.json({ error: 'Not found' }, 404);

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

export default portal;
