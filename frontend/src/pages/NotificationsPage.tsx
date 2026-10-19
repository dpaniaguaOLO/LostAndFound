import { useEffect, useState } from 'react';
import type { Notification } from '@laf/shared';
import { EmptyState, ErrorState, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api, ApiRequestError } from '../lib/api';
import { formatDateTime } from '../lib/format';

export function NotificationsPage() {
  const { notify } = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api<Notification[]>('/notifications')
      .then(setItems)
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'Error al cargar notificaciones'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function markOne(id: string) {
    try {
      await api(`/notifications/${id}/read`, { method: 'PATCH' });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {
      /* silencioso */
    }
  }

  async function markAll() {
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      notify('Todas marcadas como leídas', 'success');
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo actualizar', 'error');
    }
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">Notificaciones</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{unread} sin leer</p>
        </div>
        {unread > 0 && (
          <button className="btn-secondary" onClick={markAll}>
            Marcar todas como leídas
          </button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState title="Sin notificaciones" description="Aquí verás avisos sobre tus reclamaciones y objetos." />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read && markOne(n.id)}
              className={
                'card flex flex-col items-start gap-1 p-4 text-left transition ' +
                (n.read
                  ? 'opacity-70'
                  : 'border-olo-200 bg-olo-50/40 dark:border-olo-500/30 dark:bg-olo-500/10')
              }
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-medium text-slate-800 dark:text-slate-100">{n.title}</span>
                {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-olo-600 dark:bg-olo-400" />}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{n.body}</p>
              <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(n.createdAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
