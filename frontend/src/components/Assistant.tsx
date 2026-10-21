import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { FoundItem, LostReport } from '@laf/shared';
import { getErrorMessage } from '../lib/errors';
import { CATEGORY_LABELS } from '../lib/format';
import { aiService } from '../services/ai';
import { OliviaAvatar } from './OliviaAvatar';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  found?: FoundItem[];
  lost?: LostReport[];
}

const SUGGESTIONS = [
  '¿Se han encontrado botellas hoy?',
  '¿Hay llaves en la cafetería?',
  '¿Qué se encontró esta semana?',
];

const WELCOME =
  'Hola, soy Olivia 👋 tu asistente aquí en OLO. Pregúntame por objetos encontrados o ' +
  'perdidos, por ejemplo: «¿se han encontrado botellas hoy?» y te ayudo a buscarlos.';

/**
 * Olivia: la asistente de Lost & Found (OLO). Botón flotante que abre un panel
 * de chat. Responde con datos reales de la app (vía LLM, con respaldo clásico).
 */
export function Assistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', text: WELCOME }]);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await aiService.assistant(q);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: res.answer,
          found: res.foundItems,
          lost: res.lostReports,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: getErrorMessage(err, 'No pude procesar la pregunta.'),
        },
      ]);
    } finally {
      setLoading(false);
      // Desplaza al final tras renderizar.
      setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <>
      {/* Botón flotante: etiqueta + avatar de Olivia (o una X al estar abierto) */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-olo-500 focus:ring-offset-2 dark:focus:ring-offset-olo-dark-950"
        aria-label={open ? 'Cerrar a Olivia' : 'Hablar con Olivia, la asistente'}
      >
        {/* Etiqueta invitadora (oculta cuando el chat está abierto) */}
        {!open && (
          <span className="hidden rounded-full bg-white px-3 py-2 text-sm font-semibold text-olo-700 shadow-lg ring-1 ring-olo-200 transition group-hover:bg-olo-50 dark:bg-olo-dark-900 dark:text-olo-300 dark:ring-olo-dark-800 sm:inline-block">
            Pregunta a Olivia
          </span>
        )}

        {open ? (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-olo-600 text-white shadow-xl transition hover:scale-105 dark:bg-olo-500 dark:text-slate-950">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
        ) : (
          <span className="relative flex h-16 w-16 items-center justify-center">
            {/* Halo animado para atraer la atención */}
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-olo-500/40" />
            <OliviaAvatar className="relative h-16 w-16 rounded-full shadow-xl ring-2 ring-white transition group-hover:scale-105 dark:ring-olo-dark-900" />
            {/* Punto de "disponible" */}
            <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white bg-emerald-400 dark:border-olo-dark-900" />
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="card fixed bottom-24 right-5 z-40 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-olo-600 px-4 py-3 text-white dark:border-olo-dark-800 dark:bg-olo-500 dark:text-slate-950">
            <OliviaAvatar className="h-9 w-9 shrink-0 rounded-full ring-2 ring-white/40" />
            <div>
              <p className="text-sm font-semibold leading-none">Olivia</p>
              <p className="text-[11px] opacity-90">Asistente de OLO · Lost &amp; Found</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex items-end gap-2 justify-start'}>
                {m.role === 'assistant' && (
                  <OliviaAvatar className="h-7 w-7 shrink-0 self-start" />
                )}
                <div
                  className={
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm ' +
                    (m.role === 'user'
                      ? 'bg-olo-600 text-white dark:bg-olo-500 dark:text-slate-950'
                      : 'bg-slate-100 text-slate-700 dark:bg-olo-dark-800 dark:text-slate-200')
                  }
                >
                  <p>{m.text}</p>
                  {/* Resultados enlazados */}
                  {(m.found?.length || m.lost?.length) ? (
                    <ul className="mt-2 space-y-1">
                      {m.found?.map((it) => (
                        <li key={it.id}>
                          <Link
                            to={`/objetos/${it.id}`}
                            onClick={() => setOpen(false)}
                            className="block rounded-lg bg-white/70 px-2 py-1 text-xs text-slate-700 hover:bg-white dark:bg-olo-dark-900 dark:text-slate-200"
                          >
                            {it.title} · {CATEGORY_LABELS[it.category]} · {it.location}
                          </Link>
                        </li>
                      ))}
                      {m.lost?.map((it) => (
                        <li
                          key={it.id}
                          className="rounded-lg bg-white/70 px-2 py-1 text-xs text-slate-700 dark:bg-olo-dark-900 dark:text-slate-200"
                        >
                          {it.title} · {CATEGORY_LABELS[it.category]} · {it.location}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:bg-olo-dark-800 dark:text-slate-400">
                  Buscando…
                </div>
              </div>
            )}

            {/* Sugerencias iniciales */}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-olo-400 hover:text-olo-700 dark:border-olo-dark-800 dark:text-slate-300 dark:hover:text-olo-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="flex gap-2 border-t border-slate-200 p-3 dark:border-olo-dark-800">
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta…"
              aria-label="Pregunta al asistente"
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  );
}
