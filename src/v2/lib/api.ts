import type {
  User, Team, Project, Story, AcceptanceCriteria,
  DailyReport, WeekGoal, Assignment, Attachment, StoryCompletion, Learning, WikiArticle,
} from '../types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const API_BASE = import.meta.env.VITE_API_URL ?? '';

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

// ─── Kanban ──────────────────────────────────────

export interface KanbanBucket {
  items: StoryWithAssignees[];
  total: number;
}

export interface KanbanResponse {
  backlog: KanbanBucket;
  todo: KanbanBucket;
  in_progress: KanbanBucket;
  done: KanbanBucket;
}

// Paginated list response shape (server switches to this when limit/offset present)
export interface PaginatedStories {
  data: StoryWithAssignees[];
  total: number;
  limit: number;
  offset: number;
}
type ReportDetailed = DailyReport & {
  yesterday: StoryWithAssignees[];
  today: StoryWithAssignees[];
  backlog: StoryWithAssignees[];
};

// ─── API Tokens ──────────────────────────────────

export type TokenScope = 'none' | 'read' | 'write';

export interface Token {
  id: string;
  name: string;
  prefix: string;
  scopes: Record<string, TokenScope>;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface CreatedToken extends Token {
  token: string; // full "dk_live_..." raw token, shown once
}

export interface CreateTokenInput {
  name: string;
  scopes: Record<string, TokenScope>;
  expires_in_days?: number | null;
}

// ─── Share Tokens (per-story URL share for agents) ───

export interface ShareTokenResponse {
  share_url: string;
  expires_at: string;
  previous_revoked: boolean;
}

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
    uploadAvatar: (userId: string, file: File) =>
      uploadFile<UserSafe>(`/api/team/members/${userId}/avatar`, file),
    getSettings: () => request<Record<string, string>>('/api/team/settings'),
    updateSettings: (key: string, value: string) =>
      request<Record<string, string>>('/api/team/settings', { method: 'PATCH', body: JSON.stringify({ key, value }) }),
  },

  projects: {
    list: (status?: string) =>
      request<Project[]>(`/api/projects${status ? `?status=${status}` : ''}`),
    create: (data: { name: string; prefix: string; color: string; icon_url?: string }) =>
      request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean; archived?: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  },

  stories: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<StoryWithAssignees[]>(`/api/stories${qs}`);
    },
    kanban: (params: {
      scope?: 'mine' | 'all';
      projects?: string[];
      done_range?: 'week' | 'month' | 'all';
    }) => {
      const q = new URLSearchParams();
      if (params.scope) q.set('scope', params.scope);
      if (params.projects && params.projects.length) q.set('projects', params.projects.join(','));
      if (params.done_range) q.set('done_range', params.done_range);
      const qs = q.toString();
      return request<KanbanResponse>(`/api/stories/kanban${qs ? `?${qs}` : ''}`);
    },
    listPaged: (params: {
      status?: string;
      project_id?: string;
      limit?: number;
      offset?: number;
      assignee_id?: string;
      completed_after?: string;
      completed_before?: string;
    }) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
      }
      return request<PaginatedStories>(`/api/stories?${q.toString()}`);
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
    createShareToken: (storyId: string) =>
      request<ShareTokenResponse>(`/api/stories/${storyId}/share-token`, { method: 'POST' }),
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
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/goals/${id}`, { method: 'DELETE' }),
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

  completions: {
    list: (from: string, to: string) =>
      request<StoryCompletion[]>(`/api/completions?from=${from}&to=${to}`),
    create: (story_id: string, completion_date: string) =>
      request<StoryCompletion>('/api/completions', {
        method: 'POST',
        body: JSON.stringify({ story_id, completion_date }),
      }),
    delete: (story_id: string, completion_date: string) =>
      request<{ ok: boolean }>('/api/completions', {
        method: 'DELETE',
        body: JSON.stringify({ story_id, completion_date }),
      }),
  },

  learnings: {
    list: (params?: { status?: string }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      return request<Learning[]>(`/api/learnings?${q}`);
    },
    create: (data: { title: string; content?: string }) =>
      request<Learning>('/api/learnings', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request<Learning>(`/api/learnings/${id}`),
    update: (id: string, data: Record<string, unknown>) =>
      request<Learning>(`/api/learnings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/learnings/${id}`, { method: 'DELETE' }),
  },

  wiki: {
    list: (projectId: string, tag?: string) => {
      const q = new URLSearchParams({ project_id: projectId });
      if (tag) q.set('tag', tag);
      return request<WikiArticle[]>(`/api/wiki?${q}`);
    },
    search: (query: string, projectId?: string) => {
      const q = new URLSearchParams({ q: query });
      if (projectId) q.set('project_id', projectId);
      return request<WikiArticle[]>(`/api/wiki/search?${q}`);
    },
    graph: (projectId: string) => request(`/api/wiki/graph?project_id=${projectId}`),
    resolve: (title: string, projectId: string) =>
      request<WikiArticle>(`/api/wiki/resolve?title=${encodeURIComponent(title)}&project_id=${projectId}`),
    batch: (ids: string[]) =>
      request<WikiArticle[]>('/api/wiki/batch', { method: 'POST', body: JSON.stringify({ ids }) }),
    links: (id: string) =>
      request<{ outgoing: { id: string; title: string }[]; incoming: { id: string; title: string }[] }>(`/api/wiki/${id}/links`),
    create: (data: { project_id: string; title: string; content?: string; tags?: string[] }) =>
      request<WikiArticle>('/api/wiki', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request<WikiArticle>(`/api/wiki/${id}`),
    update: (id: string, data: Record<string, unknown>) =>
      request<WikiArticle>(`/api/wiki/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/wiki/${id}`, { method: 'DELETE' }),
    archive: (id: string, is_archived: boolean) =>
      request<{ ok: boolean; is_archived: boolean }>(`/api/wiki/${id}/archive`, { method: 'PATCH', body: JSON.stringify({ is_archived }) }),
    snapshot: (id: string) =>
      request<{ ok: boolean }>(`/api/wiki/${id}/snapshot`, { method: 'POST' }),
    acceptSuggestion: (id: string, data: { type: 'tag' | 'link'; value: string }) =>
      request<WikiArticle>(`/api/wiki/${id}/accept-suggestion`, { method: 'POST', body: JSON.stringify(data) }),
    dismissSuggestion: (id: string, data: { type: 'tag' | 'link'; value: string }) =>
      request<WikiArticle>(`/api/wiki/${id}/dismiss-suggestion`, { method: 'POST', body: JSON.stringify(data) }),
    createShareToken: (articleId: string) =>
      request<ShareTokenResponse>(`/api/wiki/${articleId}/share-token`, { method: 'POST' }),
  },

  admin: {
    seed: () => request<{ ok: boolean; message: string }>('/api/admin/seed', { method: 'POST' }),
  },

  tokens: {
    list: () => request<Token[]>('/api/tokens'),
    create: (data: CreateTokenInput) =>
      request<CreatedToken>('/api/tokens', { method: 'POST', body: JSON.stringify(data) }),
    reveal: (id: string) => request<{ token: string }>(`/api/tokens/${id}/reveal`),
    revoke: (id: string) =>
      request<{ ok: boolean }>(`/api/tokens/${id}`, { method: 'DELETE' }),
  },
};
