// Billing module — shared types. Mirror the backend contract EXACTLY.

export type ScheduleKind = 'fixed' | 'variable';
export type InvoiceStatus = 'paid' | 'pending';
export type InvoiceFileKind = 'pdf' | 'xml';

export interface Client {
  id: string;
  team_id: string;
  name: string;
  razon_social: string;
  rfc: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: string;
  team_id: string;
  client_id: string;
  day_of_month: number;
  amount: number;
  kind: ScheduleKind;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvoiceFile {
  id: string;
  invoice_id: string;
  kind: InvoiceFileKind;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  team_id: string;
  client_id: string;
  schedule_id: string | null;
  period: string;
  issue_date: string;
  description: string;
  subtotal: number;
  discount: number;
  total: number;
  status: InvoiceStatus;
  paid_at: string | null;
  is_estimated: boolean;
  note: string;
  created_at: string;
  updated_at: string;
  files: InvoiceFile[];
}

// GET /clients/:id/statement (admin) — internal statement, exposes total_paid.
export interface ClientStatement {
  client: Client;
  invoices: Invoice[];
  total_paid: number;
  total_pending: number;
}

// POST /clients/:id/share-token — returned once on creation.
export interface ShareToken {
  token: string;
  prefix: string;
  url_path: string;
}

// GET /clients/:id/share-token — current token metadata (no raw token).
export interface ShareTokenMeta {
  prefix: string;
  url_path: string;
  created_at: string;
}

// GET /api/public/billing/statement — public view, NO total_paid.
export interface PublicStatement {
  client: { name: string };
  invoices: Invoice[];
  total_pending: number;
}

// ─── Input shapes ────────────────────────────────

export interface ClientInput {
  name: string;
  razon_social?: string;
  rfc?: string;
  project_id?: string | null;
}

export interface ScheduleInput {
  client_id: string;
  day_of_month: number;
  amount: number;
  kind: ScheduleKind;
  description?: string;
  is_active?: boolean;
}

export interface InvoiceInput {
  client_id: string;
  schedule_id?: string | null;
  period: string;
  issue_date: string;
  description?: string;
  subtotal: number;
  discount?: number;
  total: number;
  status?: InvoiceStatus;
  is_estimated?: boolean;
  note?: string;
}
