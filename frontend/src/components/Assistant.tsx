import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AssistantTurn, FoundItem, LostReport } from '@laf/shared';
import { getErrorMessage } from '../lib/errors';
import { registerLayer } from '../lib/layers';
import { CATEGORY_LABELS } from '../lib/format';
import { aiService } from '../services/ai';
import { OliviaAvatar } from './OliviaAvatar';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  found?: FoundItem[];
  lost?: LostReport[];
  error?: boolean;
}

const SUGGESTIONS = [
  '¿Qué se encontró esta semana?',
  '¿Hay llaves en la cafetería?',
  '¿Cómo reclamo un objeto?',
  '¿Qué puedes hacer?',
];

// Turnos previos enviados como contexto (el servidor también limita a 6).
const HISTORY_TURNS = 6;

const WELCOME =
  'Hola, soy Olivia 👋 tu asistente aquí en OLO. Pregúntame por objetos encontrados o ' +
  'perdidos, o cómo usar la app, y te ayudo.';

// Debe coincidir con MAX_QUERY del servidor (supabase/functions/api).
const MAX_QUESTION = 300;

/**
 * Olivia: la asistente de Lost & Found (OLO). Botón flotante que abre un panel
 * de chat (hoja a pantalla completa en móvil). Responde con datos reales de la
 * app (vía LLM, con respaldo clásico).
 */
