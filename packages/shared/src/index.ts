/**
 * @laf/shared
 * Fuente única de verdad para los tipos y contratos compartidos entre
 * el frontend (Kiro) y el backend (Claude).
 *
 * Mantener sincronizado con:
 *  - backend/prisma/schema.prisma (modelo de datos)
 *  - CLAUDE.md (contratos de API)
 */

// ---------------------------------------------------------------------------
// Enumeraciones / estados
// ---------------------------------------------------------------------------

/** Roles de usuario. Determinan permisos en el servidor. */
export type UserRole = 'EMPLOYEE' | 'ADMIN';

/** Estado de un objeto encontrado publicado en el muro. */
export type FoundItemStatus =
  | 'PUBLISHED' // visible en el muro, sin reclamaciones aprobadas
  | 'CLAIMED' // una reclamación fue aprobada; pendiente de entrega
  | 'RETURNED' // entregado a su dueño; archivado en el historial
  | 'ARCHIVED'; // retirado del muro por un administrador

/** Estado de un reporte de objeto perdido. */
export type LostReportStatus =
  | 'OPEN' // búsqueda activa
  | 'MATCHED' // vinculado a un objeto encontrado
  | 'RESOLVED' // el dueño recuperó el objeto
  | 'CLOSED'; // cerrado sin resolución

/** Estado de una solicitud de reclamación. */
export type ClaimStatus =
  | 'PENDING' // esperando revisión
  | 'APPROVED' // aprobada; coordinar entrega
  | 'REJECTED' // rechazada por el revisor
  | 'CANCELLED'; // cancelada por quien reclamó

/** Tipos de notificación en la interfaz. */
export type NotificationType =
  | 'CLAIM_REQUESTED'
  | 'CLAIM_APPROVED'
  | 'CLAIM_REJECTED'
  | 'ITEM_RETURNED'
  | 'MATCH_FOUND' // la IA detectó un objeto encontrado que coincide con uno perdido
  | 'SYSTEM';

/** Categorías sugeridas para clasificar objetos. */
export const ITEM_CATEGORIES = [
  'ELECTRONICS',
  'CLOTHING',
  'ACCESSORIES',
  'DOCUMENTS',
  'KEYS',
  'BAGS',
  'WALLET',
  'JEWELRY',
  'OTHER',
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Entidades (forma pública expuesta por la API, sin campos sensibles)
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  employeeId: string; // número de colaborador (identificador de acceso)
  email: string | null;
  role: UserRole;
  active: boolean; // false = desactivado (no puede iniciar sesión; conserva su historial)
  createdAt: string; // ISO 8601
  /** Foto de perfil (URL firmada) o null. Opcional: no lo envían APIs antiguas. */
  avatarUrl?: string | null;
}

export interface FoundItem {
  id: string;
  title: string;
  description: string;
  category: ItemCategory;
  location: string;
  foundAt: string; // ISO 8601 — fecha en que se encontró
  imageUrl: string | null;
  status: FoundItemStatus;
  /** Cuándo se marcó como devuelto (null si no lo está). Opcional: no lo envían APIs antiguas. */
  returnedAt?: string | null;
  reporter: Pick<User, 'id' | 'name'>;
  createdAt: string;
  updatedAt: string;
}

