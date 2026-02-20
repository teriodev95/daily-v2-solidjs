import {
  createContext, useContext, createResource, Suspense,
  type ParentComponent, type Accessor,
} from 'solid-js';
import type { User, Project } from '../types';
import { api } from './api';

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
  const [users, { refetch: refetchUsers }] = createResource(() => api.team.getMembers() as Promise<User[]>);
  const [projectList, { refetch: refetchProjects }] = createResource(() => api.projects.list());

  const value: DataContextValue = {
    users: () => users() ?? [],
    projects: () => projectList() ?? [],
    getUserById: (id: string) => (users() ?? []).find(u => u.id === id),
    getProjectById: (id: string) => (projectList() ?? []).find(p => p.id === id),
    refetchUsers: () => refetchUsers(),
    refetchProjects: () => refetchProjects(),
  };

  return (
    <DataContext.Provider value={value}>
      <Suspense fallback={
        <div class="min-h-screen flex items-center justify-center bg-base-100">
          <div class="flex flex-col items-center gap-3">
            <span class="loading loading-spinner loading-md text-ios-blue-500" />
            <span class="text-sm text-base-content/40">Cargando datos...</span>
          </div>
        </div>
      }>
        {props.children}
      </Suspense>
    </DataContext.Provider>
  );
};

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
