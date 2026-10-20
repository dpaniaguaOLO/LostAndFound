import { useState, type FormEvent } from 'react';
import type { User } from '@laf/shared';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { adminService } from '../services/admin';

/**
 * Alta de colaborador por un administrador (app interna: no hay auto-registro).
 * El servidor crea la cuenta con email sintético y confirma el correo; el admin
 * solo da número, nombre, contraseña y rol.
 */
export function CreateUserCard({ onCreated }: { onCreated?: (u: User) => void }) {
  const { notify } = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'EMPLOYEE' | 'ADMIN'>('EMPLOYEE');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      notify('La contraseña debe tener al menos 8 caracteres', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const user = await adminService.createUser({
        employeeId: employeeId.trim(),
        name: name.trim(),
        password,
        role,
      });
      notify(`Colaborador ${user.employeeId} creado`, 'success');
      setEmployeeId('');
      setName('');
      setPassword('');
      setRole('EMPLOYEE');
      onCreated?.(user);
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo crear el colaborador'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card mt-8 p-5">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
        Crear colaborador
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Da de alta a un colaborador. Entrará con su número y la contraseña que definas aquí.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:max-w-md">
        <div>
          <label className="label" htmlFor="new-employee">
            Número de colaborador
          </label>
          <input
            id="new-employee"
            className="input"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
            inputMode="numeric"
            placeholder="Ej. 3003"
          />
        </div>

        <div>
          <label className="label" htmlFor="new-name">
            Nombre
          </label>
          <input
            id="new-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="off"
          />
        </div>

        <div>
          <label className="label" htmlFor="new-password">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="new-password"
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

        <div>
          <label className="label" htmlFor="new-role">
            Rol
          </label>
          <select
            id="new-role"
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as 'EMPLOYEE' | 'ADMIN')}
          >
            <option value="EMPLOYEE">Empleado</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>

        <button className="btn-primary sm:w-auto" type="submit" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear colaborador'}
        </button>
      </form>
    </div>
  );
}
