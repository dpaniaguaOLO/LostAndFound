import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { FoundItem, LostReport } from '@laf/shared';
import { FOUND_HINT, ItemForm, itemFormData, LOST_HINT, type ItemFormInitial, type ItemFormValues } from '../components/ItemForm';
import { BackButton, ErrorState, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { localDateString } from '../lib/format';
import { services } from '../services';

/**
 * Edición de una publicación (objeto encontrado o reporte de perdido) por su
 * autor o un admin. La autorización real la imponen el servidor/RLS; aquí solo
 * se evita mostrar el formulario a quien no puede usarlo.
 */
export function EditItemPage({ kind }: { kind: 'found' | 'lost' }) {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [item, setItem] = useState<FoundItem | LostReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detailPath = `/${kind === 'found' ? 'objetos' : 'perdidos'}/${id}`;

  function load() {
    if (!id) return;
    setError(null);
    const req = kind === 'found' ? services.foundItems.get(id) : services.lostReports.get(id);
    req.then(setItem).catch((err) => setError(getErrorMessage(err, 'No se pudo cargar la publicación')));
  }

  useEffect(load, [id, kind]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!item) return <Spinner />;

  const isOwner = user?.id === item.reporter.id;
  if (!isOwner && !isAdmin) return <Navigate to={detailPath} replace />;

  const dateIso = 'foundAt' in item ? item.foundAt : item.lostAt;
  const initial: ItemFormInitial = {
    title: item.title,
    description: item.description,
    category: item.category,
    location: item.location,
    date: localDateString(new Date(dateIso)),
    imageUrl: item.imageUrl,
  };

  async function handleSubmit(values: ItemFormValues) {
    if (!id) return;
    try {
      const fd = itemFormData(values, kind === 'found' ? 'foundAt' : 'lostAt', initial.date);
      if (kind === 'found') await services.foundItems.update(id, fd);
      else await services.lostReports.update(id, fd);
      notify('Cambios guardados', 'success');
      navigate(detailPath, { replace: true });
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudieron guardar los cambios'), 'error');
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <BackButton />
      <PageHeader
        title={kind === 'found' ? 'Editar objeto encontrado' : 'Editar objeto perdido'}
        subtitle={isOwner ? 'Corrige o completa la información de tu publicación.' : 'Estás editando como administrador.'}
      />
      <ItemForm
        initial={initial}
        dateLabel={kind === 'found' ? 'Fecha en que se encontró' : 'Fecha en que se perdió'}
        submitLabel="Guardar cambios"
        optionalLocation={kind === 'lost'}
        allowCamera={kind === 'found'}
        photoEditable={isOwner}
        hint={kind === 'found' ? FOUND_HINT : LOST_HINT}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
