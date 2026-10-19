/**
 * Motor de coincidencia para Lost and Found.
 * Combina la similitud de texto (NLP local) con señales estructuradas
 * (categoría, ubicación, cercanía de fechas) en un puntaje 0–100 y genera
 * motivos legibles de por qué dos objetos podrían coincidir.
 */
import { TfIdfIndex, cosineSimilarity, tokenize } from './nlp.js';

export interface MatchableItem {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  date: Date; // foundAt o lostAt
}

export interface MatchResult<T> {
  item: T;
  score: number; // 0..100
  reasons: string[];
}

// Pesos de cada señal en el puntaje final (suman 1).
const W_TEXT = 0.6;
const W_CATEGORY = 0.2;
const W_LOCATION = 0.12;
const W_DATE = 0.08;

/** Similitud de ubicación por solapamiento de tokens (0..1). */
function locationSim(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

/** Proximidad temporal: 1 el mismo día, decae a ~0 pasados ~30 días. */
function dateSim(a: Date, b: Date): number {
  const days = Math.abs(a.getTime() - b.getTime()) / 86_400_000;
  return Math.max(0, 1 - days / 30);
}

/**
 * Compara un objeto de referencia (p. ej. uno perdido) contra una lista de
 * candidatos (p. ej. encontrados) y devuelve los mejores, ordenados por score.
 */
export function matchItems<T extends MatchableItem>(
  reference: MatchableItem,
  candidates: T[],
  opts: { limit?: number; minScore?: number } = {},
): MatchResult<T>[] {
  const { limit = 5, minScore = 15 } = opts;
  if (candidates.length === 0) return [];

  const refText = `${reference.title} ${reference.description}`;
  const index = new TfIdfIndex([
    refText,
    ...candidates.map((c) => `${c.title} ${c.description}`),
  ]);
  const refVec = index.vectorize(refText);

  const results: MatchResult<T>[] = candidates.map((c) => {
    const textSim = cosineSimilarity(refVec, index.vectorize(`${c.title} ${c.description}`));
    const catSim = c.category === reference.category ? 1 : 0;
    const locSim = locationSim(reference.location, c.location);
    const dSim = dateSim(reference.date, c.date);

    const score01 = W_TEXT * textSim + W_CATEGORY * catSim + W_LOCATION * locSim + W_DATE * dSim;
    const score = Math.round(score01 * 100);

    const reasons: string[] = [];
    if (textSim > 0.15) reasons.push('Descripción parecida');
    if (catSim === 1) reasons.push('Misma categoría');
    if (locSim > 0.3) reasons.push('Ubicación parecida');
    if (dSim > 0.7) reasons.push('Fechas cercanas');

    return { item: c, score, reasons };
  });

  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Búsqueda semántica: rankea candidatos por relevancia respecto a una consulta
 * en lenguaje natural. Devuelve items con score 0..100.
 */
export function semanticSearch<T extends MatchableItem>(
  query: string,
  candidates: T[],
  opts: { limit?: number; minScore?: number } = {},
): MatchResult<T>[] {
  const { limit = 20, minScore = 5 } = opts;
  if (!query.trim() || candidates.length === 0) return [];

  const docs = candidates.map((c) => `${c.title} ${c.description} ${c.location}`);
  const index = new TfIdfIndex([query, ...docs]);
  const qVec = index.vectorize(query);
  const qTokens = new Set(tokenize(query));

  const results: MatchResult<T>[] = candidates.map((c, i) => {
    const textSim = cosineSimilarity(qVec, index.vectorize(docs[i]));
    // Bonus leve si la categoría o ubicación aparece literalmente en la consulta.
    const catBonus = qTokens.has(tokenize(c.category)[0] ?? '') ? 0.1 : 0;
    const locBonus = locationSim(query, c.location) > 0.3 ? 0.08 : 0;
    const score = Math.round(Math.min(1, textSim + catBonus + locBonus) * 100);
    return { item: c, score, reasons: [] };
  });

  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
