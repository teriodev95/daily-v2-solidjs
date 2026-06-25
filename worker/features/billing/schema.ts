import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { teams, projects } from '../../db/schema';

/**
 * Billing module — collection control (NOT invoice generation).
 *
 * Per client we schedule recurring collections; a cron drops a pending
 * `invoice` record on the configured day-of-month, and the admin then attaches
 * the real invoice files (PDF/XML), edits attributes, and marks it paid/pending.
 *
 * Each client gets a public, read-only "account statement" link (a
 * `billing_share_token`) that exposes ONLY the pending balance — never the
 * total paid. The internal admin statement DOES expose total_paid.
 *
 * Everything is team-scoped except the public portal, which is scoped to a
 * single client via its share token.
 */

export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),
  team_id: text('team_id').notNull().references(() => teams.id),
  name: text('name').notNull(),
  razon_social: text('razon_social').notNull().default(''),
  rfc: text('rfc').notNull().default(''),
  // Optional link to a project this client maps to.
  project_id: text('project_id').references(() => projects.id),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const invoiceSchedules = sqliteTable('invoice_schedules', {
  id: text('id').primaryKey(),
  team_id: text('team_id').notNull().references(() => teams.id),
  client_id: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  day_of_month: integer('day_of_month').notNull(),
  amount: real('amount').notNull().default(0),
  kind: text('kind', { enum: ['fixed', 'variable'] }).notNull().default('fixed'),
  description: text('description').notNull().default(''),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  team_id: text('team_id').notNull().references(() => teams.id),
  client_id: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  schedule_id: text('schedule_id').references(() => invoiceSchedules.id),
  period: text('period').notNull(), // 'YYYY-MM'
  issue_date: text('issue_date').notNull(),
  description: text('description').notNull().default(''),
  subtotal: real('subtotal').notNull().default(0),
  discount: real('discount').notNull().default(0),
  total: real('total').notNull().default(0),
  status: text('status', { enum: ['paid', 'pending'] }).notNull().default('pending'),
  paid_at: text('paid_at'),
  is_estimated: integer('is_estimated', { mode: 'boolean' }).notNull().default(false),
  note: text('note').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const invoiceFiles = sqliteTable('invoice_files', {
  id: text('id').primaryKey(),
  invoice_id: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['pdf', 'xml'] }).notNull(),
  file_name: text('file_name').notNull(),
  file_size: integer('file_size').notNull(),
  mime_type: text('mime_type').notNull(),
  r2_key: text('r2_key').notNull(),
  created_at: text('created_at').notNull(),
});

/**
 * Public account-statement tokens. One active (non-revoked) token per client,
 * enforced by a partial unique index in migration 0023. The rotate helper
 * revokes the previous active row BEFORE inserting the new one.
 */
export const billingShareTokens = sqliteTable('billing_share_tokens', {
  id: text('id').primaryKey(),
  client_id: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  token_hash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  created_at: text('created_at').notNull(),
  revoked_at: text('revoked_at'),
});
