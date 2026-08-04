/**
 * Sesión de modo foco: qué tarea estás trabajando y desde cuándo.
 *
 * Vive solo en localStorage — no se guarda en la HU ni se sincroniza entre
 * dispositivos. Su único fin es visual: ver cuánto llevas en la tarea y no
 * perder de vista cuál es.
 *
 * Se guarda solo el instante de inicio, no un contador que suma cada segundo:
 * el transcurrido se calcula restando contra `startedAt`, así que suspender el
 * equipo o recargar la página no desajusta el reloj.
 */

const KEY = 'dc-focus-session-v1';

export interface FocusSession {
  storyId: string;
  startedAt: number;
}

export const readFocusSession = (): FocusSession | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FocusSession>;
    if (typeof parsed.storyId !== 'string' || typeof parsed.startedAt !== 'number') return null;
    return { storyId: parsed.storyId, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
};

export const startFocusSession = (storyId: string): FocusSession => {
  const session: FocusSession = { storyId, startedAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* sin espacio: el foco funciona igual, solo no sobrevive a recargas */ }
  return session;
};

export const clearFocusSession = () => {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};

/** "07:12" o "1:04:09" cuando pasa de la hora. */
export const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
