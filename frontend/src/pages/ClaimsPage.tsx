import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Claim } from '@laf/shared';
import { ClaimReviewDialog } from '../components/ClaimReviewDialog';
import { PlayerName } from '../components/game';
import { ConfirmDialog, EmptyState, ErrorState, ListSkeleton, Notice, PageHeader, StatusBadge, TabPanel, Tabs } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { CLAIM_STATUS_LABELS, formatDateTime } from '../lib/format';
import { services } from '../services';

type Tab = 'incoming' | 'mine';

/** Acción pendiente de confirmar en el diálogo simple (entregar / cancelar). */
type Pending = { kind: 'return' | 'cancel'; claim: Claim } | null;

export function ClaimsPage() {
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>('incoming');
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Reclamación con una petición en curso: evita dobles envíos (el segundo fallaba
  // con "ya fue procesada").
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  // Aprobar / rechazar (con motivo opcional) se confirma en ClaimReviewDialog.
  const [reviewing, setReviewing] = useState<{ claim: Claim; decision: 'APPROVED' | 'REJECTED' } | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const request = tab === 'incoming' ? services.claims.incoming() : services.claims.mine();
    request
      .then(setClaims)
      .catch((err) => setError(getErrorMessage(err, 'Error al cargar reclamaciones')))
      .finally(() => setLoading(false));
  }

  useEffect(load, [tab]);

  async function run(claim: Claim, action: () => Promise<unknown>, ok: string, fail: string) {
    setBusyId(claim.id);
    try {
      await action();
      notify(ok, 'success');
      load();
    } catch (err) {
      notify(getErrorMessage(err, fail), 'error');
      load(); // el estado pudo cambiar en otro dispositivo: refrescar
    } finally {
      setBusyId(null);
    }
  }

  const markReturned = (c: Claim) =>
    run(c, () => services.foundItems.markReturned(c.foundItemId), 'Entrega registrada. Avisamos al dueño.', 'No se pudo registrar la entrega');
  const cancel = (c: Claim) =>
    run(c, () => services.claims.cancel(c.id), 'Reclamación cancelada', 'No se pudo cancelar');

  async function confirmReview(note: string) {
    if (!reviewing) return;
    const { claim, decision } = reviewing;
    setReviewing(null);
    await run(
      claim,
      () => services.claims.review(claim.id, decision, note || undefined),
      decision === 'APPROVED' ? 'Reclamación aprobada. Coordina la entrega.' : 'Reclamación rechazada',
      decision === 'APPROVED' ? 'No se pudo aprobar' : 'No se pudo rechazar',
    );
  }

  function onConfirm() {
    if (!confirm) return;
    const { kind, claim } = confirm;
    setConfirm(null);
    void (kind === 'return' ? markReturned(claim) : cancel(claim));
  }

  return (
    <div>
      <PageHeader title="Reclamaciones" subtitle="Gestiona las solicitudes de objetos que publicaste y las que tú hiciste." />

      <Tabs<Tab>
        id="claims"
        label="Reclamaciones"
        tabs={[
          { key: 'incoming', label: 'Recibidas' },
          { key: 'mine', label: 'Mías' },
        ]}
        value={tab}
        onChange={(t) => {
          setClaims([]); // no mostrar las de la otra pestaña (con sus botones) mientras carga
          setTab(t);
        }}
      />

      <TabPanel id="claims" active={tab}>
      {loading && claims.length === 0 ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : claims.length === 0 ? (
        <EmptyState
          title={tab === 'incoming' ? 'Sin reclamaciones recibidas' : 'No has reclamado objetos'}
          description={
            tab === 'incoming'
              ? 'Cuando alguien reclame un objeto que publicaste, aparecerá aquí.'
              : 'Explora el muro y reclama un objeto que sea tuyo.'
          }
          action={
            tab === 'mine' ? (
              <Link to="/" className="btn-primary">
                Ir al muro
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3 sm:gap-4">
          {claims.map((claim, i) => {
            const itemStatus = claim.foundItem?.status;
            const busy = busyId === claim.id;
            const incoming = tab === 'incoming';
            return (
              <article
                key={claim.id}
                className="card flex animate-fade-up flex-col gap-4 p-4 sm:p-5"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className="flex gap-3">
                  {claim.foundItem && (
                    <Link to={`/objetos/${claim.foundItem.id}`} className="shrink-0" tabIndex={-1} aria-hidden>
                      {claim.foundItem.imageUrl ? (
                        <img src={claim.foundItem.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-slate-300 dark:bg-olo-dark-850 dark:text-slate-600">
                          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                            <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Zm0 0 8 4.5m0 0 8-4.5M12 13v7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </Link>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {claim.foundItem ? (
                        <Link
                          to={`/objetos/${claim.foundItem.id}`}
                          className="font-semibold text-slate-900 hover:text-olo-700 dark:text-slate-100 dark:hover:text-olo-300"
                        >
                          {claim.foundItem.title}
                        </Link>
                      ) : (
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Objeto</h3>
                      )}
                      <StatusBadge status={claim.status} label={CLAIM_STATUS_LABELS[claim.status]} />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {incoming ? (
                        <>
                          <PlayerName id={claim.claimant.id} name={claim.claimant.name} />·
                        </>
                      ) : claim.foundItem?.reporterName ? (
                        <>
                          Encontrado por <PlayerName id={claim.foundItem.reporterId} name={claim.foundItem.reporterName} />·
                        </>
                      ) : null}
                      {formatDateTime(claim.createdAt)}
                    </p>
                  </div>
                </div>

                <blockquote className="rounded-xl border-l-4 border-olo-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-olo-500/40 dark:bg-olo-dark-850 dark:text-slate-300">
                  {claim.message}
                </blockquote>
                {claim.reviewNote && (
                  <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">Nota: {claim.reviewNote}</p>
                )}

                {/* Siguiente paso según el estado de la reclamación y del objeto */}
                {claim.status === 'APPROVED' && itemStatus === 'CLAIMED' && (
                  <Notice tone="warn">
                    {incoming
                      ? `Coordina la entrega con ${claim.claimant.name || 'el reclamante'} y márcala cuando se la des.`
                      : `¡Aprobada! Coordina la entrega con ${claim.foundItem?.reporterName || 'quien lo encontró'}.`}
                  </Notice>
                )}
                {claim.status === 'APPROVED' && itemStatus === 'RETURNED' && (
                  <Notice tone="success">{incoming ? 'Objeto entregado.' : 'Ya recuperaste este objeto.'}</Notice>
                )}
                {incoming && claim.status === 'PENDING' && itemStatus !== 'PUBLISHED' && (
                  <Notice tone="info">Este objeto ya no está disponible para aprobar reclamaciones.</Notice>
                )}

                {/* Acciones */}
                {incoming && claim.status === 'PENDING' && (
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                    <button className="btn-secondary" disabled={busy} onClick={() => setReviewing({ claim, decision: 'REJECTED' })}>
                      Rechazar
                    </button>
                    <button
                      className="btn-primary"
                      disabled={busy || itemStatus !== 'PUBLISHED'}
                      onClick={() => setReviewing({ claim, decision: 'APPROVED' })}
                    >
                      Aprobar
                    </button>
                  </div>
                )}
                {incoming && claim.status === 'APPROVED' && itemStatus === 'CLAIMED' && (
                  <div className="flex sm:justify-end">
                    <button className="btn-primary w-full sm:w-auto" disabled={busy} onClick={() => setConfirm({ kind: 'return', claim })}>
                      Marcar como entregado
                    </button>
                  </div>
                )}
                {!incoming && claim.status === 'PENDING' && (
                  <div className="flex sm:justify-end">
                    <button className="btn-secondary w-full sm:w-auto" disabled={busy} onClick={() => setConfirm({ kind: 'cancel', claim })}>
                      Cancelar solicitud
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      </TabPanel>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === 'cancel' ? 'Cancelar solicitud' : 'Registrar entrega'}
        message={
          confirm?.kind === 'cancel'
            ? 'Tu solicitud de reclamación se retirará. Podrás enviar otra más adelante si el objeto sigue disponible.'
            : '¿Ya entregaste el objeto a su dueño? Le avisaremos y quedará registrado en el historial.'
        }
        confirmLabel={confirm?.kind === 'cancel' ? 'Sí, cancelar' : 'Sí, ya lo entregué'}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
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
