import {
  createContext, useContext, createSignal, createResource,
  type ParentComponent, type Accessor,
} from 'solid-js';
import type { User } from '../types';
import { api, ApiError } from './api';

interface AuthContextValue {
  user: Accessor<User | undefined>;
  isAuthenticated: Accessor<boolean>;
  loading: Accessor<boolean>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextValue>();

export const AuthProvider: ParentComponent = (props) => {
  const [loginError, setLoginError] = createSignal<string | null>(null);

  const [user, { refetch, mutate }] = createResource(async () => {
    try {
      return await api.auth.me();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return undefined;
      throw e;
    }
  });

  const login = async (email: string, password: string) => {
    const u = await api.auth.login(email, password);
    mutate(u as User);
  };

  const logout = async () => {
    await api.auth.logout();
    mutate(undefined);
  };

  const value: AuthContextValue = {
    user: () => user(),
    isAuthenticated: () => !!user(),
    loading: () => user.loading,
    login,
    logout,
    refetch: () => refetch(),
  };

  return (
    <AuthContext.Provider value={value}>
      {props.children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
