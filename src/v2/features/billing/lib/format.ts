// Shared billing formatters.

export const formatMoney = (n: number): string =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

export const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// "YYYY-MM" -> "Junio 2026". The period is always month-grained; show the month
// by name (never its number) and the year, both on input and on display.
export const formatPeriod = (period: string): string => {
  const m = /^(\d{4})-(\d{2})$/.exec(period ?? '');
  if (!m) return period ?? '';
  const name = MONTHS_ES[parseInt(m[2], 10) - 1];
  return name ? `${name} ${m[1]}` : period;
};

export const formatFileSize = (bytes: number): string => {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};
