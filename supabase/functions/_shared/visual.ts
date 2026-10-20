/**
 * Comparación de firmas visuales — port a Deno (matemática pura, sin sharp).
 * La GENERACIÓN de la firma (dHash + histograma con sharp) sigue en el backend/
 * cliente al subir la imagen; aquí solo se comparan firmas ya guardadas.
 * Copia fiel de la parte de comparación de backend/src/lib/visual.ts.
 */

export interface VisualSignature {
  hash: string; // 16 hex chars = 64 bits (dHash)
  color: number[]; // histograma de color aplanado (4x4 x 3 canales = 48)
}

export function parseSignature(raw: unknown): VisualSignature | null {
  if (!raw) return null;
  try {
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof s?.hash === 'string' && Array.isArray(s?.color)) return s as VisualSignature;
    return null;
  } catch {
    return null;
  }
}

/** Distancia de Hamming entre dos dHash en hex (0..64). */
function hammingHex(a: string, b: string): number {
  let dist = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/** Similitud de histogramas de color (0..1). */
function colorSim(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] - b[i]) / 255;
    sum += d * d;
  }
  const rms = Math.sqrt(sum / a.length);
  return Math.max(0, 1 - rms);
}

/** Similitud visual total entre dos firmas (0..1). */
export function visualSimilarity(a: VisualSignature, b: VisualSignature): number {
  const structural = 1 - hammingHex(a.hash, b.hash) / 64;
  const chroma = colorSim(a.color, b.color);
  return 0.45 * structural + 0.55 * chroma;
}
