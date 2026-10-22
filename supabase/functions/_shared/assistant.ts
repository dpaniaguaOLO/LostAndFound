/**
 * Asistente de búsqueda por intención (sin LLM) — port a Deno.
 * Copia de backend/src/lib/assistant.ts, salvo que "hoy" se calcula en la zona
 * horaria de la app (las Edge Functions corren en UTC; ver time.ts).
 */
import { tokenize } from './nlp.ts';
import { startOfTodayInAppTz } from './time.ts';

export type ItemKind = 'found' | 'lost';

export interface Intent {
  kind: ItemKind;
  categories: string[];
  location: string | null;
  since: Date | null;
  sinceLabel: string | null;
  keywords: string[];
  /** Estados pedidos ("devueltos", "reclamados", "recuperados"); null = los del muro. */
  statuses: string[] | null;
  /** Pregunta por devoluciones/recuperaciones: la fecha es la de devolución. */
  returned: boolean;
}

const CATEGORY_HINTS: Record<string, string> = {
  botella: 'OTHER',
  termo: 'OTHER',
  cartera: 'WALLET',
  billetera: 'WALLET',
  monedero: 'WALLET',
  telefono: 'ELECTRONICS',
  celular: 'ELECTRONICS',
  laptop: 'ELECTRONICS',
  computadora: 'ELECTRONICS',
  cargador: 'ELECTRONICS',
  audifonos: 'ELECTRONICS',
  auriculares: 'ELECTRONICS',
  llaves: 'KEYS',
  llave: 'KEYS',
  llavero: 'KEYS',
  mochila: 'BAGS',
  bolso: 'BAGS',
  bolsa: 'BAGS',
  documento: 'DOCUMENTS',
  documentos: 'DOCUMENTS',
  credencial: 'DOCUMENTS',
  lentes: 'ACCESSORIES',
  gafas: 'ACCESSORIES',
  reloj: 'JEWELRY',
  anillo: 'JEWELRY',
  ropa: 'CLOTHING',
  chaqueta: 'CLOTHING',
  sueter: 'CLOTHING',
};

const LOCATION_HINTS = [
  'cafeteria', 'cafetería', 'estacionamiento', 'parqueo', 'recepcion', 'recepción',
  'sala', 'juntas', 'entrada', 'bano', 'baño', 'oficina', 'planta', 'bodega', 'almacen', 'almacén',
];

const startOfToday = startOfTodayInAppTz;

export function parseIntent(question: string): Intent {
  const lower = question.toLowerCase();
  const kind: ItemKind = /perd|extrav/.test(lower) ? 'lost' : 'found';

  const toks = tokenize(question);
  const categories = new Set<string>();
  for (const t of toks) {
    if (CATEGORY_HINTS[t]) categories.add(CATEGORY_HINTS[t]);
  }
  for (const w of lower.split(/\s+/)) {
    const clean = w.replace(/[^a-záéíóúñ]/g, '');
    if (CATEGORY_HINTS[clean]) categories.add(CATEGORY_HINTS[clean]);
  }

  let location: string | null = null;
  for (const loc of LOCATION_HINTS) {
    if (lower.includes(loc)) {
      location = loc;
      break;
    }
  }

  let since: Date | null = null;
  let sinceLabel: string | null = null;
  if (/\bhoy\b/.test(lower)) {
    since = startOfToday();
    sinceLabel = 'hoy';
  } else if (/\bayer\b/.test(lower)) {
    const d = startOfToday();
    d.setDate(d.getDate() - 1);
    since = d;
    sinceLabel = 'desde ayer';
  } else if (/esta semana|ultimos dias|últimos días|semana/.test(lower)) {
    const d = startOfToday();
    d.setDate(d.getDate() - 7);
    since = d;
    sinceLabel = 'esta semana';
  } else if (/este mes|ultimo mes|último mes|mes/.test(lower)) {
    const d = startOfToday();
    d.setMonth(d.getMonth() - 1);
    since = d;
    sinceLabel = 'este mes';
  }

  const { statuses, returned } = parseStatus(lower, kind);

  const usedWords = new Set<string>(Object.keys(CATEGORY_HINTS));
  const keywords = toks.filter((t) => !usedWords.has(t));

  return { kind, categories: Array.from(categories), location, since, sinceLabel, keywords, statuses, returned };
}

/** Estado por el que pregunta ("¿qué se devolvió?", "¿qué está reclamado?"). */
function parseStatus(lower: string, kind: ItemKind): { statuses: string[] | null; returned: boolean } {
  if (/devuel|devolv|entregad|entreg[oó]|recuper/.test(lower)) {
    return { statuses: [kind === 'found' ? 'RETURNED' : 'RESOLVED'], returned: true };
  }
  if (kind === 'found' && /reclamad/.test(lower)) return { statuses: ['CLAIMED'], returned: false };
  return { statuses: null, returned: false };
}

