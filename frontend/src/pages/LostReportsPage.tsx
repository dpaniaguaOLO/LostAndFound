import { useEffect, useState } from 'react';
import type { LostReport, Paginated } from '@laf/shared';
import { Filters, type FilterValues } from '../components/Filters';
import { ItemForm, type ItemFormValues } from '../components/ItemForm';
import { LostReportCard } from '../components/ItemCard';
import { EmptyState, ErrorState, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api, ApiRequestError } from '../lib/api';
import { useDebounce } from '../lib/useDebounce';

export function LostReportsPage() {
  const { notify } = useToast();
  const [filters, setFilters] = useState<FilterValues>({ search: '', category: '', location: '' });
  const debouncedSearch = useDebounce(filters.search);
  const debouncedLocation = useDebounce(filters.location);

  const [result, setResult] = useState<Paginated<LostReport> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (filters.category) params.set('category', filters.category);
    if (debouncedLocation) params.set('location', debouncedLocation);

    api<Paginated<LostReport>>(`/lost-reports?${params.toString()}`)
      .then((data) => active && setResult(data))
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiRequestError ? err.message : 'Error al cargar reportes');
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [debouncedSearch, filters.category, debouncedLocation, reloadKey]);

  async function handleSubmit(values: ItemFormValues) {
    const fd = new FormData();
    fd.set('title', values.title);
    fd.set('description', values.description);
    fd.set('category', values.category);
    fd.set('location', values.location);
    fd.set('lostAt', new Date(values.date).toISOString());
    if (values.image) fd.set('image', values.image);
    try {
      await api<LostReport>('/lost-reports', { method: 'POST', formData: fd });
      notify('Reporte de objeto perdido creado', 'success');
      setShowForm(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo crear el reporte', 'error');
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Objetos perdidos</h1>
          <p className="text-sm text-slate-500">
            Reporta lo que perdiste para compararlo con los objetos encontrados.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cerrar formulario' : 'Reportar objeto perdido'}
        </button>
      </div>

      {showForm && (
        <div className="mb-6">
          <ItemForm
            dateLabel="Fecha en que se perdió"
            submitLabel="Reportar objeto perdido"
            onSubmit={handleSubmit}
          />
        </div>
      )}

      <Filters value={filters} onChange={setFilters} />

      {loading ? (
        <Spinner label="Cargando reportes…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !result || result.data.length === 0 ? (
        <EmptyState
          title="Sin reportes de objetos perdidos"
          description="Si perdiste algo, repórtalo para que alguien pueda relacionarlo con un hallazgo."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {result.data.map((item) => (
            <LostReportCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
