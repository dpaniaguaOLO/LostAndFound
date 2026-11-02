/**
 * Puntos y ranking del juego (equivale a game_stats(), leaderboard() y
 * player_profile() de las migraciones 016-017 de Supabase). Reglas en POINT_RULES
 * de @laf/shared: mantener las tres implementaciones sincronizadas.
 *
 * Se calcula sobre todos los objetos en cada consulta: suficiente para una app
 * interna (cientos o pocos miles de objetos). Si crece, cachear o pasar a SQL.
 */
import { prisma } from '../db.js';
import { signUploadUrl } from './fileUrls.js';

// Copia de POINT_RULES / FAST_RETURN_HOURS / LEADERBOARD_MAX / TOP_PLAYERS de
// @laf/shared (el backend no depende del paquete compartido).
const POINTS = { published: 50, returned: 100, fast: 50 };
const FAST_MS = 24 * 3600_000;
export const LEADERBOARD_MAX = 100;
export const TOP_PLAYERS = 3;

type PlayerStats = {
  published: number;
  publishedWithPhoto: number;
  returned: number;
  fastReturned: number;
  categories: number;
  activeMonths: number;
};
type PlayerSummary = { id: string; name: string; avatarUrl: string | null; points: number; rank: number | null; stats: PlayerStats; equippedFrame: string | null };
type Scored = { id: string; name: string; avatarUrl: string | null; equippedFrame: string | null; points: number; stats: PlayerStats };

/** Estadísticas y puntos de todos los usuarios, ordenados como el ranking. */
async function scoreAll(): Promise<Scored[]> {
  const [users, items] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, avatarUrl: true, equippedFrame: true } }),
    prisma.foundItem.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: {
        reporterId: true,
        status: true,
        category: true,
        imageUrl: true,
        createdAt: true,
        returnedAt: true,
        claims: { where: { status: 'APPROVED' }, select: { claimantId: true } },
      },
    }),
  ]);
  const acc = new Map(
    users.map((u) => [u.id, { published: 0, publishedWithPhoto: 0, returned: 0, fastReturned: 0, cats: new Set<string>(), months: new Set<string>() }]),
  );
  for (const it of items) {
    const s = acc.get(it.reporterId);
    if (!s) continue;
    s.published++;
    if (it.imageUrl) s.publishedWithPhoto++;
    // Solo con una reclamación aprobada de otra persona (no se puede "devolver" a uno mismo).
    const ok = it.status === 'RETURNED' && it.claims.some((c) => c.claimantId !== it.reporterId);
    if (!ok) continue;
    s.returned++;
    s.cats.add(it.category);
    if (it.returnedAt) {
      s.months.add(`${it.returnedAt.getUTCFullYear()}-${it.returnedAt.getUTCMonth()}`);
      if (it.returnedAt.getTime() - it.createdAt.getTime() <= FAST_MS) s.fastReturned++;
    }
  }
  return users
    .map((u) => {
      const { cats, months, ...rest } = acc.get(u.id)!;
      const stats: PlayerStats = { ...rest, categories: cats.size, activeMonths: months.size };
      const points = POINTS.published * stats.published + POINTS.returned * stats.returned + POINTS.fast * stats.fastReturned;
      return { ...u, stats, points };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Puesto con empates (como rank() de SQL): 1 + cuántos tienen más puntos. Null sin puntos. */
function rankOf(all: Scored[], points: number): number | null {
  return points > 0 ? all.filter((o) => o.points > points).length + 1 : null;
}

function toSummary(all: Scored[], s: Scored): PlayerSummary {
  return {
    id: s.id,
    name: s.name,
    avatarUrl: signUploadUrl(s.avatarUrl),
    points: s.points,
    rank: rankOf(all, s.points),
    stats: s.stats,
    equippedFrame: s.equippedFrame,
  };
}

/** Página del ranking (solo quien tiene puntos, nunca más allá del puesto 100). */
export async function leaderboard(offset: number, limit: number): Promise<{ entries: PlayerSummary[]; hasMore: boolean }> {
  const all = await scoreAll();
  const ranked = all.filter((s) => s.points > 0).slice(0, LEADERBOARD_MAX);
  const page = ranked.slice(offset, offset + limit);
  return { entries: page.map((s) => toSummary(all, s)), hasMore: offset + limit < ranked.length };
}

/** Ids de los primeros TOP_PLAYERS del ranking, en orden. */
export async function topPlayerIds(): Promise<string[]> {
  return (await scoreAll()).filter((s) => s.points > 0).slice(0, TOP_PLAYERS).map((s) => s.id);
}

/** Resumen de un usuario (null si no existe). */
export async function playerSummary(userId: string): Promise<PlayerSummary | null> {
  const all = await scoreAll();
  const me = all.find((s) => s.id === userId);
  return me ? toSummary(all, me) : null;
}
