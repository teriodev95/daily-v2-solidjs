import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import type { Env } from '../../types';
import * as dbSchema from '../../db/schema';
import { invoiceSchedules, invoices } from './schema';

// Current period in 'YYYY-MM' (UTC).
function currentPeriod(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Today's date in 'YYYY-MM-DD' (UTC), used as the issue_date.
function todayIso(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Drops pending collection records for every active schedule whose
 * `day_of_month` matches today (UTC). Idempotent: dedups by (schedule_id,
 * period), so re-running on the same day creates nothing new.
 *
 * For 'variable' schedules the record is flagged `is_estimated` with an
 * adjustment note — the admin is expected to set the real amount later.
 */
export async function processBillingSchedules(env: Env): Promise<void> {
  const db = drizzle(env.DB, { schema: dbSchema });
  const now = new Date();
  const today = now.getUTCDate();
  const period = currentPeriod(now);
  const issueDate = todayIso(now);

  const dueSchedules = await db
    .select()
    .from(invoiceSchedules)
    .where(
      and(
        eq(invoiceSchedules.is_active, true),
        eq(invoiceSchedules.day_of_month, today),
      ),
    );

  for (const schedule of dueSchedules) {
    // Dedup: skip if a record already exists for this schedule + period.
    const [existing] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.schedule_id, schedule.id),
          eq(invoices.period, period),
        ),
      )
      .limit(1);
    if (existing) continue;

    const isVariable = schedule.kind === 'variable';
    const nowIso = now.toISOString();

    try {
      await db.insert(invoices).values({
        id: crypto.randomUUID(),
        team_id: schedule.team_id,
        client_id: schedule.client_id,
        schedule_id: schedule.id,
        period,
        issue_date: issueDate,
        description: schedule.description,
        subtotal: schedule.amount,
        discount: 0,
        total: schedule.amount,
        status: 'pending',
        paid_at: null,
        is_estimated: isVariable,
        note: isVariable ? 'Monto estimado, sujeto a ajuste.' : '',
        created_at: nowIso,
        updated_at: nowIso,
      });
    } catch {
      // Lost the race to a concurrent run (unique index on schedule_id+period).
    }
  }
}
