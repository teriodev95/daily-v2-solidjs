-- Billing module: collection control (NOT invoice generation) + client portal.
-- Per client we schedule recurring collections; a cron drops a pending invoice
-- record on the configured day, which the admin then completes (files, amounts,
-- paid/pending). Each client has a read-only public account-statement link.
-- Mirrors worker/features/billing/schema.ts.
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  name TEXT NOT NULL,
  razon_social TEXT NOT NULL DEFAULT '',
  rfc TEXT NOT NULL DEFAULT '',
  project_id TEXT REFERENCES projects(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_clients_team_id ON clients (team_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS invoice_schedules (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  day_of_month INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'fixed',
  description TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_invoice_schedules_client ON invoice_schedules (client_id, is_active);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  schedule_id TEXT REFERENCES invoice_schedules(id),
  period TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TEXT,
  is_estimated INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_invoices_team_client ON invoices (team_id, client_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_invoices_client_status ON invoices (client_id, status);
--> statement-breakpoint
-- One cron-generated record per (schedule, period). Partial, so manual invoices
-- (schedule_id NULL) are unaffected; the cron also try/catches the unique
-- violation to stay idempotent under concurrent runs (D1 has no transactions).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_schedule_period
  ON invoices (schedule_id, period)
  WHERE schedule_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS invoice_files (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_invoice_files_invoice ON invoice_files (invoice_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS billing_share_tokens (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_share_tokens_hash ON billing_share_tokens (token_hash);
--> statement-breakpoint
-- At most one active (non-revoked) statement token per client. The rotate
-- helper revokes the previous active row BEFORE inserting the new one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_share_tokens_unique_active
  ON billing_share_tokens (client_id)
  WHERE revoked_at IS NULL;
