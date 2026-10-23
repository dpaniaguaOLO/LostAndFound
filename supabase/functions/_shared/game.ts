/**
 * Reglas del juego para Olivia (puntos, rangos, insignias, ventajas del top 3).
 *
 * Copia de la lógica de @laf/shared (packages/shared/src/index.ts): las Edge
 * Functions se despliegan solas y no pueden importar el paquete. MANTENER EN
 * SINCRONÍA: supabase/tests/assistant.test.mjs compara esta copia con el original
 * y falla si difieren. Los puntos y estadísticas los calcula la BD (game_stats()).
 */

export interface PlayerStats {
  published: number;
  publishedWithPhoto: number;
  returned: number;
  fastReturned: number;
  categories: number;
  activeMonths: number;
}

export const POINT_RULES = [
  { key: 'published', points: 50, title: 'Publicas un objeto encontrado', description: 'Por cada objeto encontrado que publicas en el muro. Si lo eliminas o un administrador lo archiva, se descuentan.' },
  { key: 'returned', points: 100, title: 'Lo devuelves a su dueño', description: 'Alguien lo reclama, apruebas la reclamación y lo marcas como devuelto.' },
  { key: 'fast', points: 50, title: 'Entrega rápida', description: 'Extra si lo devuelves en menos de 24 horas desde que lo publicaste.' },
] as const;

export const TOP_PLAYERS = 3;
export const LEADERBOARD_MAX = 100;

export const BADGE_FRAMES = ['Bronce', 'Plata', 'Oro', 'Esmeralda', 'Zafiro', 'Rubí', 'Leyenda'] as const;

export interface BadgeDef {
  id: string;
  name: string;
  emoji: string;
  stat: keyof PlayerStats | 'allBadges';
  levels: readonly number[];
  goal: (n: number) => string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const BASE_BADGES: readonly BadgeDef[] = [
  { id: 'first_return', name: 'Primera devolución', emoji: '🎉', stat: 'returned', levels: [1], goal: () => 'Devuelve tu primer objeto a su dueño' },
  { id: 'first_find', name: 'Primer hallazgo', emoji: '🌟', stat: 'published', levels: [1], goal: () => 'Publica tu primer objeto encontrado' },
  { id: 'samaritan', name: 'Buen samaritano', emoji: '🤝', stat: 'returned', levels: [5, 15, 25, 50, 75, 100], goal: (n) => `Devuelve ${n} objetos a sus dueños` },
  { id: 'lightning', name: 'Rayo', emoji: '⚡', stat: 'fastReturned', levels: [1, 3, 10, 25, 50], goal: (n) => `Devuelve ${n} ${plural(n, 'objeto', 'objetos')} en menos de 24 horas` },
  { id: 'hawk_eye', name: 'Ojo de halcón', emoji: '🔍', stat: 'published', levels: [5, 15, 30, 50, 100], goal: (n) => `Publica ${n} objetos encontrados` },
  { id: 'photographer', name: 'Fotógrafo', emoji: '📸', stat: 'publishedWithPhoto', levels: [1, 10, 25, 50], goal: (n) => `Publica ${n} ${plural(n, 'objeto encontrado', 'objetos encontrados')} con foto` },
  { id: 'all_terrain', name: 'Todoterreno', emoji: '🧭', stat: 'categories', levels: [2, 4, 6, 9], goal: (n) => (n >= 9 ? 'Devuelve objetos de todas las categorías' : `Devuelve objetos de ${n} categorías distintas`) },
  { id: 'constant', name: 'Constante', emoji: '📅', stat: 'activeMonths', levels: [2, 3, 6, 12], goal: (n) => `Devuelve objetos en ${n} meses distintos` },
];

export const ULTIMATE_BADGE: BadgeDef = {
  id: 'olo_legend',
  name: 'Leyenda de OLO',
  emoji: '👑',
  stat: 'allBadges',
  levels: [BASE_BADGES.length],
  goal: (n) => `Lleva todas las demás insignias (${n}) a su nivel máximo`,
};

export const BADGES: readonly BadgeDef[] = [ULTIMATE_BADGE, ...BASE_BADGES];

export function badgeProgress(badge: BadgeDef, stats: PlayerStats) {
  const value =
    badge.stat === 'allBadges'
      ? BASE_BADGES.filter((b) => badgeProgress(b, stats).maxed).length
      : (stats[badge.stat] ?? 0);
  const level = badge.levels.filter((t) => value >= t).length;
  const next = badge.levels[level] ?? null;
  return { badge, level, value, next, maxed: next === null };
}

export type FrameId = 'bronze' | 'silver' | 'gold' | 'emerald' | 'ruby' | 'diamond';

export interface RankDef {
  id: string;
  name: string;
  min: number;
  frame: FrameId | null;
  banner?: boolean;
}

export const RANKS: readonly RankDef[] = [
  { id: 'novato', name: 'Novato', min: 0, frame: null },
  { id: 'explorador', name: 'Explorador', min: 250, frame: 'bronze' },
  { id: 'rastreador', name: 'Rastreador', min: 750, frame: 'silver' },
  { id: 'detective', name: 'Detective', min: 1500, frame: 'gold' },
  { id: 'experto', name: 'Experto', min: 3000, frame: 'emerald' },
  { id: 'maestro', name: 'Maestro', min: 6000, frame: 'ruby', banner: true },
  { id: 'gran_maestro', name: 'Gran Maestro', min: 10000, frame: 'diamond', banner: true },
];

export const FRAME_NAMES: Record<FrameId, string> = {
  bronze: 'Bronce', silver: 'Plata', gold: 'Oro', emerald: 'Esmeralda', ruby: 'Rubí', diamond: 'Diamante',
};

export function rankFor(points: number): RankDef {
  return [...RANKS].reverse().find((r) => points >= r.min) ?? RANKS[0];
}

export function nextRank(points: number): RankDef | null {
  return RANKS.find((r) => r.min > points) ?? null;
}

/** Lo que desbloquea un rango, en texto (mismo criterio que la app). */
export function rankUnlocks(r: RankDef): string[] {
  return [
    r.frame && `marco ${FRAME_NAMES[r.frame]}`,
    r.banner && 'fondo especial en el perfil',
    r.min >= 1500 && 'nombre con color en el ranking',
  ].filter(Boolean) as string[];
}
