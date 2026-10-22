import { useState } from 'react';
import { OliviaAvatar } from './OliviaAvatar';
import { Modal } from './ui';

const STEPS = [
  {
    title: 'Bienvenido a Lost & Found',
    text: 'Aquí los colaboradores de OLO publican lo que encuentran y lo que pierden en las instalaciones. En el muro ves todo, con buscador y filtros.',
    icon: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4Zm9 0A1.5 1.5 0 0 1 14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5v-4Zm-9 9A1.5 1.5 0 0 1 5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4Zm9 0a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4Z',
  },
  {
    title: '¿Encontraste algo?',
    text: 'Toca el botón verde «+», elige «Encontré un objeto» y añade una foto. Su dueño podrá reclamarlo y tú decides si se lo entregas.',
    icon: 'M12 5v14M5 12h14',
  },
  {
    title: '¿Perdiste algo?',
    text: 'Repórtalo como perdido: la app lo compara con todo lo encontrado y te avisa si aparece algo parecido. Si lo ves en el muro, reclámalo.',
    icon: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4',
  },
  {
    title: 'Olivia te ayuda',
    text: 'Pregúntale a Olivia, tu asistente, cosas como «¿se encontraron llaves hoy?» o «¿cómo reclamo un objeto?».',
    icon: null,
  },
] as const;

/** Introducción de 4 pasos para usuarios nuevos (se puede saltar). */
export function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  function close() {
    setStep(0);
    onClose();
  }

  return (
    <Modal open={open} label="Introducción a Lost & Found" onClose={close}>
      <div className="flex flex-col items-center text-center" aria-live="polite">
        <div key={step} className="mb-5 flex h-20 w-20 animate-scale-in items-center justify-center rounded-3xl bg-gradient-to-br from-olo-600 to-olo-700 text-white shadow-glow-lg">
          {s.icon ? (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={s.icon} />
            </svg>
          ) : (
            <OliviaAvatar decorative className="h-16 w-16" />
          )}
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-olo-700 dark:text-olo-400">
          Paso {step + 1} de {STEPS.length}
        </p>
        <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">{s.title}</h2>
        <p key={`t${step}`} className="mt-2 animate-fade-in text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {s.text}
        </p>

        <div className="mt-5 flex gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={'h-1.5 rounded-full transition-all duration-300 ' + (i === step ? 'w-6 bg-olo-500' : 'w-1.5 bg-slate-300 dark:bg-olo-dark-700')}
            />
          ))}
        </div>

        <div className="mt-6 flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button className="btn-ghost" onClick={close}>
            {last ? 'Cerrar' : 'Saltar'}
          </button>
          <div className="flex gap-2 [&>*]:flex-1">
            {step > 0 && (
              <button className="btn-secondary" onClick={() => setStep(step - 1)}>
                Atrás
              </button>
            )}
            <button className="btn-primary" onClick={() => (last ? close() : setStep(step + 1))}>
              {last ? '¡Empezar!' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
