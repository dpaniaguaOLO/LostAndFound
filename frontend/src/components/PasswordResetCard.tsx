import { useState, type FormEvent } from 'react';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { adminService, canResetPassword } from '../services/admin';

/**
 * Herramienta de administración: restablecer la contraseña de un colaborador
 * por su número. Útil con login por número de colaborador (sin correo real),
 * donde no existe recuperación de contraseña por email.
 *
 * La operación la ejecuta el backend de forma privilegiada (Edge Function con
 * service_role en Supabase); el cliente solo envía número + nueva contraseña.
 */
export function PasswordResetCard() {
  const { notify } = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!canResetPassword) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      notify('La contraseña debe tener al menos 8 caracteres', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await adminService.resetUserPassword(employeeId.trim(), password);
      notify(`Contraseña restablecida para el colaborador ${employeeId.trim()}`, 'success');
      setEmployeeId('');
      setPassword('');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo restablecer la contraseña'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card mt-8 p-5">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
        Restablecer contraseña
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Asigna una nueva contraseña a un colaborador por su número. Úsalo cuando alguien
        olvide su contraseña.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4 sm:max-w-md">
        <div>
          <label className="label" htmlFor="reset-employee">
            Número de colaborador
          </label>
          <input
            id="reset-employee"
            className="input"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
            inputMode="numeric"
            placeholder="Ej. 2002"
          />
        </div>

        <div>
          <label className="label" htmlFor="reset-password">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              id="reset-password"
              className="input pr-16"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-olo-700 dark:text-olo-400"
            >
              {show ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </div>

        <button className="btn-primary sm:w-auto" type="submit" disabled={submitting}>
          {submitting ? 'Restableciendo…' : 'Restablecer contraseña'}
        </button>
      </form>
    </div>
  );
}
