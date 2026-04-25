import {
  createContext, useContext, createResource, createMemo, Show,
  type ParentComponent, type Accessor,
} from 'solid-js';
import type { User, Project } from '../types';
import { api, API_BASE } from './api';

interface DataContextValue {
  users: Accessor<User[]>;
  projects: Accessor<Project[]>;
  getUserById: (id: string) => User | undefined;
  getProjectById: (id: string) => Project | undefined;
  refetchUsers: () => void;
  refetchProjects: () => void;
}

const DataContext = createContext<DataContextValue>();

export const DataProvider: ParentComponent = (props) => {
  // Resolve relative avatar URLs (e.g. /api/team/avatars/...) to absolute using API_BASE
  const resolveAvatarUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('/api/')) return `${API_BASE}${url}`;
    return url;
  };

  const [users, { refetch: refetchUsers }] = createResource(async () => {
    const list = await api.team.getMembers() as User[];
    return list.map(u => ({ ...u, avatar_url: resolveAvatarUrl(u.avatar_url) }));
  });
  const [projectList, { refetch: refetchProjects }] = createResource(() => api.projects.list());

  // Reading `.latest` keeps the previous value during refetches, so consumers
  // never re-suspend after the initial load. The full-screen "Cargando datos…"
  // overlay is gated by `firstReady` (createMemo accumulator), which latches
  // true once both resources have resolved at least once and never goes back.
  const value: DataContextValue = {
    users: () => users.latest ?? [],
    projects: () => projectList.latest ?? [],
    getUserById: (id: string) => (users.latest ?? []).find(u => u.id === id),
    getProjectById: (id: string) => (projectList.latest ?? []).find(p => p.id === id),
    refetchUsers: () => refetchUsers(),
    refetchProjects: () => refetchProjects(),
  };

  // Latch on first settle (ready OR errored). A failed fetch shouldn't leave
  // the user staring at an indefinite "Cargando datos…" — the app renders with
  // empty arrays and the page-level UX surfaces the issue contextually.
  const firstReady = createMemo<boolean>((prev) => {
    if (prev) return true;
    const settled = (s: string) => s === 'ready' || s === 'errored';
    return settled(users.state) && settled(projectList.state);
  }, false);

  return (
    <DataContext.Provider value={value}>
      <Show
        when={firstReady()}
        fallback={
          <div class="min-h-screen flex items-center justify-center bg-base-100">
            <div class="flex flex-col items-center gap-3">
              <span class="loading loading-spinner loading-md text-ios-blue-500" />
              <span class="text-sm text-base-content/40">Cargando datos...</span>
            </div>
          </div>
        }
      >
        {props.children}
      </Show>
    </DataContext.Provider>
  );
};

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