export interface LostReport {
  id: string;
  title: string;
  description: string;
  category: ItemCategory;
  location: string;
  lostAt: string; // ISO 8601
  imageUrl: string | null;
  status: LostReportStatus;
  reporter: Pick<User, 'id' | 'name'>;
  /** Destacado arriba del muro porque su autor está en el top 3 del ranking (solo en listados). */
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Claim {
  id: string;
  foundItemId: string;
  /** `reporterName`: quien encontró el objeto (para coordinar la entrega). */
  foundItem?: Pick<FoundItem, 'id' | 'title' | 'imageUrl' | 'status'> & { reporterId?: string; reporterName?: string };
  /** Reporte de perdido del reclamante al que corresponde (Supabase; se resuelve al entregar). */
  lostReportId?: string | null;
  claimant: Pick<User, 'id' | 'name'>;
  message: string;
  status: ClaimStatus;
  reviewerId: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  relatedItemId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Contratos de petición (request bodies)
// ---------------------------------------------------------------------------

export interface LoginRequest {
  employeeId: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  employeeId: string;
  password: string;
  email?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CreateFoundItemRequest {
  title: string;
  description: string;
  category: ItemCategory;
  location: string;
  foundAt: string; // ISO 8601
  // La imagen se envía como multipart/form-data en el campo "image".
}

export interface CreateLostReportRequest {
  title: string;
  description: string;
  category: ItemCategory;
  location?: string; // opcional: a veces no se sabe dónde se perdió
  lostAt: string; // ISO 8601
}

export interface CreateClaimRequest {
  foundItemId: string;
  message: string;
}

export interface ReviewClaimRequest {
  status: Extract<ClaimStatus, 'APPROVED' | 'REJECTED'>;
  reviewNote?: string;
}

// ---------------------------------------------------------------------------
// Contratos de respuesta genéricos
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Parámetros de consulta del muro de objetos encontrados. */
export interface FoundItemsQuery {
  search?: string;
  category?: ItemCategory;
  status?: FoundItemStatus;
  location?: string;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Búsqueda inteligente y emparejado (IA local, sin servicios externos)
// ---------------------------------------------------------------------------

/** Desglose de cada señal de coincidencia (0..100). `image` null si no aplica. */
export interface MatchBreakdown {
  text: number;
  image: number | null;
  category: number;
  location: number;
  date: number;
}

/** Un objeto encontrado acompañado de su puntaje de relevancia/coincidencia. */
export interface ScoredFoundItem {
  item: FoundItem;
  score: number; // 0..100
  reasons: string[]; // motivos legibles de la coincidencia (puede ir vacío en búsqueda)
  breakdown?: MatchBreakdown; // desglose por señal (presente en emparejado)
}

/** El objeto perdido de referencia, para comparar lado a lado en la vista. */
export interface MatchReference {
  id: string;
  title: string;
  category: ItemCategory;
  location: string;
  imageUrl: string | null;
}

/** Petición de búsqueda semántica en lenguaje natural. */
export interface SemanticSearchRequest {
  query: string;
  limit?: number;
}

/** Respuesta de búsqueda semántica. */
export interface SemanticSearchResponse {
  query: string;
  results: ScoredFoundItem[];
}

/** Respuesta de sugerencias de coincidencia para un objeto perdido. */
export interface MatchSuggestionsResponse {
  lostReportId: string;
  reference: MatchReference; // el objeto perdido (para comparar lado a lado)
  suggestions: ScoredFoundItem[];
}

/** Pregunta al asistente de búsqueda. */
export interface AssistantRequest {
  question: string;
}

/** Respuesta del asistente: texto legible + items reales que la respaldan. */
/** Turno previo del chat que el cliente envía como contexto (máx. 6, recortados). */
export interface AssistantTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantResponse {
  answer: string;
  /** 'chat' = charla o fuera de tema (sin tarjetas de objetos). */
  kind: 'found' | 'lost' | 'chat';
  foundItems: FoundItem[];
  lostReports: LostReport[];
}

// ---------------------------------------------------------------------------
// Auditoría (panel de administración)
// ---------------------------------------------------------------------------

export type AuditAction =
  | 'FOUND_ITEM_EDITED'
  | 'FOUND_ITEM_ARCHIVED'
  | 'FOUND_ITEM_DELETED'
  | 'FOUND_ITEM_RETURNED'
  | 'FOUND_ITEM_RESTORED'
  | 'LOST_REPORT_EDITED'
  | 'LOST_REPORT_DELETED'
  | 'LOST_REPORT_RESOLVED'
  | 'LOST_REPORT_CLOSED'
  | 'LOST_REPORT_RESTORED'
  | 'CLAIM_REVIEWED'
  | 'USER_ROLE_CHANGED'
  | 'USER_PASSWORD_RESET'
  | 'USER_CREATED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED';

/** Objetos retirados de circulación, para la vista de moderación del admin. */
export interface ArchivedResponse {
  found: FoundItem[]; // encontrados en estado ARCHIVED
  lost: LostReport[]; // perdidos en estado CLOSED
}

export interface AuditEntry {
  id: string;
  action: AuditAction;
  entityType: 'FoundItem' | 'LostReport' | 'Claim' | 'User';
  entityId: string;
  summary: string;
  actor: Pick<User, 'id' | 'name'>;
  createdAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Juego: puntos, insignias y ranking (rama features/game)
// ---------------------------------------------------------------------------
//
// Los puntos y las estadísticas los calcula SIEMPRE el servidor a partir de los
// datos reales (nadie puede escribirlos): función SQL game_stats() en Supabase
// (migración 017) y backend/src/lib/game.ts en Express. Si cambian las reglas de
// POINT_RULES o las estadísticas hay que cambiar también esos dos sitios.
// Las insignias se derivan de las estadísticas aquí, en un único lugar.

/**
 * Estadísticas de un colaborador. Solo cuentan objetos encontrados no archivados.
 * Una devolución es válida si el objeto quedó RETURNED con una reclamación
 * aprobada de otra persona.
 */
export interface PlayerStats {
  published: number; // objetos encontrados publicados
  publishedWithPhoto: number; // ...de ellos, con foto
  returned: number; // devoluciones válidas
  fastReturned: number; // devoluciones válidas en ≤ FAST_RETURN_HOURS desde que se publicó
  categories: number; // categorías distintas entre las devoluciones válidas
  activeMonths: number; // meses distintos con alguna devolución válida
}

/** Reglas de puntos. `key` identifica la regla en el servidor. */
export const POINT_RULES = [
  { key: 'published', points: 50, title: 'Publicas un objeto encontrado', description: 'Por cada objeto encontrado que publicas en el muro. Si lo eliminas o un administrador lo archiva, se descuentan.' },
  { key: 'returned', points: 100, title: 'Lo devuelves a su dueño', description: 'Alguien lo reclama, apruebas la reclamación y lo marcas como devuelto.' },
  { key: 'fast', points: 50, title: 'Entrega rápida', description: 'Extra si lo devuelves en menos de 24 horas desde que lo publicaste.' },
] as const;
export const FAST_RETURN_HOURS = 24;

/**
 * Marcos de las insignias por nivel (como la maestría de cartas de Clash Royale):
 * cada nivel mejora el marco. Índice = nivel - 1.
 */
export const BADGE_FRAMES = ['Bronce', 'Plata', 'Oro', 'Esmeralda', 'Zafiro', 'Rubí', 'Leyenda'] as const;

export interface BadgeDef {
  id: string;
  name: string;
  emoji: string;
  /** Estadística que hace subir de nivel la insignia ('allBadges' = insignias al máximo). */
  stat: keyof PlayerStats | 'allBadges';
  /** Umbral de cada nivel (nivel 1 = levels[0]). Máximo BADGE_FRAMES.length niveles; uno solo = hito. */
  levels: readonly number[];
  /** Objetivo legible para alcanzar `n`. */
  goal: (n: number) => string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Insignias normales (las que cuentan para la definitiva). */
const BASE_BADGES: readonly BadgeDef[] = [
  // Hitos de un solo nivel (insignias aparte de las que suben de nivel).
  { id: 'first_return', name: 'Primera devolución', emoji: '🎉', stat: 'returned', levels: [1], goal: () => 'Devuelve tu primer objeto a su dueño' },
  { id: 'first_find', name: 'Primer hallazgo', emoji: '🌟', stat: 'published', levels: [1], goal: () => 'Publica tu primer objeto encontrado' },
  {
    id: 'samaritan', name: 'Buen samaritano', emoji: '🤝', stat: 'returned', levels: [5, 15, 25, 50, 75, 100],
    goal: (n) => `Devuelve ${n} objetos a sus dueños`,
  },
  {
    id: 'lightning', name: 'Rayo', emoji: '⚡', stat: 'fastReturned', levels: [1, 3, 10, 25, 50],
    goal: (n) => `Devuelve ${n} ${plural(n, 'objeto', 'objetos')} en menos de 24 horas`,
  },
  {
    id: 'hawk_eye', name: 'Ojo de halcón', emoji: '🔍', stat: 'published', levels: [5, 15, 30, 50, 100],
    goal: (n) => `Publica ${n} objetos encontrados`,
  },
  {
    id: 'photographer', name: 'Fotógrafo', emoji: '📸', stat: 'publishedWithPhoto', levels: [1, 10, 25, 50],
    goal: (n) => `Publica ${n} ${plural(n, 'objeto encontrado', 'objetos encontrados')} con foto`,
  },
  {
    id: 'all_terrain', name: 'Todoterreno', emoji: '🧭', stat: 'categories', levels: [2, 4, 6, 9],
    goal: (n) => (n >= 9 ? 'Devuelve objetos de todas las categorías' : `Devuelve objetos de ${n} categorías distintas`),
  },
  {
    id: 'constant', name: 'Constante', emoji: '📅', stat: 'activeMonths', levels: [2, 3, 6, 12],
    goal: (n) => `Devuelve objetos en ${n} meses distintos`,
  },
];

/** La insignia definitiva: se consigue al llevar todas las demás a su nivel máximo. */
export const ULTIMATE_BADGE: BadgeDef = {
  id: 'olo_legend',
  name: 'Leyenda de OLO',
  emoji: '👑',
  stat: 'allBadges',
  levels: [BASE_BADGES.length],
  goal: (n) => `Lleva todas las demás insignias (${n}) a su nivel máximo`,
};

/** Catálogo de insignias. Orden = orden de la colección (la definitiva, la primera). */
export const BADGES: readonly BadgeDef[] = [ULTIMATE_BADGE, ...BASE_BADGES];

export interface BadgeProgress {
  badge: BadgeDef;
  level: number; // 0 = aún bloqueada
  value: number; // valor actual de la estadística
  next: number | null; // umbral del siguiente nivel (null = nivel máximo)
  maxed: boolean;
}

export function badgeProgress(badge: BadgeDef, stats: PlayerStats): BadgeProgress {
  const value =
    badge.stat === 'allBadges'
      ? BASE_BADGES.filter((b) => badgeProgress(b, stats).maxed).length
      : (stats[badge.stat] ?? 0);
  const level = badge.levels.filter((t) => value >= t).length;
  const next = badge.levels[level] ?? null;
  return { badge, level, value, next, maxed: next === null };
}

/** Progreso de toda la colección, en el orden del catálogo. */
export function badgeCollection(stats: PlayerStats): BadgeProgress[] {
  return BADGES.map((b) => badgeProgress(b, stats));
}

/** Insignias para exhibir (como el escaparate del perfil de Clash Royale): las de mayor nivel primero. */
export function showcaseBadges(stats: PlayerStats, n = 8): BadgeProgress[] {
  return badgeCollection(stats)
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.level > 0)
    // La definitiva siempre la primera; después, las de mayor nivel.
    .sort((a, b) => Number(b.p.badge === ULTIMATE_BADGE) - Number(a.p.badge === ULTIMATE_BADGE) || b.p.level - a.p.level || a.i - b.i)
    .slice(0, n)
    .map((x) => x.p);
}

/** Las `n` mejores insignias (para el ranking). */
export const bestBadges = (stats: PlayerStats, n = 3) => showcaseBadges(stats, n);

/** Los primeros puestos del ranking tienen ventajas (emblema y perdidos destacados). */
export const TOP_PLAYERS = 3;

// ---------------------------------------------------------------------------
// Rangos por puntos y marcos de la foto
// ---------------------------------------------------------------------------
//
// Cada rango se alcanza al llegar a `min` puntos y desbloquea un marco para la
// foto (y, desde Maestro, un fondo especial en el perfil). El marco que alguien
// lleva se guarda en su perfil (equipped_frame), pero SOLO se muestra si está
// desbloqueado según sus puntos reales (displayedFrame): elegir uno no ganado no
// tiene efecto.

export type FrameId = 'bronze' | 'silver' | 'gold' | 'emerald' | 'ruby' | 'diamond';

export interface RankDef {
  id: string;
  name: string;
  min: number; // puntos para alcanzarlo
  frame: FrameId | null;
  /** Desbloquea el fondo especial en la cabecera del perfil. */
  banner?: boolean;
}

/** Escalera de rangos (orden ascendente). */
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

/** Rango actual para unos puntos. */
export function rankFor(points: number): RankDef {
  return [...RANKS].reverse().find((r) => points >= r.min) ?? RANKS[0];
}

/** Siguiente rango (null si ya es el máximo). */
export function nextRank(points: number): RankDef | null {
  return RANKS.find((r) => r.min > points) ?? null;
}

export function frameUnlocked(frame: FrameId, points: number): boolean {
  return RANKS.some((r) => r.frame === frame && points >= r.min);
}

/**
 * Marco que alguien lleva puesto (lo guardado en su perfil).
 * null = automático (el mejor desbloqueado); 'none' = sin marco.
 */
export type EquippedFrame = FrameId | 'none' | null;

/** Marco que se muestra de verdad: el elegido si está desbloqueado; si no, el automático. */
export function displayedFrame(p: { points: number; equippedFrame?: EquippedFrame }): FrameId | null {
  if (p.equippedFrame === 'none') return null;
  if (p.equippedFrame && frameUnlocked(p.equippedFrame, p.points)) return p.equippedFrame;
  return [...RANKS].reverse().find((r) => r.frame && p.points >= r.min)?.frame ?? null;
}

/** Colaborador en el ranking o en un perfil. `rank` null = aún sin puntos. */
export interface PlayerSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  rank: number | null;
  stats: PlayerStats;
  /** Marco elegido (puede faltar en APIs antiguas = automático). */
  equippedFrame?: EquippedFrame;
}


export interface PlayerProfile extends PlayerSummary {
  role: UserRole;
  createdAt: string; // ISO 8601
}

/** El ranking solo muestra el top LEADERBOARD_MAX, en páginas de LEADERBOARD_PAGE. */
export const LEADERBOARD_MAX = 100;
export const LEADERBOARD_PAGE = 30;

export interface LeaderboardPage {
  entries: PlayerSummary[];
  hasMore: boolean;
}
