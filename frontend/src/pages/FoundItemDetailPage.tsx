import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { FoundItem } from '@laf/shared';
import { BackButton, ConfirmDialog, DetailGrid, ErrorState, ItemImage, Modal, Spinner, StatusBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { CATEGORY_LABELS, FOUND_STATUS_LABELS, formatDate } from '../lib/format';
import { services } from '../services';

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
    services.foundItems
      .get(id)
      .then(setItem)
      .catch((err) => setError(getErrorMessage(err, 'Error al cargar el objeto')))
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
      await services.claims.create(item.id, message);
      notify('Solicitud de reclamación enviada', 'success');
      setClaimOpen(false);
      setMessage('');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo enviar'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function markReturned() {
    if (!item) return;
    try {
      const updated = await services.foundItems.markReturned(item.id);
      setItem(updated);
      notify('Objeto marcado como devuelto', 'success');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo actualizar'), 'error');
    } finally {
      setConfirmReturn(false);
    }
  }

  // Moderación (solo admin): archivar retira del muro; eliminar borra definitivamente.
  async function archiveItem() {
    if (!item) return;
    try {
      const updated = await services.foundItems.archive(item.id);
      setItem(updated);
      notify('Objeto archivado', 'success');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo archivar'), 'error');
    } finally {
      setConfirmArchive(false);
    }
  }

  async function deleteItem() {
    if (!item) return;
    try {
      await services.foundItems.remove(item.id);
      notify('Objeto eliminado', 'success');
      navigate('/');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo eliminar'), 'error');
      setConfirmDelete(false);
    }
  }

  return (
    <div>
      <BackButton />

      <div className="grid gap-5 md:grid-cols-2 md:gap-8">
        <div className="card overflow-hidden md:sticky md:top-24 md:self-start">
          <ItemImage src={item.imageUrl} alt={item.title} rounded={false} />
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <StatusBadge status={item.status} label={FOUND_STATUS_LABELS[item.status]} />
            <h1 className="page-title break-words">{item.title}</h1>
          </div>

          <DetailGrid
            rows={[
              ['Categoría', CATEGORY_LABELS[item.category]],
              ['Ubicación', item.location],
              ['Encontrado el', formatDate(item.foundAt)],
              ['Publicado por', item.reporter.name],
            ]}
          />

          <div className="card p-4 sm:p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Descripción</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-700 dark:text-slate-300">{item.description}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 dark:border-olo-dark-700">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
            <p className="flex items-center gap-2 rounded-2xl bg-green-50 p-4 text-sm font-medium text-green-700 dark:bg-green-500/10 dark:text-green-300">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="m7 12.5 3.2 3.2L17 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Este objeto ya fue devuelto a su dueño.
            </p>
          )}
        </div>
      </div>

      <Modal open={claimOpen} label="Reclamar objeto" onClose={() => setClaimOpen(false)}>
        <form onSubmit={submitClaim}>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Reclamar «{item.title}»</h3>
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
            maxLength={1000}
          />
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={() => setClaimOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </div>
        </form>
      </Modal>

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
