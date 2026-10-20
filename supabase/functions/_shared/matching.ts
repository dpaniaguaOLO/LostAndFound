/**
 * Motor de coincidencia — port a Deno. Copia fiel de backend/src/lib/matching.ts.
 * Pesos y fórmulas idénticos para preservar el comportamiento.
 */
import { cosineSimilarity, TfIdfIndex, tokenize } from './nlp.ts';
import { visualSimilarity, type VisualSignature } from './visual.ts';

export interface MatchableItem {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  date: Date;
  signature?: VisualSignature | null;
}

export interface MatchBreakdown {
  text: number;
  image: number | null;
  category: number;
  location: number;
  date: number;
}

export interface MatchResult<T extends MatchableItem> {
  item: T;
  score: number;
  reasons: string[];
  breakdown: MatchBreakdown;
}

const W_TEXT = 0.6;
const W_CATEGORY = 0.2;
const W_LOCATION = 0.12;
const W_DATE = 0.08;
const W_VISUAL = 0.35;

function locationSim(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

function dateSim(a: Date, b: Date): number {
  const days = Math.abs(a.getTime() - b.getTime()) / 86_400_000;
  return Math.max(0, 1 - days / 30);
}

export function matchItems<T extends MatchableItem>(
  reference: MatchableItem,
  candidates: T[],
  opts: { limit?: number; minScore?: number } = {},
): MatchResult<T>[] {
  const { limit = 5, minScore = 15 } = opts;
  if (candidates.length === 0) return [];

  const refText = `${reference.title} ${reference.description}`;
  const index = new TfIdfIndex([refText, ...candidates.map((c) => `${c.title} ${c.description}`)]);
  const refVec = index.vectorize(refText);

  const results: MatchResult<T>[] = candidates.map((c) => {
    const textSim = cosineSimilarity(refVec, index.vectorize(`${c.title} ${c.description}`));
    const catSim = c.category === reference.category ? 1 : 0;
    const locSim = locationSim(reference.location, c.location);
    const dSim = dateSim(reference.date, c.date);

    const bothHaveImage = !!reference.signature && !!c.signature;
    const visSim = bothHaveImage ? visualSimilarity(reference.signature!, c.signature!) : 0;

    let score01: number;
    if (bothHaveImage) {
      const rest = 1 - W_VISUAL;
      score01 =
        W_VISUAL * visSim +
        rest * (W_TEXT * textSim + W_CATEGORY * catSim + W_LOCATION * locSim + W_DATE * dSim);
    } else {
      score01 = W_TEXT * textSim + W_CATEGORY * catSim + W_LOCATION * locSim + W_DATE * dSim;
    }
    const score = Math.round(score01 * 100);

    const reasons: string[] = [];
    if (bothHaveImage && visSim > 0.72) reasons.push('Imagen parecida');
    if (textSim > 0.15) reasons.push('Descripción parecida');
    if (catSim === 1) reasons.push('Misma categoría');
    if (locSim > 0.3) reasons.push('Ubicación parecida');
    if (dSim > 0.7) reasons.push('Fechas cercanas');

    const breakdown: MatchBreakdown = {
      text: Math.round(textSim * 100),
      image: bothHaveImage ? Math.round(visSim * 100) : null,
      category: Math.round(catSim * 100),
      location: Math.round(locSim * 100),
      date: Math.round(dSim * 100),
    };

    return { item: c, score, reasons, breakdown };
  });

  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

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
    const catBonus = qTokens.has(tokenize(c.category)[0] ?? '') ? 0.1 : 0;
    const locBonus = locationSim(query, c.location) > 0.3 ? 0.08 : 0;
    const score = Math.round(Math.min(1, textSim + catBonus + locBonus) * 100);
    const breakdown: MatchBreakdown = {
      text: Math.round(textSim * 100),
      image: null,
      category: 0,
      location: 0,
      date: 0,
    };
    return { item: c, score, reasons: [], breakdown };
  });

  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
