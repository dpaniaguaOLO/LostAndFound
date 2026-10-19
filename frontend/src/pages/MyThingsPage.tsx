import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FoundItem, LostReport } from '@laf/shared';
import { FoundItemCard, LostReportCard } from '../components/ItemCard';
import { EmptyState, ErrorState, Spinner } from '../components/ui';
import { api, ApiRequestError } from '../lib/api';

type Tab = 'found' | 'lost';

export function MyThingsPage() {
  const [tab, setTab] = useState<Tab>('found');
  const [found, setFound] = useState<FoundItem[]>([]);
  const [lost, setLost] = useState<LostReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      api<FoundItem[]>('/found-items/mine/list'),
      api<LostReport[]>('/lost-reports/mine/list'),
    ])
      .then(([f, l]) => {
        setFound(f);
        setLost(l);
      })
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'Error al cargar tus publicaciones'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const items = tab === 'found' ? found : lost;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">Mis cosas</h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Tus objetos publicados y tus reportes de objetos perdidos.
      </p>

      <div className="mb-6 inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-olo-dark-800 dark:bg-olo-dark-900">
        <button
          className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === 'found' ? 'bg-olo-600 text-white dark:bg-olo-500 dark:text-slate-950' : 'text-slate-600 dark:text-slate-300'}`}
          onClick={() => setTab('found')}
        >
          Encontrados ({found.length})
        </button>
        <button
          className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === 'lost' ? 'bg-olo-600 text-white dark:bg-olo-500 dark:text-slate-950' : 'text-slate-600 dark:text-slate-300'}`}
          onClick={() => setTab('lost')}
        >
          Perdidos ({lost.length})
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          title={tab === 'found' ? 'No has publicado objetos' : 'No has reportado objetos perdidos'}
          action={
            <Link to={tab === 'found' ? '/publicar' : '/perdidos'} className="btn-primary">
              {tab === 'found' ? 'Publicar objeto' : 'Reportar objeto perdido'}
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tab === 'found'
            ? found.map((i) => <FoundItemCard key={i.id} item={i} />)
            : lost.map((i) => <LostReportCard key={i.id} item={i} />)}
        </div>
      )}
    </div>
  );
}
