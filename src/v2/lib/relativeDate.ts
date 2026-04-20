// ─── Relative due-date formatter for Kanban cards ──────────────
// Produces a short, locale-friendly label + a variant to drive styling.

export type DueVariant =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'soon'
  | 'future'
  | 'none';

export interface DueInfo {
  /** Short label: "Hoy", "Mañana", "en 3d", "Atrasada 2d", "15 may", "" */
  label: string;
  variant: DueVariant;
}

const MONTHS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/**
 * Format a due date as a compact relative string + variant.
 * Comparison is date-only (ignores time-of-day).
 *
 * Variants:
 *   overdue   → past due
 *   today     → exactly today
 *   tomorrow  → exactly tomorrow
 *   soon      → within 2-3 days
 *   future    → 4+ days away
 *   none      → no date provided
 */
export function formatRelativeDueDate(iso: string | null | undefined): DueInfo {
  if (!iso) return { label: '', variant: 'none' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(iso);
  if (isNaN(due.getTime())) return { label: '', variant: 'none' };
  due.setHours(0, 0, 0, 0);

  const ms = due.getTime() - today.getTime();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));

  if (days < 0) return { label: `Atrasada ${Math.abs(days)}d`, variant: 'overdue' };
  if (days === 0) return { label: 'Hoy', variant: 'today' };
  if (days === 1) return { label: 'Mañana', variant: 'tomorrow' };
  if (days <= 3) return { label: `en ${days}d`, variant: 'soon' };
  if (days <= 7) return { label: `en ${days}d`, variant: 'future' };
  if (days <= 30) return { label: `en ${Math.round(days / 7)} sem`, variant: 'future' };

  return { label: `${due.getDate()} ${MONTHS[due.getMonth()]}`, variant: 'future' };
}
