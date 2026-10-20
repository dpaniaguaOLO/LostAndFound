import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { LostReport } from '@laf/shared';
import { MatchSuggestions } from '../components/MatchSuggestions';
import { ErrorState, ItemImage, Spinner, StatusBadge } from '../components/ui';
import { getErrorMessage } from '../lib/errors';
import { CATEGORY_LABELS, LOST_STATUS_LABELS, formatDate } from '../lib/format';
import { services } from '../services';

/**
 * Detalle de un objeto perdido con sus posibles coincidencias (IA) mostradas
 * de forma prominente para que el dueño las revise.
 */
export function LostReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<LostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    services.lostReports
      .get(id)
      .then(setItem)
      .catch((err) => setError(getErrorMessage(err, 'Error al cargar el reporte')))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!item) return null;

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
            <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">
              {item.title}
            </h1>
            <StatusBadge status={item.status} label={LOST_STATUS_LABELS[item.status]} />
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Categoría</dt>
              <dd className="font-medium dark:text-slate-200">{CATEGORY_LABELS[item.category]}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Ubicación</dt>
              <dd className="font-medium dark:text-slate-200">{item.location || 'No indicada'}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Perdido el</dt>
              <dd className="font-medium dark:text-slate-200">{formatDate(item.lostAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Reportado por</dt>
              <dd className="font-medium dark:text-slate-200">{item.reporter.name}</dd>
            </div>
          </dl>

          <div>
            <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">Descripción</h2>
            <p className="mt-1 whitespace-pre-line text-slate-700 dark:text-slate-300">{item.description}</p>
          </div>
        </div>
      </div>

      {/* Coincidencias de la IA, destacadas */}
      <div className="card mt-6 overflow-hidden">
        <div className="px-4 pt-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Coincidencias sugeridas por la IA
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Objetos encontrados que podrían ser este, comparados por imagen, descripción,
            categoría, ubicación y fecha.
          </p>
        </div>
        <MatchSuggestions lostReportId={item.id} defaultOpen />
      </div>
    </div>
  );
}
