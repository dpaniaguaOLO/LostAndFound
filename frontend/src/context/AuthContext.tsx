import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LoginRequest, RegisterRequest, User } from '@laf/shared';
import { cacheClear } from '../lib/cache';
import { services } from '../services';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (body: LoginRequest, remember?: boolean) => Promise<void>;
  register: (body: RegisterRequest, remember?: boolean) => Promise<void>;
  logout: () => void;
  /** Actualiza localmente el usuario de la sesión (p. ej. tras cambiar la foto de perfil). */
  updateUser: (patch: Partial<User>) => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Al cargar, recupera la sesión actual desde la capa de datos activa
  // (REST lee el token guardado; Supabase lee su propia sesión persistida).
  useEffect(() => {
    let cancelled = false;
    services.auth
      .getCurrentUser()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(body: LoginRequest, remember = true) {
    const u = await services.auth.login(body.employeeId, body.password, remember);
    setUser(u);
  }

  async function register(body: RegisterRequest, remember = true) {
    const u = await services.auth.register(
      { name: body.name, employeeId: body.employeeId, password: body.password },
      remember,
    );
    setUser(u);
  }

  function logout() {
    // La implementación activa limpia su sesión (token REST o sesión Supabase).
    void services.auth.logout();
    cacheClear(); // la copia local del muro no debe quedar para el siguiente usuario
    setUser(null);
  }

  function updateUser(patch: Partial<User>) {
    setUser((u) => (u ? { ...u, ...patch } : u));
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, updateUser, isAdmin: user?.role === 'ADMIN' }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
