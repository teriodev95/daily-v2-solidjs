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
 * Parses the leading YYYY-MM-DD as a LOCAL date — otherwise
 * `new Date("2026-04-23")` resolves to UTC midnight and shifts
 * one day backward in negative-offset timezones (e.g. America/*).
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

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return { label: '', variant: 'none' };
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(due.getTime())) return { label: '', variant: 'none' };

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

// "Hace 5 min" / "ayer" / "hace 3 días" / "12 mar". For metadata footers.
// Falls back to absolute date past 30 days. Locale: es.
export function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days < 30) return `hace ${Math.round(days / 7)} sem`;
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
