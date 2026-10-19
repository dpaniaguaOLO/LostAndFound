import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Claim, FoundItem } from '@laf/shared';
import { ConfirmDialog, ErrorState, ItemImage, Spinner, StatusBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiRequestError } from '../lib/api';
import { CATEGORY_LABELS, FOUND_STATUS_LABELS, formatDate } from '../lib/format';

export function FoundItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [item, setItem] = useState<FoundItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [claimOpen, setClaimOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    api<FoundItem>(`/found-items/${id}`)
      .then(setItem)
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'Error al cargar el objeto'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!item) return null;

  const isOwner = user?.id === item.reporter.id;
  const canClaim = !isOwner && (item.status === 'PUBLISHED' || item.status === 'CLAIMED');
  const canMarkReturned = (isOwner || isAdmin) && item.status !== 'RETURNED' && item.status !== 'ARCHIVED';

  async function submitClaim(e: FormEvent) {
    e.preventDefault();
    if (!item) return;
    setSubmitting(true);
    try {
      await api<Claim>('/claims', {
        method: 'POST',
        body: { foundItemId: item.id, message },
      });
      notify('Solicitud de reclamación enviada', 'success');
      setClaimOpen(false);
      setMessage('');
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo enviar', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function markReturned() {
    if (!item) return;
    try {
      const updated = await api<FoundItem>(`/found-items/${item.id}/return`, { method: 'PATCH' });
      setItem(updated);
      notify('Objeto marcado como devuelto', 'success');
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo actualizar', 'error');
    } finally {
      setConfirmReturn(false);
    }
  }

  // Moderación (solo admin): archivar retira del muro; eliminar borra definitivamente.
  async function archiveItem() {
    if (!item) return;
    try {
      const updated = await api<FoundItem>(`/found-items/${item.id}/archive`, { method: 'PATCH' });
      setItem(updated);
      notify('Objeto archivado', 'success');
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo archivar', 'error');
    } finally {
      setConfirmArchive(false);
    }
  }

  async function deleteItem() {
    if (!item) return;
    try {
      await api(`/found-items/${item.id}`, { method: 'DELETE' });
      notify('Objeto eliminado', 'success');
      navigate('/');
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo eliminar', 'error');
      setConfirmDelete(false);
    }
  }

  return (
    <div>
      <button
        className="mb-4 text-sm text-olo-700 hover:underline dark:text-olo-400"
        onClick={() => navigate(-1)}
      >
        ← Volver
      </button>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card overflow-hidden">
          <ItemImage src={item.imageUrl} alt={item.title} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">{item.title}</h1>
            <StatusBadge status={item.status} label={FOUND_STATUS_LABELS[item.status]} />
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Categoría</dt>
              <dd className="font-medium dark:text-slate-200">{CATEGORY_LABELS[item.category]}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Ubicación</dt>
              <dd className="font-medium dark:text-slate-200">{item.location}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Encontrado el</dt>
              <dd className="font-medium dark:text-slate-200">{formatDate(item.foundAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Publicado por</dt>
              <dd className="font-medium dark:text-slate-200">{item.reporter.name}</dd>
            </div>
          </dl>

          <div>
            <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">Descripción</h2>
            <p className="mt-1 whitespace-pre-line text-slate-700 dark:text-slate-300">{item.description}</p>
          </div>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {canClaim && (
              <button className="btn-primary" onClick={() => setClaimOpen(true)}>
                Reclamar este objeto
              </button>
            )}
            {canMarkReturned && (
              <button className="btn-secondary" onClick={() => setConfirmReturn(true)}>
                Marcar como devuelto
              </button>
            )}
            {isOwner && (
              <Link to="/reclamaciones" className="btn-secondary">
                Ver reclamaciones recibidas
              </Link>
            )}
          </div>

          {/* Acciones de moderación (solo administradores) */}
          {isAdmin && (
            <div className="mt-1 rounded-lg border border-slate-200 p-3 dark:border-olo-dark-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Administración
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {item.status !== 'ARCHIVED' && (
                  <button className="btn-secondary" onClick={() => setConfirmArchive(true)}>
                    Archivar
                  </button>
                )}
                <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
                  Eliminar
                </button>
              </div>
            </div>
          )}

          {item.status === 'RETURNED' && (
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-300">
              Este objeto ya fue devuelto a su dueño.
            </p>
          )}
        </div>
      </div>

      {claimOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Reclamar objeto"
        >
          <form onSubmit={submitClaim} className="card w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Reclamar "{item.title}"</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Describe por qué este objeto es tuyo para ayudar a verificar la devolución.
            </p>
            <textarea
              className="input mt-4 min-h-28"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ej. Es mi cartera café con mi credencial dentro…"
              required
              minLength={2}
            />
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={() => setClaimOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={confirmReturn}
        title="Marcar como devuelto"
        message="¿Confirmas que este objeto ya fue entregado a su dueño? Quedará registrado en el historial."
        confirmLabel="Sí, marcar devuelto"
        onConfirm={markReturned}
        onCancel={() => setConfirmReturn(false)}
      />

      <ConfirmDialog
        open={confirmArchive}
        title="Archivar objeto"
        message="El objeto se retirará del muro pero quedará registrado. Es una acción reversible."
        confirmLabel="Archivar"
        onConfirm={archiveItem}
        onCancel={() => setConfirmArchive(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar objeto"
        message="Esta acción es permanente y borra el objeto y sus reclamaciones. No se puede deshacer."
        confirmLabel="Eliminar definitivamente"
        danger
        onConfirm={deleteItem}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
