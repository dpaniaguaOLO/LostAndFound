import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuditEntry, Claim, User } from '@laf/shared';
import { PasswordResetCard } from '../components/PasswordResetCard';
import { ErrorState, Spinner, StatusBadge, Tabs } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api, ApiRequestError } from '../lib/api';
import { CLAIM_STATUS_LABELS, formatDate, formatDateTime } from '../lib/format';

interface Stats {
  users: number;
  foundItems: number;
  lostReports: number;
  claimsPending: number;
  returned: number;
}

type Tab = 'overview' | 'claims' | 'audit';

const ACTION_LABELS: Record<string, string> = {
  FOUND_ITEM_EDITED: 'Editó un objeto encontrado',
  FOUND_ITEM_ARCHIVED: 'Archivó un objeto',
  FOUND_ITEM_DELETED: 'Eliminó un objeto',
  FOUND_ITEM_RETURNED: 'Marcó un objeto como devuelto',
  LOST_REPORT_EDITED: 'Editó un reporte perdido',
  LOST_REPORT_DELETED: 'Eliminó un reporte perdido',
  LOST_REPORT_RESOLVED: 'Resolvió un reporte perdido',
  CLAIM_REVIEWED: 'Revisó una reclamación',
  USER_ROLE_CHANGED: 'Cambió el rol de un usuario',
};

export function AdminPage() {
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>('overview');

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carga inicial del resumen.
  function loadOverview() {
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

  useEffect(loadOverview, []);

  // Carga perezosa de reclamaciones / historial al abrir su pestaña.
  useEffect(() => {
    if (tab === 'claims' && claims === null) {
      api<Claim[]>('/claims/all').then(setClaims).catch(() => setClaims([]));
    }
    if (tab === 'audit' && audit === null) {
      api<AuditEntry[]>('/admin/audit').then(setAudit).catch(() => setAudit([]));
    }
  }, [tab, claims, audit]);

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
  // El resumen/usuarios/historial dependen del backend REST (Express). Si no está
  // disponible (p. ej. con Supabase como backend de datos), igual ofrecemos las
  // acciones de admin que sí funcionan de forma autónoma, como restablecer contraseñas.
  if (error)
    return (
      <div>
        <ErrorState message={error} onRetry={loadOverview} />
        <PasswordResetCard />
      </div>
    );

  const cards = [
    { label: 'Usuarios', value: stats?.users ?? 0 },
    { label: 'Objetos encontrados', value: stats?.foundItems ?? 0 },
    { label: 'Reportes perdidos', value: stats?.lostReports ?? 0 },
    { label: 'Reclamaciones pendientes', value: stats?.claimsPending ?? 0 },
    { label: 'Objetos devueltos', value: stats?.returned ?? 0 },
  ];

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">
        Panel administrativo
      </h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Supervisión del sistema, reclamaciones e historial.
      </p>

      <Tabs<Tab>
        tabs={[
          { key: 'overview', label: 'Resumen' },
          { key: 'claims', label: 'Reclamaciones' },
          { key: 'audit', label: 'Historial' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* --- RESUMEN --- */}
      {tab === 'overview' && (
        <>
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
                  <th className="px-4 py-3 font-medium">N° colaborador</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Registro</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0 dark:border-olo-dark-800">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{u.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{u.employeeId}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`badge ${u.role === 'ADMIN' ? 'bg-olo-100 text-olo-800 dark:bg-olo-500/15 dark:text-olo-300' : 'bg-slate-100 text-slate-600 dark:bg-olo-dark-800 dark:text-slate-300'}`}
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

          {/* Restablecer contraseña de un colaborador (por número) */}
          <PasswordResetCard />
        </>
      )}

      {/* --- RECLAMACIONES (bandeja global) --- */}
      {tab === 'claims' && (
        <div>
          {claims === null ? (
            <Spinner />
          ) : claims.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No hay reclamaciones registradas.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {claims.map((c) => (
                <div key={c.id} className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {c.foundItem ? (
                        <Link
                          to={`/objetos/${c.foundItem.id}`}
                          className="font-semibold text-slate-800 hover:text-olo-700 dark:text-slate-100 dark:hover:text-olo-400"
                        >
                          {c.foundItem.title}
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-800 dark:text-slate-100">Objeto</span>
                      )}
                      <StatusBadge status={c.status} label={CLAIM_STATUS_LABELS[c.status]} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{c.message}</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Reclama: {c.claimant.name} · {formatDateTime(c.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- HISTORIAL (auditoría) --- */}
      {tab === 'audit' && (
        <div>
          {audit === null ? (
            <Spinner />
          ) : audit.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no hay eventos registrados.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {audit.map((e) => (
                <li key={e.id} className="card flex items-start gap-3 p-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-olo-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 dark:text-slate-100">
                      <span className="font-medium">{e.actor.name}</span>{' '}
                      — {ACTION_LABELS[e.action] ?? e.action}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{e.summary}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(e.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
