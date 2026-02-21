import type {
  User, Team, Project, Story, AcceptanceCriteria,
  DailyReport, WeekGoal, Assignment, Attachment,
} from '../types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, (body as any).error ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, (body as any).error ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

// ─── Types for API responses ─────────────────────

type UserSafe = Omit<User, never>; // same shape but no password from server
type StoryWithAssignees = Story & { assignees: string[] };
type StoryDetailed = StoryWithAssignees & { criteria: AcceptanceCriteria[] };
type ReportDetailed = DailyReport & {
  yesterday: StoryWithAssignees[];
  today: StoryWithAssignees[];
  backlog: StoryWithAssignees[];
};

// ─── API Client ──────────────────────────────────

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<UserSafe>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    logout: () =>
      request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
    me: () => request<UserSafe>('/api/auth/me'),
  },

  team: {
    get: () => request<Team>('/api/team'),
    getMembers: () => request<UserSafe[]>('/api/team/members'),
    createMember: (data: { name: string; email: string; password: string; role?: string; avatar_url?: string }) =>
      request<UserSafe>('/api/team/members', { method: 'POST', body: JSON.stringify(data) }),
    updateMember: (id: string, data: Record<string, unknown>) =>
      request<UserSafe>(`/api/team/members/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  projects: {
    list: (status?: string) =>
      request<Project[]>(`/api/projects${status ? `?status=${status}` : ''}`),
    create: (data: { name: string; prefix: string; color: string; icon_url?: string }) =>
      request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  stories: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<StoryWithAssignees[]>(`/api/stories${qs}`);
    },
    search: (q: string) =>
      request<StoryWithAssignees[]>(`/api/stories/search?q=${encodeURIComponent(q)}`),
    get: (id: string) => request<StoryDetailed>(`/api/stories/${id}`),
    create: (data: Record<string, unknown>) =>
      request<StoryWithAssignees>('/api/stories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<StoryWithAssignees>(`/api/stories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/stories/${id}`, { method: 'DELETE' }),
    addAssignee: (storyId: string, userId: string) =>
      request<{ ok: boolean }>(`/api/stories/${storyId}/assignees`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
    removeAssignee: (storyId: string, userId: string) =>
      request<{ ok: boolean }>(`/api/stories/${storyId}/assignees/${userId}`, { method: 'DELETE' }),
    addCriteria: (storyId: string, criteria: { text: string; is_met?: boolean }[]) =>
      request<{ ok: boolean; count: number }>(`/api/stories/${storyId}/criteria`, { method: 'POST', body: JSON.stringify({ criteria }) }),
    updateCriteria: (storyId: string, criteriaId: string, data: { is_met: boolean }) =>
      request<AcceptanceCriteria>(`/api/stories/${storyId}/criteria/${criteriaId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  reports: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<DailyReport[]>(`/api/reports${qs}`);
    },
    getByDate: (date: string, userId?: string) => {
      const qs = userId ? `?user_id=${userId}` : '';
      return request<ReportDetailed>(`/api/reports/${date}${qs}`);
    },
    upsert: (date: string, data: { week_number: number; learning?: string; impediments?: string }) =>
      request<DailyReport>(`/api/reports/${date}`, { method: 'PUT', body: JSON.stringify(data) }),
  },

  goals: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<WeekGoal[]>(`/api/goals${qs}`);
    },
    create: (data: { week_number: number; year: number; text: string; is_shared?: boolean }) =>
      request<WeekGoal>('/api/goals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<WeekGoal>(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  assignments: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<Assignment[]>(`/api/assignments${qs}`);
    },
    create: (data: { assigned_to: string; title: string; description?: string; project_id?: string; due_date?: string }) =>
      request<Assignment>('/api/assignments', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Assignment>(`/api/assignments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  attachments: {
    list: (storyId: string) =>
      request<Attachment[]>(`/api/attachments/story/${storyId}`),
    upload: (storyId: string, file: File) =>
      uploadFile<Attachment>(`/api/attachments/story/${storyId}`, file),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/attachments/${id}`, { method: 'DELETE' }),
    fileUrl: (id: string) => `${API_BASE}/api/attachments/file/${id}`,
  },

  admin: {
    seed: () => request<{ ok: boolean; message: string }>('/api/admin/seed', { method: 'POST' }),
  },
};
