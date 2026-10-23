import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ArchivedResponse, AuditEntry, Claim, User } from '@laf/shared';
import { ClaimReviewDialog } from '../components/ClaimReviewDialog';
import { CreateUserCard } from '../components/CreateUserCard';
import { PlayerName } from '../components/game';
import { PasswordResetCard } from '../components/PasswordResetCard';
import { ConfirmDialog, ErrorState, ItemImage, PageHeader, Spinner, StatusBadge, TabPanel, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { CATEGORY_LABELS, CLAIM_STATUS_LABELS, formatDate, formatDateTime } from '../lib/format';
import { services } from '../services';
import { adminService, type AdminStats } from '../services/admin';

type Stats = AdminStats;

type Tab = 'overview' | 'claims' | 'audit' | 'archived';

/** Colaboradores visibles al principio y cuántos más se cargan cada vez. */
const USERS_FIRST = 5;
const USERS_MORE = 10;

const ACTION_LABELS: Record<string, string> = {
  FOUND_ITEM_EDITED: 'Editó un objeto encontrado',
  FOUND_ITEM_ARCHIVED: 'Archivó un objeto',
  FOUND_ITEM_DELETED: 'Eliminó un objeto',
  FOUND_ITEM_RETURNED: 'Marcó un objeto como devuelto',
  FOUND_ITEM_RESTORED: 'Restauró un objeto encontrado',
  LOST_REPORT_EDITED: 'Editó un reporte perdido',
  LOST_REPORT_DELETED: 'Eliminó un reporte perdido',
  LOST_REPORT_RESOLVED: 'Resolvió un reporte perdido',
  LOST_REPORT_CLOSED: 'Archivó un reporte perdido',
  LOST_REPORT_RESTORED: 'Restauró un reporte perdido',
  CLAIM_REVIEWED: 'Revisó una reclamación',
  USER_ROLE_CHANGED: 'Cambió el rol de un usuario',
  USER_PASSWORD_RESET: 'Restableció una contraseña',
  USER_CREATED: 'Creó un colaborador',
  USER_ACTIVATED: 'Reactivó a un colaborador',
  USER_DEACTIVATED: 'Desactivó a un colaborador',
};

function RoleBadge({ role }: { role: User['role'] }) {
  return (
    <span
      className={`badge ${role === 'ADMIN' ? 'bg-olo-100 text-olo-800 dark:bg-olo-500/15 dark:text-olo-300' : 'bg-slate-100 text-slate-600 dark:bg-olo-dark-800 dark:text-slate-300'}`}
    >
      {role === 'ADMIN' ? 'Administrador' : 'Empleado'}
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="badge bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300">Activo</span>
  ) : (
    <span className="badge bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">Desactivado</span>
  );
}

export function AdminPage() {
  const { notify } = useToast();
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [archived, setArchived] = useState<ArchivedResponse | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<User | null>(null);
  const [confirmRole, setConfirmRole] = useState<{ user: User; role: 'ADMIN' | 'EMPLOYEE' } | null>(null);
  const [reviewing, setReviewing] = useState<{ claim: Claim; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [userFilter, setUserFilter] = useState('');
  // Con cientos de colaboradores la lista se muestra por partes (la búsqueda abarca a todos).
  const [userLimit, setUserLimit] = useState(USERS_FIRST);
  // Error al cargar una pestaña: antes se mostraba como "no hay datos" (UX-08).
  const [tabError, setTabError] = useState<Partial<Record<Tab, string>>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carga inicial del resumen.
  function loadOverview() {
    setLoading(true);
    setError(null);
    Promise.all([adminService.stats(), adminService.users()])
      .then(([s, u]) => {
        setStats(s);
        setUsers(u);
      })
      .catch((err) => setError(getErrorMessage(err, 'Error al cargar el panel')))
      .finally(() => setLoading(false));
  }

  useEffect(loadOverview, []);

  // Carga perezosa de reclamaciones / historial al abrir su pestaña.
  useEffect(() => {
    const fail = (t: Tab) => (err: unknown) =>
      setTabError((prev) => ({ ...prev, [t]: getErrorMessage(err, 'No se pudo cargar esta sección') }));
    if (tabError[tab]) return; // esperar a "Reintentar"
    if (tab === 'claims' && claims === null) adminService.allClaims().then(setClaims).catch(fail('claims'));
    if (tab === 'audit' && audit === null) adminService.audit().then(setAudit).catch(fail('audit'));
    if (tab === 'archived' && archived === null) adminService.archived().then(setArchived).catch(fail('archived'));
  }, [tab, claims, audit, archived, tabError]);

  function retryTab() {
    setTabError((prev) => ({ ...prev, [tab]: undefined }));
  }

  // Revisión de reclamaciones ajenas desde la bandeja global (UX-01).
  async function confirmReview(note: string) {
    if (!reviewing) return;
    const { claim, decision } = reviewing;
    setReviewing(null);
    try {
      await services.claims.review(claim.id, decision, note || undefined);
      notify(decision === 'APPROVED' ? 'Reclamación aprobada' : 'Reclamación rechazada', 'success');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo revisar la reclamación'), 'error');
    } finally {
      setClaims(null); // recargar la bandeja con el estado real
    }
  }

  async function restore(kind: 'found' | 'lost', id: string) {
    try {
      await adminService.restore(kind, id);
      notify('Objeto restaurado', 'success');
      // Quita el elemento de la lista local sin recargar todo.
      setArchived((prev) =>
        prev
          ? {
              found: kind === 'found' ? prev.found.filter((i) => i.id !== id) : prev.found,
              lost: kind === 'lost' ? prev.lost.filter((i) => i.id !== id) : prev.lost,
            }
          : prev,
      );
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo restaurar'), 'error');
    }
  }

  async function changeRole(user: User, role: 'ADMIN' | 'EMPLOYEE') {
    try {
      const updated = await adminService.setRole(user.id, role);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      notify('Rol actualizado', 'success');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo actualizar el rol'), 'error');
    }
  }

  async function toggleActive(user: User) {
    try {
      const updated = await adminService.setActive(user.id, !user.active);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      notify(updated.active ? 'Colaborador reactivado' : 'Colaborador desactivado', 'success');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo cambiar el estado'), 'error');
    } finally {
      setConfirmDeactivate(null);
    }
  }

  // Acciones por usuario (compartidas por la tabla de escritorio y las tarjetas móviles).
  function userActions(u: User) {
    return (
      <>
        {u.role === 'ADMIN' ? (
          <button className="btn-secondary" onClick={() => setConfirmRole({ user: u, role: 'EMPLOYEE' })}>
            Quitar admin
          </button>
        ) : (
          <button className="btn-secondary" onClick={() => setConfirmRole({ user: u, role: 'ADMIN' })}>
            Hacer admin
          </button>
        )}
        {/* No permitir que un admin se desactive a sí mismo */}
        {currentUser?.id !== u.id &&
          (u.active ? (
            <button className="btn-danger-soft" onClick={() => setConfirmDeactivate(u)}>
              Desactivar
            </button>
          ) : (
            <button className="btn-primary" onClick={() => toggleActive(u)}>
              Reactivar
            </button>
          ))}
      </>
    );
  }

  if (loading) return <Spinner />;
  // El resumen/usuarios/historial dependen del backend REST (Express). Si no está
  // disponible (p. ej. con Supabase como backend de datos), igual ofrecemos las
  // acciones de admin que sí funcionan de forma autónoma, como restablecer contraseñas.
  if (error)
    return (
      <div>
        <ErrorState message={error} onRetry={loadOverview} />
        <CreateUserCard />
        <PasswordResetCard />
      </div>
    );

  const q = userFilter.trim().toLowerCase();
  const visibleUsers = q
    ? users.filter((u) => u.name.toLowerCase().includes(q) || u.employeeId.toLowerCase().includes(q))
    : users;
  const shownUsers = visibleUsers.slice(0, userLimit);

  const cards = [
    { label: 'Usuarios', value: stats?.users ?? 0 },
    { label: 'Objetos encontrados', value: stats?.foundItems ?? 0 },
    { label: 'Reportes perdidos', value: stats?.lostReports ?? 0 },
    { label: 'Reclamaciones pendientes', value: stats?.claimsPending ?? 0 },
    { label: 'Objetos devueltos', value: stats?.returned ?? 0 },
  ];

  return (
    <div>
      <PageHeader title="Panel administrativo" subtitle="Supervisión del sistema, reclamaciones e historial." />

      <Tabs<Tab>
        id="admin"
        label="Secciones de administración"
        tabs={[
          { key: 'overview', label: 'Resumen' },
          { key: 'claims', label: 'Reclamaciones' },
          { key: 'archived', label: 'Archivados' },
          { key: 'audit', label: 'Historial' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <TabPanel id="admin" active={tab}>
      {/* --- RESUMEN --- */}
      {tab === 'overview' && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {cards.map((c, i) => (
              <div
                key={c.label}
                className={'card relative animate-fade-up overflow-hidden p-4 ' + (i === cards.length - 1 ? 'col-span-2 sm:col-span-1' : '')}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-olo-500/10 dark:bg-olo-400/10" aria-hidden />
                <p className="relative text-3xl font-extrabold tabular-nums tracking-tight text-ink dark:text-slate-50">{c.value}</p>
                <p className="relative mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{c.label}</p>
              </div>
            ))}
          </div>

          <h2 className="section-title mb-3">Usuarios</h2>

          {/* Móvil: tarjetas (una tabla de 6 columnas no cabe en 360px) */}
          <div className="mb-3 sm:max-w-xs">
            <label className="sr-only" htmlFor="user-filter">
              Buscar colaborador
            </label>
            <input
              id="user-filter"
              type="search"
              className="input"
              placeholder="Buscar por nombre o número…"
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setUserLimit(USERS_FIRST);
              }}
            />
          </div>
          {visibleUsers.length === 0 && (
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Ningún colaborador coincide con la búsqueda.</p>
          )}

          <ul className="flex flex-col gap-2.5 md:hidden">
            {shownUsers.map((u) => (
              <li key={u.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate">
                      <PlayerName id={u.id} name={u.name} />
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      N° {u.employeeId} · desde {formatDate(u.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <RoleBadge role={u.role} />
                    <ActiveBadge active={u.active} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 [&>*:only-child]:col-span-2">{userActions(u)}</div>
              </li>
            ))}
          </ul>

          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500 dark:border-olo-dark-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">N° colaborador</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Registro</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {shownUsers.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0 dark:border-olo-dark-800">
                    <td className="px-4 py-3">
                      <PlayerName id={u.id} name={u.name} />
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{u.employeeId}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-3">
                      <ActiveBadge active={u.active} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">{userActions(u)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleUsers.length > USERS_FIRST && (
            <div className="mt-3 flex flex-col gap-2">
              {shownUsers.length < visibleUsers.length && (
                <button className="btn-secondary w-full" onClick={() => setUserLimit((n) => n + USERS_MORE)}>
                  Cargar {Math.min(USERS_MORE, visibleUsers.length - shownUsers.length)} más
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
                  Mostrando {shownUsers.length} de {visibleUsers.length} colaboradores
                  {q ? ' que coinciden' : ''}
                </p>
                {shownUsers.length > USERS_FIRST && (
                  <button
                    className="text-xs font-semibold text-slate-500 underline-offset-2 hover:text-olo-700 hover:underline dark:text-slate-400 dark:hover:text-olo-300"
                    onClick={() => setUserLimit(USERS_FIRST)}
                  >
                    Mostrar menos
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Alta de colaborador por el admin (no hay auto-registro) */}
          <CreateUserCard onCreated={(u) => setUsers((prev) => [u, ...prev])} />

          {/* Restablecer contraseña de un colaborador (por número) */}
          <PasswordResetCard />
        </>
      )}

      {/* --- RECLAMACIONES (bandeja global) --- */}
      {tab === 'claims' && (
        <div>
          {tabError.claims ? (
            <ErrorState message={tabError.claims} onRetry={retryTab} />
          ) : claims === null ? (
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
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Reclama: <PlayerName id={c.claimant.id} name={c.claimant.name} /> · {formatDateTime(c.createdAt)}
                    </p>
                    {c.reviewNote && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Nota: {c.reviewNote}</p>}
                  </div>
                  {/* Un admin puede resolver cualquier reclamación pendiente. */}
                  {c.status === 'PENDING' && (
                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                      <button className="btn-secondary" onClick={() => setReviewing({ claim: c, decision: 'REJECTED' })}>
                        Rechazar
                      </button>
                      <button
                        className="btn-primary"
                        disabled={c.foundItem?.status !== undefined && c.foundItem.status !== 'PUBLISHED'}
                        onClick={() => setReviewing({ claim: c, decision: 'APPROVED' })}
                      >
                        Aprobar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- ARCHIVADOS (moderación) --- */}
      {tab === 'archived' && (
        <div>
          {tabError.archived ? (
            <ErrorState message={tabError.archived} onRetry={retryTab} />
          ) : archived === null ? (
            <Spinner />
          ) : archived.found.length === 0 && archived.lost.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No hay objetos archivados. Los objetos encontrados que archives y los reportes
              perdidos que cierres aparecerán aquí para revisarlos o restaurarlos.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {[
                ...archived.found.map((i) => ({ kind: 'found' as const, item: i })),
                ...archived.lost.map((i) => ({ kind: 'lost' as const, item: i })),
              ].map(({ kind, item }) => (
                <div
                  key={`${kind}-${item.id}`}
                  className="card flex items-center gap-3 p-3 sm:gap-4"
                >
                  <div className="w-16 shrink-0 overflow-hidden rounded-xl">
                    <ItemImage src={item.imageUrl} alt={item.title} rounded={false} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {item.title}
                      </span>
                      <span className="badge bg-slate-100 text-slate-600 dark:bg-olo-dark-800 dark:text-slate-300">
                        {kind === 'found' ? 'Encontrado' : 'Perdido'}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {CATEGORY_LABELS[item.category]}
                      {item.location ? ` · ${item.location}` : ''}
                    </p>
                  </div>
                  <button
                    className="btn-secondary shrink-0"
                    onClick={() => restore(kind, item.id)}
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- HISTORIAL (auditoría) --- */}
      {tab === 'audit' && (
        <div>
          {tabError.audit ? (
            <ErrorState message={tabError.audit} onRetry={retryTab} />
          ) : audit === null ? (
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
                      <PlayerName id={e.actor.id} name={e.actor.name} />{' '}
                      — {ACTION_LABELS[e.action] ?? e.action}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{e.summary}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(e.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      </TabPanel>

      <ConfirmDialog
        open={confirmDeactivate !== null}
        title="Desactivar colaborador"
        message={
          confirmDeactivate
            ? `${confirmDeactivate.name} (N° ${confirmDeactivate.employeeId}) no podrá iniciar sesión. Su historial y publicaciones se conservan, y puedes reactivarlo cuando quieras.`
            : ''
        }
        confirmLabel="Desactivar"
        danger
        onConfirm={async () => {
          if (confirmDeactivate) await toggleActive(confirmDeactivate);
        }}
        onCancel={() => setConfirmDeactivate(null)}
      />

      <ConfirmDialog
        open={confirmRole !== null}
        title={confirmRole?.role === 'ADMIN' ? 'Hacer administrador' : 'Quitar administrador'}
        message={
          confirmRole?.role === 'ADMIN'
            ? `${confirmRole.user.name} podrá gestionar usuarios, contraseñas, reclamaciones y moderar publicaciones.`
            : `${confirmRole?.user.name ?? ''} perderá el acceso al panel de administración.`
        }
        confirmLabel={confirmRole?.role === 'ADMIN' ? 'Hacer admin' : 'Quitar admin'}
        danger={confirmRole?.role === 'ADMIN'}
        onConfirm={async () => {
          if (confirmRole) await changeRole(confirmRole.user, confirmRole.role);
          setConfirmRole(null);
        }}
        onCancel={() => setConfirmRole(null)}
      />

      <ClaimReviewDialog
        claim={reviewing?.claim ?? null}
        decision={reviewing?.decision ?? null}
        onConfirm={confirmReview}
        onCancel={() => setReviewing(null)}
      />
    </div>
  );
}
