/**
 * Huecos de agenda: aritmética de horarios "HH:mm" para proponer una hora que
 * no choque con lo que ya está agendado ese día.
 *
 * Funciones puras, sin dependencias de Solid ni de la API: reciben los tramos
 * ocupados y devuelven datos. Así se pueden probar solas y reutilizar desde el
 * detalle de la HU, el calendario o el alta rápida.
 */

export interface Slot {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

/** Franja visible del día, alineada con el calendario (5 a.m. – 11 p.m.). */
export const DAY_START_MIN = 5 * 60;
export const DAY_END_MIN = 23 * 60;

const HHMM_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * "08:30" → 510. Devuelve null para vacío, incompleto ("08:") o fuera de rango,
 * que es justo lo que emite un <input type="time"> a medio llenar.
 */
export const toMinutes = (hhmm: string | null | undefined): number | null => {
  if (!hhmm) return null;
  const m = HHMM_RE.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

/** 510 → "08:30". Se recorta al día para no producir horas imposibles. */
export const toHHmm = (minutes: number): string => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** Un tramo con horas válidas y fin posterior al inicio. */
const asRange = (slot: Slot): { start: number; end: number } | null => {
  const start = toMinutes(slot.start);
  const end = toMinutes(slot.end);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
};

/** Solapan si se pisan en algún minuto; tocarse por el borde no cuenta. */
export const overlaps = (a: Slot, b: Slot): boolean => {
  const ra = asRange(a);
  const rb = asRange(b);
  if (!ra || !rb) return false;
  return ra.start < rb.end && rb.start < ra.end;
};

/** Los tramos ocupados con los que choca el candidato. */
export const findConflicts = <T extends Slot>(candidate: Slot, busy: T[]): T[] =>
  busy.filter((slot) => overlaps(candidate, slot));

/**
 * Primer hueco libre de `durationMin` a partir de `from`.
 *
 * Recorre los tramos ocupados en orden y devuelve el primer espacio que quepa;
 * si no cabe nada antes del fin del día, devuelve null (quien llama decide qué
 * hacer, en vez de recibir una hora inventada).
 */
export const findFreeSlot = (
  busy: Slot[],
  durationMin: number,
  opts: { from?: string; dayStart?: number; dayEnd?: number } = {},
): Slot | null => {
  const dayStart = opts.dayStart ?? DAY_START_MIN;
  const dayEnd = opts.dayEnd ?? DAY_END_MIN;
  const fromMin = toMinutes(opts.from ?? null);

  let cursor = Math.max(dayStart, fromMin ?? dayStart);

  const ranges = busy
    .map(asRange)
    .filter((r): r is { start: number; end: number } => r !== null)
    .sort((a, b) => a.start - b.start);

  for (const range of ranges) {
    if (range.end <= cursor) continue;          // ya quedó atrás
    if (range.start - cursor >= durationMin) {  // cabe antes de este tramo
      return { start: toHHmm(cursor), end: toHHmm(cursor + durationMin) };
    }
    cursor = Math.max(cursor, range.end);       // saltar el tramo ocupado
  }

  if (cursor + durationMin <= dayEnd) {
    return { start: toHHmm(cursor), end: toHHmm(cursor + durationMin) };
  }
  return null;
};

/** Hora actual redondeada hacia arriba al siguiente múltiplo (15 min por defecto). */
export const nextRoundedTime = (now = new Date(), stepMin = 15): string => {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return toHHmm(Math.ceil(minutes / stepMin) * stepMin);
};

/** Fin = inicio + duración, sin pasarse del día. */
export const endAfter = (start: string, durationMin: number): string | null => {
  const startMin = toMinutes(start);
  if (startMin === null) return null;
  return toHHmm(Math.min(startMin + durationMin, 23 * 60 + 59));
};
