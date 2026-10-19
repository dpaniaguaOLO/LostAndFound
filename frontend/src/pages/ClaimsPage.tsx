import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Claim } from '@laf/shared';
import { EmptyState, ErrorState, Spinner, StatusBadge } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api, ApiRequestError } from '../lib/api';
import { CLAIM_STATUS_LABELS, formatDateTime } from '../lib/format';

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
    api<Claim[]>(tab === 'incoming' ? '/claims/incoming' : '/claims/mine')
      .then(setClaims)
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'Error al cargar reclamaciones'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, [tab]);

  async function review(claim: Claim, status: 'APPROVED' | 'REJECTED') {
    try {
      await api<Claim>(`/claims/${claim.id}/review`, { method: 'PATCH', body: { status } });
      notify(status === 'APPROVED' ? 'Reclamación aprobada' : 'Reclamación rechazada', 'success');
      load();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo procesar', 'error');
    }
  }

  async function cancel(claim: Claim) {
    try {
      await api<Claim>(`/claims/${claim.id}/cancel`, { method: 'PATCH' });
      notify('Reclamación cancelada', 'success');
      load();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo cancelar', 'error');
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-800">Reclamaciones</h1>
      <p className="mb-5 text-sm text-slate-500">
        Gestiona las solicitudes de objetos que publicaste y las que tú hiciste.
      </p>

      <div className="mb-6 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === 'incoming' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}
          onClick={() => setTab('incoming')}
        >
          Recibidas
        </button>
        <button
          className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === 'mine' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}
          onClick={() => setTab('mine')}
        >
          Mías
        </button>
      </div>

      {loading ? (
        <Spinner />
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
        <div className="flex flex-col gap-4">
          {claims.map((claim) => (
            <div key={claim.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-800">
                    {claim.foundItem?.title ?? 'Objeto'}
                  </h3>
                  <StatusBadge status={claim.status} label={CLAIM_STATUS_LABELS[claim.status]} />
                </div>
                <p className="mt-1 text-sm text-slate-600">{claim.message}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {tab === 'incoming' ? `De ${claim.claimant.name} · ` : ''}
                  {formatDateTime(claim.createdAt)}
                </p>
                {claim.reviewNote && (
                  <p className="mt-1 text-xs text-slate-500">Nota: {claim.reviewNote}</p>
                )}
              </div>

              <div className="flex gap-2">
                {tab === 'incoming' && claim.status === 'PENDING' && (
                  <>
                    <button className="btn-primary" onClick={() => review(claim, 'APPROVED')}>
                      Aprobar
                    </button>
                    <button className="btn-secondary" onClick={() => review(claim, 'REJECTED')}>
                      Rechazar
                    </button>
                  </>
                )}
                {tab === 'mine' && claim.status === 'PENDING' && (
                  <button className="btn-secondary" onClick={() => cancel(claim)}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
