import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { LostReport } from '@laf/shared';
import { MatchSuggestions } from '../components/MatchSuggestions';
import {
  BackButton,
  ConfirmDialog,
  DetailGrid,
  ErrorState,
  MobileActionBar,
  Notice,
  Spinner,
  StatusBadge,
  UnavailableState,
  ZoomableImage,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage, isNotAvailable } from '../lib/errors';
import { CATEGORY_LABELS, LOST_STATUS_LABELS, formatDate } from '../lib/format';
import { services } from '../services';

/**
 * Detalle de un objeto perdido con sus posibles coincidencias (IA) mostradas
 * de forma prominente para que el dueño las revise.
 */
export function LostReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [item, setItem] = useState<LostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false); // eliminado o cerrado: no tiene sentido reintentar
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    services.lostReports
      .get(id)
      .then(setItem)
      .catch((err) => {
        setGone(isNotAvailable(err));
        setError(getErrorMessage(err, 'Error al cargar el reporte'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function closeReport() {
    if (!item) return;
    try {
      const updated = await services.lostReports.close(item.id);
      setItem(updated);
      notify('Reporte archivado (cerrado)', 'success');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo archivar'), 'error');
    } finally {
      setConfirmClose(false);
    }
  }

  async function resolveReport() {
    if (!item) return;
    try {
      const updated = await services.lostReports.resolve(item.id);
      setItem(updated);
      notify('¡Qué bien! Marcamos tu reporte como resuelto.', 'success');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo actualizar'), 'error');
    } finally {
      setConfirmResolve(false);
    }
  }

  async function deleteReport() {
    if (!item) return;
    try {
      await services.lostReports.remove(item.id);
      notify('Reporte eliminado', 'success');
      navigate('/');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo eliminar'), 'error');
      setConfirmDelete(false);
    }
  }

  if (loading) return <Spinner />;
  if (error && gone) return <UnavailableState message={error} />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!item) return null;

  const isOwner = user?.id === item.reporter.id;
  const isActive = item.status === 'OPEN' || item.status === 'MATCHED';

  return (
    <div>
      <BackButton />

      <div className="grid gap-5 md:grid-cols-2 md:gap-8">
        <div className="card overflow-hidden md:sticky md:top-24 md:self-start">
          <ZoomableImage src={item.imageUrl} alt={item.title} />
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <StatusBadge status={item.status} label={LOST_STATUS_LABELS[item.status]} />
            <h1 className="page-title break-words">{item.title}</h1>
          </div>

          <DetailGrid
            rows={[
              ['Categoría', CATEGORY_LABELS[item.category]],
              ['Ubicación', item.location || 'No indicada'],
              ['Perdido el', formatDate(item.lostAt)],
              ['Reportado por', item.reporter.name],
            ]}
          />

          <div className="card p-4 sm:p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Descripción</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-700 dark:text-slate-300">{item.description}</p>
          </div>

          {item.status === 'MATCHED' && (
            <Notice tone="warn">
              {isOwner
                ? 'Tu reclamación fue aprobada: coordina la entrega con quien lo encontró.'
                : 'Ya hay una reclamación aprobada para este objeto.'}
            </Notice>
          )}
          {item.status === 'RESOLVED' && (
            <Notice tone="success">{isOwner ? '¡Recuperaste este objeto!' : 'Su dueño ya lo recuperó.'}</Notice>
          )}
          {!isOwner && isActive && (
            <Notice tone="info">
              ¿Lo encontraste? Publícalo desde{' '}
              <Link to="/publicar" className="font-semibold underline">Publicar → Encontré un objeto</Link>{' '}
              y la app avisará a su dueño.
            </Notice>
          )}

          {(isOwner || isAdmin) && isActive && (
            <div className="flex flex-col gap-3 sm:flex-row">
              {isOwner && (
                <>
                  <button className="btn-primary hidden md:inline-flex" onClick={() => setConfirmResolve(true)}>
                    Ya lo recuperé
                  </button>
                  <MobileActionBar>
                    <button className="btn-primary" onClick={() => setConfirmResolve(true)}>
                      Ya lo recuperé
                    </button>
                  </MobileActionBar>
                </>
              )}
              <Link to={`/perdidos/${item.id}/editar`} className="btn-secondary">
                Editar
              </Link>
            </div>
          )}

          {/* Acciones de moderación (solo administradores) */}
          {isAdmin && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 dark:border-olo-dark-700">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Administración
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {item.status !== 'CLOSED' && (
                  <button className="btn-secondary" onClick={() => setConfirmClose(true)}>
                    Archivar
                  </button>
                )}
                <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
                  Eliminar reporte
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Coincidencias de la IA, destacadas (solo el dueño o un admin pueden verlas) */}
      {(isOwner || isAdmin) && isActive && (
      <div className="card mt-6 overflow-hidden sm:mt-8">
        <div className="border-b border-slate-100 bg-gradient-to-r from-olo-50/80 to-transparent px-4 py-4 dark:border-olo-dark-800 dark:from-olo-500/10 sm:px-5">
          <h2 className="section-title flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="text-olo-600 dark:text-olo-400">
              <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" fill="currentColor" />
            </svg>
            Coincidencias sugeridas por la IA
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Objetos encontrados que podrían ser este, comparados por descripción, categoría,
            ubicación y fecha. El porcentaje es una estimación orientativa, no una prueba:
            confírmalo viendo el objeto antes de reclamarlo.
          </p>
        </div>
        <MatchSuggestions lostReportId={item.id} defaultOpen />
      </div>
      )}

      <ConfirmDialog
        open={confirmResolve}
        title="Marcar como recuperado"
        message="Tu reporte se cerrará y dejará de aparecer en las búsquedas. ¿Ya tienes tu objeto?"
        confirmLabel="Sí, ya lo tengo"
        onConfirm={resolveReport}
        onCancel={() => setConfirmResolve(false)}
      />

      <ConfirmDialog
        open={confirmClose}
        title="Archivar reporte perdido"
        message="El reporte se cerrará y se retirará de las búsquedas activas, pero quedará registrado. Se puede restaurar desde el panel de administración (Archivados)."
        confirmLabel="Archivar"
        onConfirm={closeReport}
        onCancel={() => setConfirmClose(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar reporte perdido"
        message="Esta acción es permanente y borra el reporte. No se puede deshacer."
        confirmLabel="Eliminar definitivamente"
        danger
        onConfirm={deleteReport}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
