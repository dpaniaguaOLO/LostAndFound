/**
 * Operaciones de administración que no forman parte del CRUD común.
 *
 * El restablecimiento de contraseña por un admin es una operación privilegiada:
 *  - En Supabase se ejecuta vía la Edge Function `admin-reset-password`, que usa
 *    la service_role del lado servidor (nunca en el cliente).
 *  - En REST se delega a un endpoint equivalente del backend Express (pendiente
 *    de implementar en ese backend; aquí queda la llamada preparada).
 *
 * Se mantiene fuera de `DataServices` porque es específica de administración y no
 * todos los backends la exponen igual.
 */
import type { ArchivedResponse, AuditEntry, Claim, User } from '@laf/shared';
import { config, useSupabase } from '../lib/config';
import { requireSupabase } from '../lib/supabase';
import { api } from '../lib/api';

export interface AdminStats {
  users: number;
  foundItems: number;
  lostReports: number;
  claimsPending: number;
  returned: number;
}

export interface AdminService {
  /** Restablece la contraseña de un colaborador por su número. Requiere rol ADMIN. */
  resetUserPassword(employeeId: string, newPassword: string): Promise<void>;
  stats(): Promise<AdminStats>;
  users(): Promise<User[]>;
  /** Crea un colaborador (alta por admin). */
  createUser(input: {
    employeeId: string;
    name: string;
    password: string;
    role: 'ADMIN' | 'EMPLOYEE';
  }): Promise<User>;
  setRole(userId: string, role: 'ADMIN' | 'EMPLOYEE'): Promise<User>;
  /** Activa o desactiva un colaborador (desactivar conserva su historial). */
  setActive(userId: string, active: boolean): Promise<User>;
  audit(limit?: number): Promise<AuditEntry[]>;
  allClaims(): Promise<Claim[]>;
  /** Objetos retirados de circulación (encontrados ARCHIVED + perdidos CLOSED). */
  archived(): Promise<ArchivedResponse>;
  /** Devuelve un objeto archivado al muro (found→PUBLISHED, lost→OPEN). */
  restore(kind: 'found' | 'lost', id: string): Promise<void>;
}

/** Invoca la Edge Function `api` (reutilizada para las rutas admin en Supabase). */
async function invokeEdge<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke(`api${path}`, {
    method: method as 'GET' | 'POST' | 'PATCH',
    body,
  });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const parsed = await ctx.json();
        if (parsed?.message) message = parsed.message;
      }
    } catch {
      /* usa mensaje por defecto */
    }
    throw new Error(message);
  }
  return data as T;
}

const supabaseAdmin: AdminService = {
  async resetUserPassword(employeeId, newPassword) {
    const sb = requireSupabase();
    const { data, error } = await sb.functions.invoke('admin-reset-password', {
      body: { employeeId, newPassword },
    });
    if (error) {
      // Intenta extraer el mensaje devuelto por la función.
      let message = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          const parsed = await ctx.json();
          if (parsed?.message) message = parsed.message;
        }
      } catch {
        /* usa el mensaje por defecto */
      }
      throw new Error(message);
    }
    if (data && (data as { error?: string }).error) {
      throw new Error((data as { message?: string }).message ?? 'No se pudo restablecer');
    }
  },
  stats: () => invokeEdge<AdminStats>('GET', '/admin/stats'),
  users: () => invokeEdge<User[]>('GET', '/admin/users'),
  createUser: (input) => invokeEdge<User>('POST', '/admin/users', { ...input }),
  setRole: (userId, role) =>
    invokeEdge<User>('PATCH', `/admin/users/${userId}/role`, { role }),
  setActive: (userId, active) =>
    invokeEdge<User>('PATCH', `/admin/users/${userId}/active`, { active }),
  audit: (limit = 100) => invokeEdge<AuditEntry[]>('GET', `/admin/audit?limit=${limit}`),
  allClaims: () => invokeEdge<Claim[]>('GET', '/claims/all'),
  archived: () => invokeEdge<ArchivedResponse>('GET', '/admin/archived'),
  restore: async (kind, id) => {
    await invokeEdge('POST', '/admin/restore', { kind, id });
  },
};

const restAdmin: AdminService = {
  async resetUserPassword(employeeId, newPassword) {
    await api('/admin/users/reset-password', {
      method: 'POST',
      body: { employeeId, newPassword },
    });
  },
  stats: () => api<AdminStats>('/admin/stats'),
  users: () => api<User[]>('/admin/users'),
  createUser: (input) => api<User>('/admin/users', { method: 'POST', body: { ...input } }),
  setRole: (userId, role) =>
    api<User>(`/admin/users/${userId}/role`, { method: 'PATCH', body: { role } }),
  setActive: (userId, active) =>
    api<User>(`/admin/users/${userId}/active`, { method: 'PATCH', body: { active } }),
  audit: (limit = 100) => api<AuditEntry[]>(`/admin/audit?limit=${limit}`),
  allClaims: () => api<Claim[]>('/claims/all'),
  archived: () => api<ArchivedResponse>('/admin/archived'),
  restore: async (kind, id) => {
    await api('/admin/restore', { method: 'POST', body: { kind, id } });
  },
};

export const adminService: AdminService = useSupabase ? supabaseAdmin : restAdmin;

/** ¿Está disponible el restablecimiento de contraseña en el backend activo? */
export const canResetPassword = useSupabase ? config.supabase.configured : true;
