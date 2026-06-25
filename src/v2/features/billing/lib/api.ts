// Billing ADMIN api client. Reuses the shared session-cookie `request`/`uploadFile`
// wrappers from src/v2/lib/api.ts (sends credentials, X-Client-Id, JSON headers).
import { request, uploadFile, API_BASE } from '../../../lib/api';
import type {
  Client, Schedule, Invoice,
  ClientStatement, ShareToken, ShareTokenMeta,
  ClientInput, ScheduleInput, InvoiceInput,
} from '../types';

const qs = (params: Record<string, string | undefined>): string => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const billingApi = {
  clients: {
    list: () => request<Client[]>('/api/billing/clients'),
    get: (id: string) => request<Client>(`/api/billing/clients/${id}`),
    create: (data: ClientInput) =>
      request<Client>('/api/billing/clients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ClientInput>) =>
      request<Client>(`/api/billing/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/api/billing/clients/${id}`, { method: 'DELETE' }),
    statement: (id: string) =>
      request<ClientStatement>(`/api/billing/clients/${id}/statement`),
  },

  shareToken: {
    get: (clientId: string) =>
      request<ShareTokenMeta | null>(`/api/billing/clients/${clientId}/share-token`),
    create: (clientId: string) =>
      request<ShareToken>(`/api/billing/clients/${clientId}/share-token`, { method: 'POST' }),
    revoke: (clientId: string) =>
      request<{ ok: boolean }>(`/api/billing/clients/${clientId}/share-token`, { method: 'DELETE' }),
  },

  schedules: {
    list: (clientId: string) =>
      request<Schedule[]>(`/api/billing/schedules${qs({ client_id: clientId })}`),
    create: (data: ScheduleInput) =>
      request<Schedule>('/api/billing/schedules', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ScheduleInput>) =>
      request<Schedule>(`/api/billing/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/api/billing/schedules/${id}`, { method: 'DELETE' }),
  },

  invoices: {
    list: (clientId: string, status?: string) =>
      request<Invoice[]>(`/api/billing/invoices${qs({ client_id: clientId, status })}`),
    get: (id: string) => request<Invoice>(`/api/billing/invoices/${id}`),
    create: (data: InvoiceInput) =>
      request<Invoice>('/api/billing/invoices', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Invoice>(`/api/billing/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/api/billing/invoices/${id}`, { method: 'DELETE' }),
    // Returns the updated invoice (with its files), not the single file.
    uploadFile: (invoiceId: string, file: File) =>
      uploadFile<Invoice>(`/api/billing/invoices/${invoiceId}/files`, file),
    deleteFile: (fileId: string) =>
      request<{ ok: boolean }>(`/api/billing/files/${fileId}`, { method: 'DELETE' }),
    fileUrl: (fileId: string) => `${API_BASE}/api/billing/files/${fileId}`,
  },
};
