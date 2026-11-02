import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { FoundItem, LostReport } from '@laf/shared';
import { useSupabase } from '../lib/config';
import {
  BackButton,
  ConfirmDialog,
  DetailGrid,
  ErrorState,
  MobileActionBar,
  Modal,
  Notice,
  Spinner,
  StatusBadge,
  UnavailableState,
  ZoomableImage,
} from '../components/ui';
import { PlayerName } from '../components/game';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage, isNotAvailable } from '../lib/errors';
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
  const [gone, setGone] = useState(false); // eliminado o retirado: no tiene sentido reintentar

  const [searchParams] = useSearchParams();
  const [claimOpen, setClaimOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [claimSent, setClaimSent] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  // Reporte de perdido propio al que corresponde el objeto (viene de ?perdido= al
  // llegar desde una coincidencia). Al entregarlo, ese reporte se marca resuelto.
  const [myLost, setMyLost] = useState<LostReport[]>([]);
  const [lostReportId, setLostReportId] = useState(searchParams.get('perdido') ?? '');
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
      .catch((err) => {
        setGone(isNotAvailable(err));
        setError(getErrorMessage(err, 'Error al cargar el objeto'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  // ¿Ya tengo una solicitud pendiente sobre este objeto? Así no se ofrece
  // "Reclamar" otra vez al volver a la página (el servidor lo rechazaría, UX-06).
  useEffect(() => {
    if (!id) return;
    let active = true;
    services.claims
      .mine()
      .then((list) => active && setClaimSent(list.some((c) => c.foundItemId === id && c.status === 'PENDING')))
      .catch(() => undefined); // si falla, se mantiene el comportamiento anterior
    return () => {
      active = false;
    };
  }, [id]);

  // Al abrir el formulario de reclamación: mis reportes de perdido abiertos, para
  // enlazar la reclamación (solo Supabase guarda el enlace).
  useEffect(() => {
    if (!claimOpen || !useSupabase) return;
    services.lostReports
      .mine()
      .then((list) => setMyLost(list.filter((r) => r.status === 'OPEN' || r.status === 'MATCHED')))
      .catch(() => setMyLost([]));
  }, [claimOpen]);

  if (loading) return <Spinner />;
  if (error && gone) return <UnavailableState message={error} />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!item) return null;

  const isOwner = user?.id === item.reporter.id;
  // Solo PUBLISHED: si ya hay una reclamación aprobada (CLAIMED) no se puede aprobar otra.
  const canClaim = !isOwner && item.status === 'PUBLISHED' && !claimSent;
  const canMarkReturned = (isOwner || isAdmin) && item.status !== 'RETURNED' && item.status !== 'ARCHIVED';
  // El autor borra lo suyo salvo con una entrega en curso (CLAIMED) o moderado (ARCHIVED).
  // Un admin ya tiene "Eliminar" en el bloque de administración.
  const canOwnerDelete = isOwner && !isAdmin && (item.status === 'PUBLISHED' || item.status === 'RETURNED');
  // Una sola acción principal por pantalla: reclamar, o entregar si ya hay una aprobada.
  const mobilePrimary: 'claim' | 'return' | null = canClaim
    ? 'claim'
    : canMarkReturned && item.status === 'CLAIMED'
      ? 'return'
      : null;

  async function submitClaim(e: FormEvent) {
    e.preventDefault();
    if (!item) return;
    setSubmitting(true);
    setClaimError(null);
    try {
      await services.claims.create(item.id, message, lostReportId || null);
      notify('Solicitud enviada. Te avisaremos cuando la revisen.', 'success');
      setClaimOpen(false);
      setMessage('');
      setClaimSent(true);
    } catch (err) {
      // Error persistente junto al formulario (WCAG 3.3.1); el toast desaparece solo.
      setClaimError(getErrorMessage(err, 'No se pudo enviar'));
    } finally {
      setSubmitting(false);
    }
  }

  async function markReturned() {
    if (!item) return;
    try {
      const updated = await services.foundItems.markReturned(item.id);
      setItem(updated);
      notify('Entrega registrada. Avisamos a quien lo reclamó.', 'success');
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
      navigate(isOwner && !isAdmin ? '/mis-objetos' : '/');
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
          <ZoomableImage src={item.imageUrl} alt={item.title} />
        </div>

        <div className="flex flex-col gap-5">
          {/* items-start: la insignia de estado ocupa solo su ancho (no una barra). */}
          <div className="flex flex-col items-start gap-2">
            <StatusBadge status={item.status} label={FOUND_STATUS_LABELS[item.status]} />
            <h1 className="page-title w-full break-words">{item.title}</h1>
          </div>

          <DetailGrid
            rows={[
              ['Categoría', CATEGORY_LABELS[item.category]],
              ['Ubicación', item.location],
              ['Encontrado el', formatDate(item.foundAt)],
              ...(item.status === 'RETURNED' && item.returnedAt
                ? ([['Devuelto el', formatDate(item.returnedAt)]] as [string, string][])
                : []),
              ['Publicado por', <PlayerName id={item.reporter.id} name={item.reporter.name} />],
            ]}
          />

          <div className="card p-4 sm:p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Descripción</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-700 dark:text-slate-300">{item.description}</p>
          </div>

          {/* Estado de la reclamación / entrega */}
          {claimSent && (
            <Notice tone="info">
              Enviaste una solicitud para este objeto. Puedes seguirla en{' '}
              <Link to="/reclamaciones" className="font-semibold underline">Reclamaciones</Link>.
            </Notice>
          )}
          {item.status === 'CLAIMED' && (
            <Notice tone="warn">
              {isOwner
                ? 'Aprobaste una reclamación. Cuando entregues el objeto, márcalo como devuelto.'
                : 'Este objeto ya tiene una reclamación aprobada y está pendiente de entrega.'}
            </Notice>
          )}

          {/* En móvil la acción principal va en la barra fija inferior (MobileActionBar). */}
          {mobilePrimary && (
            <MobileActionBar>
              {mobilePrimary === 'claim' ? (
                <button className="btn-primary" onClick={() => setClaimOpen(true)}>
                  Reclamar este objeto
                </button>
              ) : (
                <button className="btn-primary" onClick={() => setConfirmReturn(true)}>
                  Marcar como devuelto
                </button>
              )}
            </MobileActionBar>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {canClaim && (
              <button className="btn-primary hidden lg:inline-flex" onClick={() => setClaimOpen(true)}>
                Reclamar este objeto
              </button>
            )}
            {canMarkReturned && (
              <button
                className={
                  (item.status === 'CLAIMED' ? 'btn-primary' : 'btn-secondary') +
                  (mobilePrimary === 'return' ? ' hidden lg:inline-flex' : '')
                }
                onClick={() => setConfirmReturn(true)}
              >
                Marcar como devuelto
              </button>
            )}
            {isOwner && (
              <Link to="/reclamaciones" className="btn-secondary">
                Ver reclamaciones recibidas
              </Link>
            )}
            {(isOwner || isAdmin) && (item.status === 'PUBLISHED' || item.status === 'CLAIMED') && (
              <Link to={`/objetos/${item.id}/editar`} className="btn-secondary">
                Editar
              </Link>
            )}
            {canOwnerDelete && (
              <button className="btn-danger-soft" onClick={() => setConfirmDelete(true)}>
                Eliminar publicación
              </button>
            )}
          </div>

          {/* Acciones de moderación (solo administradores) */}
          {isAdmin && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 dark:border-olo-dark-700">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Administración
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {item.status !== 'ARCHIVED' && (
                  <button className="btn-secondary" onClick={() => setConfirmArchive(true)}>
                    Archivar
                  </button>
                )}
                <button className="btn-danger-soft" onClick={() => setConfirmDelete(true)}>
                  Eliminar
                </button>
              </div>
            </div>
          )}

          {item.status === 'RETURNED' && <Notice tone="success">Este objeto ya fue devuelto a su dueño.</Notice>}
        </div>
      </div>

      <Modal open={claimOpen} label="Reclamar objeto" onClose={() => setClaimOpen(false)}>
        <form onSubmit={submitClaim}>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Reclamar «{item.title}»</h3>
          <p id="claim-help" className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Describe por qué este objeto es tuyo: menciona algún detalle que solo el dueño conocería.
          </p>
          <label className="label mt-4" htmlFor="claim-message">
            Mensaje para quien lo encontró
          </label>
          <textarea
            id="claim-message"
            className="input min-h-28"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ej. Es mi cartera café con mi credencial dentro…"
            required
            minLength={2}
            maxLength={1000}
            aria-describedby={claimError ? 'claim-help claim-error' : 'claim-help'}
            aria-invalid={claimError ? true : undefined}
          />
          {claimError && (
            <p id="claim-error" role="alert" className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">
              {claimError}
            </p>
          )}
          {myLost.length > 0 && (
            <div className="mt-4">
              <label className="label" htmlFor="claim-lost">
                ¿Corresponde a un objeto que reportaste como perdido?
              </label>
              <select
                id="claim-lost"
                className="input"
                value={lostReportId}
                onChange={(e) => setLostReportId(e.target.value)}
              >
                <option value="">No / no lo reporté</option>
                {myLost.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} · {formatDate(r.lostAt)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Si lo eliges, tu reporte se marcará como resuelto cuando te lo entreguen.
              </p>
            </div>
          )}
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
        message="¿Confirmas que ya entregaste el objeto a su dueño? Le avisaremos, y las demás reclamaciones pendientes se cerrarán. Quedará registrado en el historial."
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
        title={isOwner && !isAdmin ? 'Eliminar publicación' : 'Eliminar objeto'}
        message={
          isOwner && !isAdmin
            ? 'Tu publicación se borrará junto con sus reclamaciones; avisaremos a quien tuviera una en curso. No se puede deshacer.'
            : 'Esta acción es permanente y borra el objeto y sus reclamaciones. No se puede deshacer.'
        }
        confirmLabel="Eliminar definitivamente"
        danger
        onConfirm={deleteItem}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
