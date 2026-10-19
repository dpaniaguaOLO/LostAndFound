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
      <h1 className="mb-1 text-2xl font-semibold text-slate-800">Panel administrativo</h1>
      <p className="mb-6 text-sm text-slate-500">Resumen del sistema y gestión de usuarios.</p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-2xl font-semibold text-slate-800">{c.value}</p>
            <p className="text-xs text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-slate-800">Usuarios</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
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
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${u.role === 'ADMIN' ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {u.role === 'ADMIN' ? 'Administrador' : 'Empleado'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDate(u.createdAt)}</td>
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
