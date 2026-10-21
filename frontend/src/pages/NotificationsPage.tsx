import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '@laf/shared';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { services } from '../services';

export function NotificationsPage() {
  const { notify } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    services.notifications
      .list()
      .then(setItems)
      .catch((err) => setError(getErrorMessage(err, 'Error al cargar notificaciones')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function markOne(id: string) {
    try {
      await services.notifications.markRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {
      /* silencioso */
    }
  }

  async function markAll() {
    try {
      await services.notifications.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      notify('Todas marcadas como leídas', 'success');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo actualizar'), 'error');
    }
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notificaciones"
        subtitle={loading ? 'Cargando…' : unread === 0 ? 'Estás al día' : `${unread} sin leer`}
        action={
          unread > 0 && (
            <button className="btn-secondary w-full sm:w-auto" onClick={markAll}>
              Marcar todas como leídas
            </button>
          )
        }
      />

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState title="Sin notificaciones" description="Aquí verás avisos sobre tus reclamaciones y objetos." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((n, i) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.read) markOne(n.id);
                // Las notificaciones con objeto relacionado (p. ej. coincidencia) llevan a su detalle.
                if (n.relatedItemId) navigate(`/objetos/${n.relatedItemId}`);
              }}
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
              className={
                'card relative flex animate-fade-up items-start gap-3 p-4 text-left transition duration-200 active:scale-[0.99] ' +
                (n.relatedItemId ? 'hover:border-olo-300 hover:shadow-card-hover dark:hover:border-olo-500/40 ' : '') +
                (n.read ? '' : 'border-olo-200 bg-olo-50/50 dark:border-olo-500/30 dark:bg-olo-500/[0.07]')
              }
            >
              <span
                className={
                  'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' +
                  (n.read
                    ? 'bg-slate-100 text-slate-400 dark:bg-olo-dark-850 dark:text-slate-500'
                    : 'bg-olo-100 text-olo-700 dark:bg-olo-500/15 dark:text-olo-300')
                }
                aria-hidden
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 4a5.5 5.5 0 0 0-5.5 5.5v3L5 15.5h14L17.5 12.5v-3A5.5 5.5 0 0 0 12 4Zm-2.5 14a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className={'text-sm ' + (n.read ? 'font-medium text-slate-600 dark:text-slate-300' : 'font-bold text-slate-900 dark:text-slate-50')}>
                    {n.title}
                  </span>
                  {!n.read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-olo-500 ring-4 ring-olo-500/15" aria-label="Sin leer" />}
                </span>
                <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-400">{n.body}</span>
                <span className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(n.createdAt)}</span>
                  {n.relatedItemId && (
                    <span className="text-xs font-semibold text-olo-700 dark:text-olo-400">Ver objeto →</span>
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
