import { useEffect, useState } from 'react';
import type { User } from '@laf/shared';
import { ErrorState, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api, ApiRequestError } from '../lib/api';
import { formatDate } from '../lib/format';

interface Stats {
  users: number;
  foundItems: number;
  lostReports: number;
  claimsPending: number;
  returned: number;
}

export function AdminPage() {
  const { notify } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([api<Stats>('/admin/stats'), api<User[]>('/admin/users')])
      .then(([s, u]) => {
        setStats(s);
        setUsers(u);
      })
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'Error al cargar el panel'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function changeRole(user: User, role: 'ADMIN' | 'EMPLOYEE') {
    try {
      const updated = await api<User>(`/admin/users/${user.id}/role`, {
        method: 'PATCH',
        body: { role },
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      notify('Rol actualizado', 'success');
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo actualizar el rol', 'error');
    }
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const cards = [
    { label: 'Usuarios', value: stats?.users ?? 0 },
    { label: 'Objetos encontrados', value: stats?.foundItems ?? 0 },
    { label: 'Reportes perdidos', value: stats?.lostReports ?? 0 },
    { label: 'Reclamaciones pendientes', value: stats?.claimsPending ?? 0 },
    { label: 'Objetos devueltos', value: stats?.returned ?? 0 },
  ];

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">Panel administrativo</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Resumen del sistema y gestión de usuarios.</p>

      {/* Tarjetas de métricas inspiradas en cómo OLO presenta sus indicadores
          (cifra grande + etiqueta corta), con borde superior en verde de marca. */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card overflow-hidden p-0">
            <div className="h-1 w-full bg-olo-500" />
            <div className="p-4">
              <p className="text-3xl font-bold text-ink dark:text-slate-100">{c.value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {c.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Usuarios</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-olo-dark-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Correo</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Registro</th>
              <th className="px-4 py-3 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0 dark:border-olo-dark-800">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{u.name}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${u.role === 'ADMIN' ? 'bg-olo-100 text-olo-800 dark:bg-olo-500/15 dark:text-olo-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                  >
                    {u.role === 'ADMIN' ? 'Administrador' : 'Empleado'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3">
                  {u.role === 'ADMIN' ? (
                    <button className="btn-secondary" onClick={() => changeRole(u, 'EMPLOYEE')}>
                      Quitar admin
                    </button>
                  ) : (
                    <button className="btn-secondary" onClick={() => changeRole(u, 'ADMIN')}>
                      Hacer admin
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