export function Assistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', text: WELCOME }]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // En móvil el panel es modal (fondo atenuado): se atrapa el foco y se marca
  // aria-modal. En escritorio convive con la página (no modal).
  const [isModal, setIsModal] = useState(false);
  // Última respuesta de Olivia, para anunciarla a lectores de pantalla (solo eso,
  // no toda la conversación ni los mensajes propios).
  const lastAnswer = [...messages].reverse().find((m) => m.role === 'assistant' && messages.length > 1)?.text ?? '';

  // Desplaza al final cuando llega un mensaje o empieza/termina la carga.
  useEffect(() => {
    const el = scrollRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [messages, loading, open]);

  // Al cerrar, devolver el foco al botón flotante (que se vuelve a montar).
  useEffect(() => {
    if (!open && wasOpen.current) fabRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // Al abrir: foco dentro del panel (en el campo solo con puntero fino, para no
  // sacar el teclado en móvil), cierre con Escape y trampa de foco si es modal.
  useEffect(() => {
    if (!open) return;
    const modal = !window.matchMedia('(min-width: 640px)').matches;
    setIsModal(modal);
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
    else closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !modal || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'),
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const unregister = registerLayer(() => setOpen(false)); // botón atrás de Android
    return () => {
      unregister();
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    // Contexto para seguir la conversación: últimos turnos, sin el saludo ni errores.
    const history: AssistantTurn[] = messages
      .slice(1)
      .filter((m) => !m.error)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await aiService.assistant(q, history);
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: res.answer, found: res.foundItems, lost: res.lostReports },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: getErrorMessage(err, 'No pude procesar la pregunta.'), error: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <>
      {/* Botón flotante: sobre la barra inferior en móvil; etiqueta visible en sm+ */}
      {!open && (
        <button
          ref={fabRef}
          onClick={() => setOpen(true)}
          className="group fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex animate-scale-in items-center gap-2 rounded-full transition-[bottom] duration-300 md:bottom-6 md:right-6 [[data-actionbar]_&]:bottom-[calc(10rem+env(safe-area-inset-bottom))] md:[[data-actionbar]_&]:bottom-6"
          aria-label="Hablar con Olivia, la asistente"
        >
          <span className="hidden rounded-full bg-white/95 px-4 py-2.5 text-sm font-semibold text-olo-700 shadow-elevated ring-1 ring-slate-200/80 backdrop-blur transition duration-300 ease-out-expo group-hover:-translate-x-1 dark:bg-olo-dark-900/95 dark:text-olo-300 dark:ring-olo-dark-800 sm:inline-block">
            Pregunta a Olivia
          </span>
          <span className="relative flex h-14 w-14 items-center justify-center sm:h-16 sm:w-16">
            {/* Halo suave (3 pulsos para llamar la atención, sin distraer después) */}
            <span className="absolute inset-0 rounded-full bg-olo-500/50 opacity-0 animate-soft-pulse" aria-hidden />
            <OliviaAvatar
              decorative
              className="relative h-full w-full rounded-full shadow-glow-lg ring-[3px] ring-white transition duration-300 ease-out-expo group-hover:scale-105 group-active:scale-95 dark:ring-olo-dark-900"
            />
            {/* Punto de "disponible" */}
            <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400 dark:border-olo-dark-900" aria-hidden />
          </span>
        </button>
      )}

      {open && (
        <>
          {/* Fondo atenuado solo en móvil (en escritorio el panel convive con la página) */}
          <div className="fixed inset-0 z-40 animate-fade-in bg-slate-950/40 backdrop-blur-sm sm:hidden" onClick={() => setOpen(false)} aria-hidden />

          <section
            ref={panelRef}
            role="dialog"
            aria-modal={isModal || undefined}
            aria-label="Chat con Olivia"
            className="fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] animate-slide-up flex-col overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white shadow-elevated dark:border-olo-dark-800 dark:bg-olo-dark-900 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(36rem,calc(100dvh-7rem))] sm:w-[24rem] sm:origin-bottom-right sm:animate-scale-in sm:rounded-3xl"
          >
            {/* Cabecera */}
            <header className="relative flex items-center gap-3 bg-gradient-to-br from-olo-700 to-olo-800 px-4 py-3.5 text-white dark:from-olo-800 dark:to-olo-900">
              <div className="relative">
                <OliviaAvatar decorative className="h-10 w-10 shrink-0 rounded-full ring-2 ring-white/40" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-olo-600 bg-emerald-300" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-tight">Olivia</p>
                <p className="text-xs text-white/95">{loading ? 'Escribiendo…' : 'Asistente de OLO · en línea'}</p>
              </div>
              <button
                ref={closeRef}
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 active:scale-90"
                aria-label="Cerrar chat"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            {/* Conversación */}
            {/* Solo se anuncia la última respuesta de Olivia (no los mensajes propios). */}
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {loading ? '' : lastAnswer}
            </p>
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto overscroll-contain bg-slate-50/60 p-4 dark:bg-olo-dark-950/40">
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="flex animate-fade-up justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-olo-700 to-olo-800 px-3.5 py-2.5 text-sm text-white shadow-glow dark:from-olo-400 dark:to-olo-500 dark:text-slate-950">
                      {m.text}
                    </p>
                  </div>
                ) : (
                  <div key={i} className="flex animate-fade-up items-start gap-2">
                    <OliviaAvatar decorative className="mt-0.5 h-7 w-7 shrink-0" />
                    <div className="min-w-0 max-w-[88%] flex-1">
                      <p
                        className={
                          'inline-block rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed shadow-card ' +
                          (m.error
                            ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                            : 'bg-white text-slate-700 dark:bg-olo-dark-850 dark:text-slate-200')
                        }
                      >
                        {m.text}
                      </p>
                      {/* Resultados enlazados */}
                      {(m.found?.length || m.lost?.length) ? (
                        <ul className="mt-2 space-y-1.5">
                          {m.found?.map((it) => (
                            <li key={it.id}>
                              <Link
                                to={`/objetos/${it.id}`}
                                onClick={() => setOpen(false)}
                                className="group flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-2 transition hover:border-olo-300 hover:shadow-card active:scale-[0.98] dark:border-olo-dark-800 dark:bg-olo-dark-900 dark:hover:border-olo-500/50"
                              >
                                <ResultThumb src={it.imageUrl} />
                                <ResultText title={it.title} meta={`${CATEGORY_LABELS[it.category]} · ${it.location}`} />
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-olo-500">
                                  <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                              </Link>
                            </li>
                          ))}
                          {m.lost?.map((it) => (
                            <li key={it.id}>
                              <Link
                                to={`/perdidos/${it.id}`}
                                onClick={() => setOpen(false)}
                                className="group flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-2 transition hover:border-olo-300 hover:shadow-card active:scale-[0.98] dark:border-olo-dark-800 dark:bg-olo-dark-900 dark:hover:border-olo-500/50"
                              >
                                <ResultThumb src={it.imageUrl} />
                                <ResultText title={it.title} meta={`Perdido · ${CATEGORY_LABELS[it.category]}${it.location ? ` · ${it.location}` : ''}`} />
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-olo-500">
                                  <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ),
              )}

              {/* Indicador "escribiendo" */}
              {loading && (
                <div className="flex animate-fade-in items-start gap-2" role="status" aria-label="Olivia está escribiendo">
                  <OliviaAvatar decorative className="mt-0.5 h-7 w-7 shrink-0" />
                  <div className="flex gap-1 rounded-2xl rounded-tl-md bg-white px-4 py-3.5 shadow-card dark:bg-olo-dark-850">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="h-2 w-2 animate-typing-dot rounded-full bg-olo-500" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Sugerencias iniciales */}
              {messages.length === 1 && !loading && (
                <div className="flex flex-col items-start gap-2 pl-9">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="chip animate-fade-up text-left"
                      style={{ animationDelay: `${150 + i * 70}ms` }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Entrada */}
            <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-slate-200/80 bg-white p-3 safe-bottom dark:border-olo-dark-800 dark:bg-olo-dark-900">
              <input
                ref={inputRef}
                className="input rounded-full"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu pregunta…"
                aria-label="Pregunta para Olivia"
                maxLength={MAX_QUESTION}
                enterKeyHint="send"
              />
              <button
                type="submit"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-olo-600 to-olo-700 text-white shadow-glow transition hover:shadow-glow-lg active:scale-90 disabled:opacity-50 disabled:shadow-none dark:from-olo-400 dark:to-olo-500 dark:text-slate-950"
                disabled={loading || input.trim().length < 2}
                aria-label="Enviar pregunta"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </section>
        </>
      )}
    </>
  );
}

function ResultThumb({ src }: { src: string | null }) {
  return src ? (
    <img src={src} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-olo-50 text-olo-500 dark:bg-olo-500/10" aria-hidden>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Zm0 0 8 4.5m0 0 8-4.5M12 13v7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function ResultText({ title, meta }: { title: string; meta: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{meta}</span>
    </span>
  );
}
