import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ItemForm, type ItemFormValues } from '../components/ItemForm';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { services } from '../services';

type Mode = 'found' | 'lost';

export function PublishPage() {
  const { notify } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('found');

  async function handleSubmit(values: ItemFormValues) {
    const fd = new FormData();
    fd.set('title', values.title);
    fd.set('description', values.description);
    fd.set('category', values.category);
    fd.set('location', values.location);
    if (values.image) fd.set('image', values.image);
    const iso = new Date(values.date).toISOString();

    try {
      if (mode === 'found') {
        fd.set('foundAt', iso);
        const created = await services.foundItems.create(fd);
        notify('Objeto encontrado publicado', 'success');
        navigate(`/objetos/${created.id}`);
      } else {
        fd.set('lostAt', iso);
        await services.lostReports.create(fd);
        notify('Objeto perdido reportado', 'success');
        navigate('/mis-objetos?tab=lost');
      }
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo publicar'), 'error');
    }
  }

  const tabClass = (active: boolean) =>
    'flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition ' +
    (active
      ? 'bg-olo-600 text-white dark:bg-olo-500 dark:text-slate-950'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-olo-dark-900 dark:text-slate-300 dark:hover:bg-olo-dark-800');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">
        Publicar
      </h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        ¿Encontraste un objeto o perdiste algo? Elige una opción y completa los datos.
      </p>

      {/* Selector de tipo de publicación */}
      <div className="mb-6 flex gap-2" role="tablist" aria-label="Tipo de publicación">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'found'}
          className={tabClass(mode === 'found')}
          onClick={() => setMode('found')}
        >
          Encontré un objeto
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'lost'}
          className={tabClass(mode === 'lost')}
          onClick={() => setMode('lost')}
        >
          Perdí un objeto
        </button>
      </div>

      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        {mode === 'found'
          ? 'Registra un objeto que encontraste para que su dueño pueda recuperarlo.'
          : 'Reporta un objeto que perdiste para que otros puedan ayudarte a encontrarlo.'}
      </p>

      {/* key fuerza a reiniciar el formulario al cambiar de modo */}
      <ItemForm
        key={mode}
        dateLabel={mode === 'found' ? 'Fecha en que se encontró' : 'Fecha en que se perdió'}
        submitLabel={mode === 'found' ? 'Publicar objeto encontrado' : 'Reportar objeto perdido'}
        optionalLocation={mode === 'lost'}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
