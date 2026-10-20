import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { FoundItem, LostReport } from '@laf/shared';
import { getErrorMessage } from '../lib/errors';
import { CATEGORY_LABELS } from '../lib/format';
import { aiService } from '../services/ai';

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

/**
 * Asistente de búsqueda (sin LLM): botón flotante que abre un panel de chat.
 * Interpreta preguntas frecuentes y responde con datos reales de la app.
 */
export function Assistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      text: 'Hola, soy el asistente de Lost & Found. Pregúntame por objetos encontrados o perdidos, por ejemplo: “¿se han encontrado botellas hoy?”.',
    },
  ]);
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
      {/* Botón flotante */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-olo-600 text-white shadow-lg transition hover:bg-olo-700 dark:bg-olo-500 dark:text-slate-950 dark:hover:bg-olo-400"
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente de búsqueda'}
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 3c4.97 0 9 3.36 9 7.5S16.97 18 12 18c-.7 0-1.38-.07-2.03-.2L5 19l1.1-3.3C4.78 14.4 3 12.6 3 10.5 3 6.36 7.03 3 12 3Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M9 10h6M9 13h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="card fixed bottom-20 right-4 z-40 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-olo-600 px-4 py-3 text-white dark:border-olo-dark-800 dark:bg-olo-500 dark:text-slate-950">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" fill="currentColor" />
            </svg>
            <div>
              <p className="text-sm font-semibold leading-none">Asistente de búsqueda</p>
              <p className="text-[11px] opacity-90">Responde con datos de la app</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
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
