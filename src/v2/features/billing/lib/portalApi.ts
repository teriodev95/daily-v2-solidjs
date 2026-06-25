// Billing PUBLIC PORTAL api client. No session — auth is the share token in `?s=`.
// Deliberately uses bare fetch with credentials:'omit' so no cookies leak to the
// public surface. Errors are normalized to a thrown Error with a friendly message.
import { API_BASE } from '../../../lib/api';
import type { PublicStatement } from '../types';

class PortalError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function portalRequest<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { credentials: 'omit' });
  } catch {
    throw new PortalError(0, 'No se pudo conectar. Revisa tu conexión.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as any)?.error
      ?? (res.status === 404 ? 'Enlace inválido o revocado.' : 'No se pudo cargar el estado de cuenta.');
    throw new PortalError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const portalApi = {
  statement: (token: string) =>
    portalRequest<PublicStatement>(`/api/public/billing/statement?s=${encodeURIComponent(token)}`),
  // Direct download URL — the token rides in the query so it works as a plain href.
  fileUrl: (fileId: string, token: string) =>
    `${API_BASE}/api/public/billing/files/${fileId}?s=${encodeURIComponent(token)}`,
};

export { PortalError };