// --- Charla (sin búsqueda) -------------------------------------------------

const SEARCH_HINT = /encontr|perd|extrav|busc|\bhay\b|olvid|dej[eé]|objeto|publicad/;

const SMALL_TALK: { re: RegExp; answer: string }[] = [
  {
    re: /c[oó]mo te llamas|qui[eé]n eres|tu nombre|eres (un|una) (bot|robot|ia|humano|persona)/,
    answer: 'Soy Olivia, la asistente virtual de Lost & Found de OLO 🤖 Te ayudo a buscar objetos perdidos y encontrados y a usar la app.',
  },
  {
    re: /qu[eé] (haces|puedes hacer|sabes hacer)|en qu[eé] (me )?(puedes )?ayudar|para qu[eé] sirves|c[oó]mo funcionas/,
    answer:
      'Busco entre los objetos publicados en la app: pregúntame, por ejemplo, «¿se encontraron llaves esta semana?». ' +
      'También te explico cómo publicar, reclamar un objeto o reportar algo que perdiste.',
  },
  {
    re: /c[oó]mo (publico|publicar|reporto|reportar|subo|subir)/,
    answer:
      'Pulsa «Publicar» (el + verde en el móvil), elige si encontraste o perdiste algo y completa foto, ' +
      'descripción, categoría, fecha y ubicación. Si reportas algo perdido, la app te avisa si aparece algo parecido.',
  },
  {
    re: /c[oó]mo (reclamo|reclamar|recupero|recuperar)/,
    answer:
      'Abre el objeto en el muro y pulsa «Reclamar este objeto», explicando por qué es tuyo. ' +
      'Quien lo encontró revisa tu solicitud y, si la aprueba, coordinan la entrega.',
  },
  { re: /gracias|te lo agradezco/, answer: '¡Con gusto! Aquí estoy si necesitas buscar algo más 😊' },
  { re: /\b(adi[oó]s|hasta luego|nos vemos|chao|bye)\b/, answer: '¡Hasta luego! Ojalá no pierdas nada, pero si pasa, aquí estaré.' },
  {
    re: /^[\s¿¡]*(hola|buen[oa]s?( d[ií]as| tardes| noches)?|hey|qu[eé] tal|c[oó]mo est[aá]s)\b/,
    answer: '¡Hola! Soy Olivia. ¿Buscas algo que perdiste o quieres saber si encontraron algo?',
  },
];

/**
 * ¿Es charla (saludo, preguntas sobre Olivia o la app) y no una búsqueda? Solo
 * si no hay pistas de búsqueda (categoría, lugar, fecha o verbos como "perdí").
 */
export function isSmallTalk(question: string, intent: Intent): boolean {
  const lower = question.toLowerCase();
  if (intent.categories.length || intent.location || intent.since) return false;
  if (SEARCH_HINT.test(lower) && !/c[oó]mo (publico|publicar|reporto|reportar|reclamo|reclamar)/.test(lower)) {
    return false;
  }
  return SMALL_TALK.some((s) => s.re.test(lower));
}

/** Respuesta fija de charla (respaldo cuando el LLM no está disponible). */
export function smallTalkAnswer(question: string): string {
  const lower = question.toLowerCase();
  return (
    SMALL_TALK.find((s) => s.re.test(lower))?.answer ??
    'Soy Olivia y te ayudo con objetos perdidos y encontrados en OLO. ¿Qué estás buscando?'
  );
}

export function composeAnswer(intent: Intent, count: number): string {
  const tipo = intent.returned
    ? intent.kind === 'found' ? 'devuelto(s) a su dueño' : 'perdido(s) ya recuperado(s)'
    : intent.statuses?.includes('CLAIMED')
      ? 'reclamado(s) pendiente(s) de entrega'
      : intent.kind === 'found' ? 'encontrado(s)' : 'reportado(s) como perdido(s)';
  const parts: string[] = [];
  if (count === 0) parts.push(`No hay objetos ${tipo}`);
  else if (count === 1) parts.push(`Hay 1 objeto ${tipo}`);
  else parts.push(`Hay ${count} objetos ${tipo}`);
  if (intent.categories.length) parts.push('de esa categoría');
  if (intent.location) parts.push(`en "${intent.location}"`);
  if (intent.sinceLabel) parts.push(intent.sinceLabel);
  return parts.join(' ') + '.';
}
