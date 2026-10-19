/**
 * Motor de NLP local (sin servicios externos) para Lost and Found.
 *
 * Alcance: NLP clásico (normalización + TF-IDF + similitud de coseno), suficiente
 * para búsqueda por relevancia y emparejado de objetos. No es un modelo de lenguaje
 * tipo LLM; es rápido, explicable, gratis y privado (todo corre en el servidor).
 *
 * Diseñado como capa aislada: si en el futuro se cambia a embeddings semánticos,
 * basta sustituir `vectorize`/`similarity` sin tocar las rutas.
 */

// Palabras vacías del español (no aportan significado para la comparación).
const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'ante',
  'con', 'en', 'por', 'para', 'sin', 'sobre', 'tras', 'y', 'o', 'u', 'e', 'que', 'se',
  'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'lo', 'le', 'les', 'me', 'te', 'nos', 'es',
  'son', 'fue', 'era', 'ser', 'estar', 'esta', 'este', 'esto', 'esa', 'ese', 'eso',
  'como', 'mas', 'muy', 'ya', 'si', 'no', 'cerca', 'dentro', 'donde', 'cuando',
  'perdi', 'perdido', 'perdida', 'encontre', 'encontrado', 'encontrada', 'busco',
  'objeto', 'cosa', 'algo',
]);

// Sinónimos del dominio (se normalizan a una forma canónica para que "billetera"
// y "cartera" coincidan). Clave = variante, valor = término canónico.
const SYNONYMS: Record<string, string> = {
  billetera: 'cartera',
  monedero: 'cartera',
  portafolio: 'cartera',
  celular: 'telefono',
  movil: 'telefono',
  smartphone: 'telefono',
  iphone: 'telefono',
  audifonos: 'auriculares',
  audifono: 'auriculares',
  cascos: 'auriculares',
  earbuds: 'auriculares',
  anteojos: 'lentes',
  gafas: 'lentes',
  espejuelos: 'lentes',
  sueter: 'sueter',
  chamarra: 'chaqueta',
  campera: 'chaqueta',
  saco: 'chaqueta',
  mochila: 'bolso',
  bolsa: 'bolso',
  morral: 'bolso',
  sombrilla: 'paraguas',
  llavero: 'llaves',
  llave: 'llaves',
  computadora: 'laptop',
  ordenador: 'laptop',
  portatil: 'laptop',
  reloj: 'reloj',
  cargador: 'cargador',
  termo: 'botella',
  botella: 'botella',
};

/** Quita acentos/diacríticos. */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Stemming ligero del español: recorta plurales y sufijos comunes. */
function stem(word: string): string {
  let w = word;
  if (w.length > 4 && (w.endsWith('es'))) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1);
  // sufijos frecuentes
  for (const suf of ['mente', 'cion', 'ciones', 'dad', 'oso', 'osa']) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}

/** Convierte un texto en una lista de tokens normalizados. */
export function tokenize(text: string): string[] {
  const clean = stripAccents((text || '').toLowerCase())
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const out: string[] = [];
  for (const raw of clean) {
    if (raw.length < 2) continue;
    const canonical = SYNONYMS[raw] ?? raw;
    if (STOPWORDS.has(canonical)) continue;
    out.push(stem(canonical));
  }
  return out;
}

/** Vector de frecuencias de término (bag of words) de un texto. */
export type TermFreq = Map<string, number>;

export function termFreq(text: string): TermFreq {
  const tf: TermFreq = new Map();
  for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/**
 * Índice TF-IDF sobre un corpus de documentos. Calcula el IDF una vez y permite
 * vectorizar documentos/consultas y compararlos por similitud de coseno.
 */
export class TfIdfIndex {
  private idf = new Map<string, number>();
  private docCount = 0;

  /** Construye el IDF a partir de los textos del corpus. */
  constructor(corpus: string[]) {
    this.docCount = corpus.length || 1;
    const df = new Map<string, number>();
    for (const doc of corpus) {
      const seen = new Set(tokenize(doc));
      for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
    }
    for (const [term, freq] of df) {
      // IDF suavizado
      this.idf.set(term, Math.log((this.docCount + 1) / (freq + 1)) + 1);
    }
  }

  /** Vector TF-IDF (término -> peso) de un texto. */
  vectorize(text: string): Map<string, number> {
    const tf = termFreq(text);
    const vec = new Map<string, number>();
    const total = Array.from(tf.values()).reduce((a, b) => a + b, 0) || 1;
    for (const [term, count] of tf) {
      const idf = this.idf.get(term) ?? Math.log(this.docCount + 1) + 1;
      vec.set(term, (count / total) * idf);
    }
    return vec;
  }
}

/** Similitud de coseno entre dos vectores dispersos (Map término->peso). 0..1 */
export function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  // Itera sobre el vector más corto.
  const [short, long] = a.size < b.size ? [a, b] : [b, a];
  for (const [term, weight] of short) {
    const other = long.get(term);
    if (other) dot += weight * other;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
