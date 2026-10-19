import { prisma } from '../db.js';
import { matchItems, type MatchableItem } from './matching.js';
import { notify } from './notify.js';
import { parseSignature } from './visual.js';

// Umbral mínimo para avisar automáticamente al dueño del reporte perdido.
const AUTO_NOTIFY_THRESHOLD = 55;

interface LostLike {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  lostAt: Date;
  reporterId: string;
  imageSignature?: string | null;
}

/**
 * Busca coincidencias de un objeto perdido entre los encontrados disponibles y,
 * si la mejor supera el umbral, crea una notificación MATCH_FOUND para el dueño.
 * Devuelve la mejor coincidencia (o null). No lanza si no hay candidatos.
 */
export async function notifyBestMatchForLost(lost: LostLike): Promise<{
  foundItemId: string;
  score: number;
} | null> {
  const found = await prisma.foundItem.findMany({
    where: { status: { in: ['PUBLISHED', 'CLAIMED'] } },
    select: {
      id: true, title: true, description: true, category: true, location: true,
      foundAt: true, imageSignature: true,
    },
  });
  if (found.length === 0) return null;

  const reference: MatchableItem = {
    id: lost.id,
    title: lost.title,
    description: lost.description,
    category: lost.category,
    location: lost.location,
    date: lost.lostAt,
    signature: parseSignature(lost.imageSignature),
  };
  const candidates: MatchableItem[] = found.map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description,
    category: f.category,
    location: f.location,
    date: f.foundAt,
    signature: parseSignature(f.imageSignature),
  }));

  const [best] = matchItems(reference, candidates, { limit: 1, minScore: AUTO_NOTIFY_THRESHOLD });
  if (!best) return null;

  const foundItem = found.find((f) => f.id === best.item.id)!;
  await notify({
    userId: lost.reporterId,
    type: 'MATCH_FOUND',
    title: 'Posible coincidencia encontrada',
    body: `Encontramos un objeto que podría ser tu "${lost.title}": "${foundItem.title}" (${best.score}% de coincidencia). Revísalo.`,
    relatedItemId: best.item.id,
  });

  return { foundItemId: best.item.id, score: best.score };
}
