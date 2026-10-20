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
import { config, useSupabase } from '../lib/config';
import { requireSupabase } from '../lib/supabase';
import { api } from '../lib/api';

export interface AdminService {
  /** Restablece la contraseña de un colaborador por su número. Requiere rol ADMIN. */
  resetUserPassword(employeeId: string, newPassword: string): Promise<void>;
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
};

const restAdmin: AdminService = {
  async resetUserPassword(employeeId, newPassword) {
    await api('/admin/users/reset-password', {
      method: 'POST',
      body: { employeeId, newPassword },
    });
  },
};

export const adminService: AdminService = useSupabase ? supabaseAdmin : restAdmin;

/** ¿Está disponible el restablecimiento de contraseña en el backend activo? */
export const canResetPassword = useSupabase ? config.supabase.configured : true;
