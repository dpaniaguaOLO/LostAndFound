/**
 * Asistente de búsqueda por intención (sin LLM).
 * Interpreta una pregunta en lenguaje natural extrayendo señales simples
 * (tipo encontrado/perdido, categoría, ubicación, rango de fecha) para consultar
 * la base de datos real. No "conversa" libremente: resuelve consultas frecuentes.
 */
import { tokenize } from './nlp.js';

export type ItemKind = 'found' | 'lost';

export interface Intent {
  kind: ItemKind; // sobre qué pregunta (por defecto: encontrados)
  categories: string[]; // categorías detectadas
  location: string | null; // texto de ubicación detectado
  since: Date | null; // filtro temporal inferido
  sinceLabel: string | null; // etiqueta legible del rango ("hoy", "esta semana"…)
  keywords: string[]; // tokens restantes para buscar en texto
  statuses: string[] | null; // estados pedidos ("devueltos", "reclamados"); null = los del muro
  returned: boolean; // pregunta por devoluciones: la fecha es la de devolución
}

// Palabras que, en la pregunta, mapean a una categoría del sistema.
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

// Ubicaciones frecuentes para detectar en la pregunta (ampliable).
const LOCATION_HINTS = [
  'cafeteria', 'cafetería', 'estacionamiento', 'parqueo', 'recepcion', 'recepción',
  'sala', 'juntas', 'entrada', 'bano', 'baño', 'oficina', 'planta', 'bodega', 'almacen', 'almacén',
];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Extrae la intención de una pregunta en lenguaje natural. */
export function parseIntent(question: string): Intent {
  const lower = question.toLowerCase();

  // Tipo: si menciona "perdi"/"perdido"/"extravié" -> perdidos; por defecto encontrados.
  const kind: ItemKind = /perd|extrav/.test(lower) ? 'lost' : 'found';

  // Categorías
  const toks = tokenize(question); // ya normaliza sinónimos y acentos
  const categories = new Set<string>();
  for (const t of toks) {
    if (CATEGORY_HINTS[t]) categories.add(CATEGORY_HINTS[t]);
  }
  // también sobre palabras crudas por si el stem difiere
  for (const w of lower.split(/\s+/)) {
    const clean = w.replace(/[^a-záéíóúñ]/g, '');
    if (CATEGORY_HINTS[clean]) categories.add(CATEGORY_HINTS[clean]);
  }

  // Ubicación: primera pista de ubicación encontrada en el texto.
  let location: string | null = null;
  for (const loc of LOCATION_HINTS) {
    if (lower.includes(loc)) {
      location = loc;
      break;
    }
  }

  // Rango temporal
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

  // Palabras clave de contenido (quita las que ya se usaron como señales)
  const usedWords = new Set<string>(Object.keys(CATEGORY_HINTS));
  const keywords = toks.filter((t) => !usedWords.has(t));

  return {
    kind,
    categories: Array.from(categories),
    location,
    since,
    sinceLabel,
    keywords,
    statuses,
    returned,
  };
}

/** Estado por el que pregunta ("¿qué se devolvió?", "¿qué está reclamado?"). */
function parseStatus(lower: string, kind: ItemKind): { statuses: string[] | null; returned: boolean } {
  if (/devuel|devolv|entregad|entreg[oó]|recuper/.test(lower)) {
    return { statuses: [kind === 'found' ? 'RETURNED' : 'RESOLVED'], returned: true };
  }
  if (kind === 'found' && /reclamad/.test(lower)) return { statuses: ['CLAIMED'], returned: false };
  return { statuses: null, returned: false };
}

/** Redacta una respuesta legible a partir de la intención y el conteo de resultados. */
export function composeAnswer(intent: Intent, count: number): string {
  const tipo = intent.returned
    ? intent.kind === 'found' ? 'devuelto(s) a su dueño' : 'perdido(s) ya recuperado(s)'
    : intent.statuses?.includes('CLAIMED')
      ? 'reclamado(s) pendiente(s) de entrega'
      : intent.kind === 'found' ? 'encontrado(s)' : 'reportado(s) como perdido(s)';
  const parts: string[] = [];
  if (count === 0) {
    parts.push(`No hay objetos ${tipo}`);
  } else if (count === 1) {
    parts.push(`Hay 1 objeto ${tipo}`);
  } else {
    parts.push(`Hay ${count} objetos ${tipo}`);
  }
  if (intent.categories.length) parts.push('de esa categoría');
  if (intent.location) parts.push(`en "${intent.location}"`);
  if (intent.sinceLabel) parts.push(intent.sinceLabel);
  return parts.join(' ') + '.';
}
