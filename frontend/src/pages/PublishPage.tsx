import { useNavigate } from 'react-router-dom';
import type { FoundItem } from '@laf/shared';
import { ItemForm, type ItemFormValues } from '../components/ItemForm';
import { useToast } from '../context/ToastContext';
import { api, ApiRequestError } from '../lib/api';

export function PublishPage() {
  const { notify } = useToast();
  const navigate = useNavigate();

  async function handleSubmit(values: ItemFormValues) {
    const fd = new FormData();
    fd.set('title', values.title);
    fd.set('description', values.description);
    fd.set('category', values.category);
    fd.set('location', values.location);
    // Convierte la fecha (yyyy-mm-dd) a ISO 8601 que espera el backend.
    fd.set('foundAt', new Date(values.date).toISOString());
    if (values.image) fd.set('image', values.image);

    try {
      const created = await api<FoundItem>('/found-items', { method: 'POST', formData: fd });
      notify('Objeto publicado', 'success');
      navigate(`/objetos/${created.id}`);
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo publicar', 'error');
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">Publicar objeto encontrado</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Registra un objeto que encontraste para que su dueño pueda recuperarlo.
      </p>
      <ItemForm dateLabel="Fecha en que se encontró" submitLabel="Publicar objeto" onSubmit={handleSubmit} />
    </div>
  );
}
