import { and, eq, isNull, inArray } from 'drizzle-orm';
import type { AppDb } from '../../types';
import {
  generateShareToken,
  hashToken,
  shareTokenPrefix,
} from '../../lib/tokenCrypto';
import { invoices, invoiceFiles, billingShareTokens } from './schema';

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceFileRow = typeof invoiceFiles.$inferSelect;

// Public-safe invoice file: drops r2_key (an internal storage path).
export function toPublicInvoiceFile(row: InvoiceFileRow) {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    kind: row.kind,
    file_name: row.file_name,
    file_size: row.file_size,
    mime_type: row.mime_type,
    created_at: row.created_at,
  };
}

// Builds the public-safe Invoice shape, attaching its files (without r2_key).
export function toPublicInvoice(row: InvoiceRow, files: InvoiceFileRow[]) {
  return {
    id: row.id,
    team_id: row.team_id,
    client_id: row.client_id,
    schedule_id: row.schedule_id,
    period: row.period,
    issue_date: row.issue_date,
    description: row.description,
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    status: row.status,
    paid_at: row.paid_at,
    is_estimated: row.is_estimated,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    files: files.map(toPublicInvoiceFile),
  };
}

// Portal-safe invoice for the public account statement. Omits internal
// identifiers (team_id, client_id, schedule_id) — the client only needs the
// billing facts and its files.
export function toPortalInvoice(row: InvoiceRow, files: InvoiceFileRow[]) {
  return {
    id: row.id,
    period: row.period,
    issue_date: row.issue_date,
    description: row.description,
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    status: row.status,
    paid_at: row.paid_at,
    is_estimated: row.is_estimated,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    files: files.map(toPublicInvoiceFile),
  };
}

// Loads files for a set of invoice ids in one query, grouped by invoice_id.
export async function loadFilesByInvoice(
  db: AppDb,
  invoiceIds: string[],
): Promise<Map<string, InvoiceFileRow[]>> {
  const map = new Map<string, InvoiceFileRow[]>();
  if (invoiceIds.length === 0) return map;
  const rows = await db
    .select()
    .from(invoiceFiles)
    .where(inArray(invoiceFiles.invoice_id, invoiceIds));
  for (const row of rows) {
    const list = map.get(row.invoice_id) ?? [];
    list.push(row);
    map.set(row.invoice_id, list);
  }
  return map;
}

/**
 * Rotates the active account-statement token for a client. Revokes any existing
 * active (non-revoked) token first — the partial unique index requires it — then
 * mints a fresh `st_` token. The raw token is returned ONCE; only its hash is
 * persisted.
 */
export async function rotateBillingShareToken(
  db: AppDb,
  clientId: string,
): Promise<{ rawToken: string; prefix: string; previousRevoked: boolean }> {
  const nowIso = new Date().toISOString();

  const existing = await db
    .select()
    .from(billingShareTokens)
    .where(
      and(
        eq(billingShareTokens.client_id, clientId),
        isNull(billingShareTokens.revoked_at),
      ),
    );

  let previousRevoked = false;
  for (const row of existing) {
    await db
      .update(billingShareTokens)
      .set({ revoked_at: nowIso })
      .where(eq(billingShareTokens.id, row.id));
    previousRevoked = true;
  }

  const rawToken = generateShareToken();
  const tokenHash = await hashToken(rawToken);
  const prefix = shareTokenPrefix(rawToken);

  await db.insert(billingShareTokens).values({
    id: crypto.randomUUID(),
    client_id: clientId,
    token_hash: tokenHash,
    prefix,
    created_at: nowIso,
    revoked_at: null,
  });

  return { rawToken, prefix, previousRevoked };
}

/**
 * Resolves a raw share token to its client id. Returns null when the token is
 * missing, malformed or revoked.
 */
export async function resolveBillingShareToken(
  db: AppDb,
  rawToken: string,
): Promise<{ clientId: string } | null> {
  if (!rawToken || !rawToken.startsWith('st_')) return null;
  const tokenHash = await hashToken(rawToken);
  const [row] = await db
    .select()
    .from(billingShareTokens)
    .where(eq(billingShareTokens.token_hash, tokenHash))
    .limit(1);
  if (!row || row.revoked_at) return null;
  return { clientId: row.client_id };
}
