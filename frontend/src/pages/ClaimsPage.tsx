import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Claim } from '@laf/shared';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StatusBadge, Tabs } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { CLAIM_STATUS_LABELS, formatDateTime } from '../lib/format';
import { services } from '../services';

type Tab = 'incoming' | 'mine';

export function ClaimsPage() {
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>('incoming');
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  async function review(claim: Claim, status: 'APPROVED' | 'REJECTED') {
    try {
      await services.claims.review(claim.id, status);
      notify(status === 'APPROVED' ? 'Reclamación aprobada' : 'Reclamación rechazada', 'success');
      load();
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo procesar'), 'error');
    }
  }

  async function cancel(claim: Claim) {
    try {
      await services.claims.cancel(claim.id);
      notify('Reclamación cancelada', 'success');
      load();
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo cancelar'), 'error');
    }
  }

  return (
    <div>
      <PageHeader title="Reclamaciones" subtitle="Gestiona las solicitudes de objetos que publicaste y las que tú hiciste." />

      <Tabs<Tab>
        tabs={[
          { key: 'incoming', label: 'Recibidas' },
          { key: 'mine', label: 'Mías' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading ? (
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
          {claims.map((claim, i) => (
            <article
              key={claim.id}
              className="card flex animate-fade-up flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
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
                <blockquote className="mt-2 rounded-xl border-l-4 border-olo-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-olo-500/40 dark:bg-olo-dark-850 dark:text-slate-300">
                  {claim.message}
                </blockquote>
                <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400 dark:text-slate-500">
                  {tab === 'incoming' && (
                    <>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{claim.claimant.name}</span>·
                    </>
                  )}
                  {formatDateTime(claim.createdAt)}
                </p>
                {claim.reviewNote && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Nota: {claim.reviewNote}</p>
                )}
              </div>

              {claim.status === 'PENDING' && (
                <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                  {tab === 'incoming' ? (
                    <>
                      <button className="btn-secondary" onClick={() => review(claim, 'REJECTED')}>
                        Rechazar
                      </button>
                      <button className="btn-primary" onClick={() => review(claim, 'APPROVED')}>
                        Aprobar
                      </button>
                    </>
                  ) : (
                    <button className="btn-secondary col-span-2" onClick={() => cancel(claim)}>
                      Cancelar solicitud
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
