import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthResponse, LoginRequest, RegisterRequest, User } from '@laf/shared';
import { api, tokenStore } from '../lib/api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (body: LoginRequest, remember?: boolean) => Promise<void>;
  register: (body: RegisterRequest, remember?: boolean) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Al cargar, si hay token intenta recuperar el usuario actual.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  async function login(body: LoginRequest, remember = true) {
    const res = await api<AuthResponse>('/auth/login', { method: 'POST', body, auth: false });
    tokenStore.set(res.token, remember);
    setUser(res.user);
  }

  async function register(body: RegisterRequest, remember = true) {
    const res = await api<AuthResponse>('/auth/register', { method: 'POST', body, auth: false });
    tokenStore.set(res.token, remember);
    setUser(res.user);
  }

  function logout() {
    tokenStore.clear();
    setUser(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, isAdmin: user?.role === 'ADMIN' }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
