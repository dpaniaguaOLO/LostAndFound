/**
 * Búsqueda visual ligera (sin modelos pesados ni servicios externos).
 *
 * Genera una "firma visual" de una imagen combinando:
 *  - dHash (perceptual hash, 64 bits): captura la estructura/forma general.
 *  - Histograma de color en una rejilla: captura el color dominante por zonas.
 *
 * Todo se calcula con `sharp` (procesamiento nativo, milisegundos por imagen,
 * sin GPU). La firma se serializa a string para guardarla junto al objeto.
 *
 * Capa aislada: `computeSignature` y `visualSimilarity` son el único contrato.
 * En el futuro se puede sustituir por embeddings de un modelo (CLIP/MobileNet)
 * sin cambiar el resto de la app.
 */
import sharp from 'sharp';

export interface VisualSignature {
  hash: string; // 16 hex chars = 64 bits (dHash)
  color: number[]; // histograma de color aplanado (rejilla 4x4 x 3 canales = 48)
}

const GRID = 4; // rejilla 4x4 para el histograma de color

/** Calcula la firma visual de una imagen (buffer o ruta). */
export async function computeSignature(input: string | Buffer): Promise<VisualSignature> {
  const img = sharp(input, { failOn: 'none' }).removeAlpha();

  // --- dHash: 9x8 en gris, compara píxeles adyacentes ---
  const w = 9;
  const h = 8;
  const gray = await img
    .clone()
    .grayscale()
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer();

  let bits = '';
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w - 1; col++) {
      const left = gray[row * w + col];
      const right = gray[row * w + col + 1];
      bits += left < right ? '1' : '0';
    }
  }
  // 64 bits -> 16 hex
  let hash = '';
  for (let i = 0; i < 64; i += 4) {
    hash += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }

  // --- Histograma de color: promedio RGB por celda de una rejilla GRIDxGRID ---
  const size = GRID * GRID;
  const { data, info } = await img
    .clone()
    .resize(GRID, GRID, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels; // 3 (sin alpha)
  const color: number[] = [];
  for (let i = 0; i < size; i++) {
    const base = i * channels;
    color.push(data[base] ?? 0, data[base + 1] ?? 0, data[base + 2] ?? 0);
  }

  return { hash, color };
}

/** Serializa/deserializa la firma para guardarla en la base de datos. */
export function serializeSignature(sig: VisualSignature): string {
  return JSON.stringify(sig);
}
export function parseSignature(raw: string | null | undefined): VisualSignature | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (typeof s?.hash === 'string' && Array.isArray(s?.color)) return s;
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

/** Similitud de histogramas de color (0..1) por distancia euclídea normalizada. */
function colorSim(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] - b[i]) / 255;
    sum += d * d;
  }
  const rms = Math.sqrt(sum / a.length); // 0..1
  return Math.max(0, 1 - rms);
}

/**
 * Similitud visual total entre dos firmas (0..1).
 * Combina estructura (dHash) y color. Pondera algo más el color porque para
 * objetos cotidianos distingue mejor (cartera café vs teléfono negro).
 */
export function visualSimilarity(a: VisualSignature, b: VisualSignature): number {
  const structural = 1 - hammingHex(a.hash, b.hash) / 64; // 0..1
  const chroma = colorSim(a.color, b.color);
  return 0.45 * structural + 0.55 * chroma;
}
