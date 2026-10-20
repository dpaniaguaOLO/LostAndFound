/**
 * Asistente de búsqueda por intención (sin LLM) — port a Deno.
 * Copia fiel de backend/src/lib/assistant.ts.
 */
import { tokenize } from './nlp.ts';

export type ItemKind = 'found' | 'lost';

export interface Intent {
  kind: ItemKind;
  categories: string[];
  location: string | null;
  since: Date | null;
  sinceLabel: string | null;
  keywords: string[];
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

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

  const usedWords = new Set<string>(Object.keys(CATEGORY_HINTS));
  const keywords = toks.filter((t) => !usedWords.has(t));

  return { kind, categories: Array.from(categories), location, since, sinceLabel, keywords };
}

export function composeAnswer(intent: Intent, count: number): string {
  const tipo = intent.kind === 'found' ? 'encontrado(s)' : 'reportado(s) como perdido(s)';
  const parts: string[] = [];
  if (count === 0) parts.push(`No hay objetos ${tipo}`);
  else if (count === 1) parts.push(`Hay 1 objeto ${tipo}`);
  else parts.push(`Hay ${count} objetos ${tipo}`);
  if (intent.categories.length) parts.push('de esa categoría');
  if (intent.location) parts.push(`en "${intent.location}"`);
  if (intent.sinceLabel) parts.push(intent.sinceLabel);
  return parts.join(' ') + '.';
}
