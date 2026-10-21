import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ItemForm, type ItemFormValues } from '../components/ItemForm';
import { PageHeader } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { localDateString } from '../lib/format';
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
    // "YYYY-MM-DD" con new Date() se interpreta como medianoche UTC y en UTC-6
    // se mostraría como el día anterior. Hoy -> instante actual; otro día ->
    // mediodía local (lejos de los bordes del día en cualquier zona cercana).
    const iso = (values.date === localDateString() ? new Date() : new Date(`${values.date}T12:00:00`)).toISOString();

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

  const options: { key: Mode; title: string; hint: string; icon: string }[] = [
    {
      key: 'found',
      title: 'Encontré un objeto',
      hint: 'Ayuda a su dueño a recuperarlo',
      icon: 'M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Zm-2.5-11.5 2 2 3.5-3.5',
    },
    {
      key: 'lost',
      title: 'Perdí un objeto',
      hint: 'Avisa para que otros te ayuden',
      icon: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4M11 8v3.5m0 2.5h.01',
    },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Publicar" subtitle="¿Encontraste un objeto o perdiste algo? Elige una opción y completa los datos." />

      {/* Selector de tipo de publicación */}
      <div className="mb-6 grid grid-cols-2 gap-3" role="tablist" aria-label="Tipo de publicación">
        {options.map((o) => {
          const active = mode === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(o.key)}
              className={
                'flex flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition duration-200 active:scale-[0.98] ' +
                (active
                  ? 'border-olo-500 bg-olo-50 shadow-glow dark:border-olo-400 dark:bg-olo-500/10'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-olo-dark-800 dark:bg-olo-dark-900 dark:hover:border-olo-dark-700')
              }
            >
              <span
                className={
                  'flex h-10 w-10 items-center justify-center rounded-xl transition ' +
                  (active
                    ? 'bg-olo-500 text-white dark:bg-olo-400 dark:text-slate-950'
                    : 'bg-slate-100 text-slate-500 dark:bg-olo-dark-850 dark:text-slate-400')
                }
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d={o.icon} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>
                <span className={'block text-sm font-bold sm:text-base ' + (active ? 'text-olo-800 dark:text-olo-200' : 'text-slate-800 dark:text-slate-100')}>
                  {o.title}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 sm:text-sm">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

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
