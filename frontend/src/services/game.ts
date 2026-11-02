/**
 * Juego: ranking, perfiles públicos y foto de perfil.
 *
 * - Supabase: RPC leaderboard() / player_profile() y set_my_avatar() (migración
 *   016); la foto se sube al bucket privado `avatars`.
 * - REST: /api/game/* del backend Express.
 * Los puntos los calcula siempre el servidor; las insignias se derivan de las
 * estadísticas con earnedBadges()/bestBadges() de @laf/shared.
 */
import {
  badgeCollection,
  badgeProgress,
  displayedFrame,
  type FrameId,
  LEADERBOARD_MAX,
  TOP_PLAYERS,
  ULTIMATE_BADGE,
  type EquippedFrame,
  type LeaderboardPage,
  type PlayerProfile,
  type PlayerStats,
  type PlayerSummary,
  type User,
  type UserRole,
} from '@laf/shared';
import { api } from '../lib/api';
import { AVATAR_BUCKET, signAvatars } from '../lib/avatars';
import { useSupabase } from '../lib/config';
import { NotAvailableError } from '../lib/errors';
import { prepareAvatar } from '../lib/image';
import { emitReward, type RewardKind } from '../lib/rewards';
import { requireSupabase } from '../lib/supabase';

export interface GameService {
  /** Página del ranking (top LEADERBOARD_MAX). */
  leaderboard(offset: number, limit: number): Promise<LeaderboardPage>;
  /** Perfil público de un colaborador (NotAvailableError si no existe o está desactivado). */
  profile(userId: string): Promise<PlayerProfile>;
  /** Cambia la foto de perfil propia. Devuelve la nueva URL. */
  setAvatar(file: File): Promise<string | null>;
  removeAvatar(): Promise<void>;
  /** Marco que lleva el usuario (null = automático, 'none' = sin marco). */
  setFrame(frame: EquippedFrame): Promise<void>;
}

type StatsRow = {
  id: string;
  name: string;
  avatar_path: string | null;
  points: number;
  rank: number | null;
  published: number;
  published_photo: number;
  returned: number;
  fast_returned: number;
  categories: number;
  active_months: number;
  equipped_frame: string | null;
};

function toSummary(r: StatsRow, urls: Map<string, string>): PlayerSummary {
  const stats: PlayerStats = {
    published: r.published,
    publishedWithPhoto: r.published_photo,
    returned: r.returned,
    fastReturned: r.fast_returned,
    categories: r.categories,
    activeMonths: r.active_months,
  };
  return {
    id: r.id,
    name: r.name,
    avatarUrl: (r.avatar_path && urls.get(r.avatar_path)) || null,
    points: r.points,
    rank: r.rank ?? null,
    stats,
    equippedFrame: (r.equipped_frame as EquippedFrame) ?? null,
  };
}

/** Mensaje legible de un error de PostgREST/Storage. */
function fail(error: { message?: string } | null): never {
  throw new Error(error?.message || 'No se pudo completar la operación');
}

async function currentUserId(): Promise<string> {
  const { data } = await requireSupabase().auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Sesión no válida');
  return uid;
}

const supabaseGame: GameService = {
  async leaderboard(offset, limit) {
    // Se pide uno más para saber si hay otra página (sin pasar del puesto 100).
    const want = Math.min(limit + 1, LEADERBOARD_MAX - offset);
    if (want <= 0) return { entries: [], hasMore: false };
    const { data, error } = await requireSupabase().rpc('leaderboard', { p_offset: offset, p_limit: want });
    if (error) fail(error);
    const rows = (data ?? []) as StatsRow[];
    const urls = await signAvatars(rows.map((r) => r.avatar_path)).catch(() => new Map<string, string>());
    return {
      entries: rows.slice(0, limit).map((r) => toSummary(r, urls)),
      hasMore: rows.length > limit,
    };
  },

  async profile(userId) {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new NotAvailableError('Este perfil no está disponible.');
    const { data, error } = await requireSupabase().rpc('player_profile', { p_user_id: userId }).maybeSingle();
    if (error) fail(error);
    if (!data) throw new NotAvailableError('Este perfil no está disponible.');
    const row = data as StatsRow & { role: string; created_at: string };
    const urls = await signAvatars([row.avatar_path]).catch(() => new Map<string, string>());
    return { ...toSummary(row, urls), role: row.role as UserRole, createdAt: row.created_at };
  },

  async setAvatar(file) {
    const sb = requireSupabase();
    const photo = await prepareAvatar(file);
    const path = `${await currentUserId()}/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await sb.storage.from(AVATAR_BUCKET).upload(path, photo, { contentType: 'image/jpeg', upsert: false });
    if (upErr) fail(upErr);
    const { data: old, error } = await sb.rpc('set_my_avatar', { p_path: path });
    if (error) {
      void sb.storage.from(AVATAR_BUCKET).remove([path]).catch(() => undefined);
      fail(error);
    }
    if (old) void sb.storage.from(AVATAR_BUCKET).remove([old as string]).catch(() => undefined);
    return (await signAvatars([path])).get(path) ?? null;
  },

  async removeAvatar() {
    const sb = requireSupabase();
    const { data: old, error } = await sb.rpc('set_my_avatar', { p_path: null });
    if (error) fail(error);
    if (old) void sb.storage.from(AVATAR_BUCKET).remove([old as string]).catch(() => undefined);
  },

  async setFrame(frame) {
    const { error } = await requireSupabase().rpc('set_my_frame', { p_frame: frame });
    if (error) fail(error);
  },
};

const restGame: GameService = {
  leaderboard: (offset, limit) => api<LeaderboardPage>(`/game/leaderboard?offset=${offset}&limit=${limit}`),
  profile: (userId) => api<PlayerProfile>(`/game/players/${encodeURIComponent(userId)}`),
  async setAvatar(file) {
    const form = new FormData();
    form.set('image', await prepareAvatar(file));
    return (await api<User>('/game/avatar', { method: 'PUT', formData: form })).avatarUrl ?? null;
  },
  async removeAvatar() {
    await api('/game/avatar', { method: 'DELETE' });
  },
  async setFrame(frame) {
    await api('/game/frame', { method: 'PUT', body: { frame } });
  },
};

export const gameService: GameService = useSupabase ? supabaseGame : restGame;

// --- Recompensas (ventana "+N puntos") -------------------------------------------

/** Perfil de juego del usuario de la sesión. */
async function myProfile(): Promise<PlayerProfile> {
  return useSupabase ? gameService.profile(await currentUserId()) : api<PlayerProfile>('/game/players/me');
}

// Perfil de juego propio compartido (marco de la foto en la cabecera): se refresca al
// ganar puntos, al personalizar o al cambiar de usuario.
let mine: PlayerProfile | null = null;
const mineListeners = new Set<(p: PlayerProfile | null) => void>();

function setMine(p: PlayerProfile | null) {
  mine = p;
  mineListeners.forEach((l) => l(p));
}

/** Vuelve a leer el perfil de juego propio y avisa a quien lo use. */
export async function refreshMyPlayer(): Promise<PlayerProfile | null> {
  setMine(await myProfile().catch(() => mine));
  return mine;
}

export const currentMyPlayer = () => mine;

export function onMyPlayer(l: (p: PlayerProfile | null) => void): () => void {
  mineListeners.add(l);
  return () => {
    mineListeners.delete(l);
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

/**
 * Ejecuta una acción que puede dar puntos (publicar, devolver) y, si al terminar
 * el usuario tiene más puntos o alguna insignia nueva/subida de nivel, emite la
 * recompensa. Usa los datos reales del servidor (antes y después), así que nunca
 * promete puntos que no se dieron. Si no se pueden leer, la acción sigue igual.
 */
export async function trackPoints<T>(kind: RewardKind, action: () => Promise<T>): Promise<T> {
  const before = await withTimeout(myProfile(), 2500).catch(() => null);
  const result = await action();
  if (before) {
    void myProfile()
      .then((after) => {
        topCache = null; // el ranking (y los emblemas) pudieron cambiar
        setMine(after);
        const prev = new Map(badgeCollection(before.stats).map((p) => [p.badge.id, p.level]));
        const badges = badgeCollection(after.stats).filter((p) => p.level > (prev.get(p.badge.id) ?? 0));
        // Una devolución sin puntos también se avisa: la ventana explica por qué no sumó.
        if (after.points > before.points || badges.length || kind === 'returned') emitReward({ kind, before, after, badges });
      })
      .catch(() => undefined);
  }
  return result;
}

// --- Top del ranking (emblemas junto al nombre y perdidos destacados) ---------

const TOP_TTL_MS = 60_000;
/** frames: marco que se muestra de cada jugador del top 100 (tarjetas del muro). */
type Snapshot = { top: string[]; legends: string[]; frames: Record<string, FrameId | null> };
let topCache: (Snapshot & { at: number }) | null = null;
let topInFlight: Promise<Snapshot> | null = null;

let adminCache: { ids: string[]; at: number } | null = null;
let adminInFlight: Promise<string[]> | null = null;

/** Ids de los administradores (emblema de admin junto al nombre; cacheado 1 min). Vacío si falla. */
export function adminIds(): Promise<string[]> {
  if (adminCache && Date.now() - adminCache.at < TOP_TTL_MS) return Promise.resolve(adminCache.ids);
  const load = useSupabase
    ? async () => {
        // `role` es legible por cualquier colaborador (migración 007).
        const { data, error } = await requireSupabase().from('profiles').select('id').eq('role', 'ADMIN');
        if (error) throw error;
        return (data ?? []).map((r) => r.id as string);
      }
    : () => api<string[]>('/game/admins');
  adminInFlight ??= load()
    .catch(() => [] as string[])
    .then((ids) => {
      adminCache = { ids, at: Date.now() };
      adminInFlight = null;
      return ids;
    });
  return adminInFlight;
}

/**
 * Una sola lectura del ranking (top 100, cacheada 1 min) para los emblemas: el
 * top 3 y quién tiene la insignia definitiva. Una Leyenda de OLO siempre está en
 * el top 100: exige cientos de objetos publicados y devueltos.
 */
function rankingSnapshot(): Promise<Snapshot> {
  if (topCache && Date.now() - topCache.at < TOP_TTL_MS) return Promise.resolve(topCache);
  topInFlight ??= gameService
    .leaderboard(0, LEADERBOARD_MAX)
    .then((p) => ({
      top: p.entries.slice(0, TOP_PLAYERS).map((e) => e.id),
      legends: p.entries.filter((e) => badgeProgress(ULTIMATE_BADGE, e.stats).level > 0).map((e) => e.id),
      frames: Object.fromEntries(p.entries.map((e) => [e.id, displayedFrame(e)])),
    }))
    .catch(() => ({ top: [], legends: [], frames: {} }))
    .then((snap) => {
      topCache = { ...snap, at: Date.now() };
      topInFlight = null;
      return snap;
    });
  return topInFlight;
}

/** Ids de los primeros TOP_PLAYERS del ranking, en orden. Vacío si falla. */
export const topPlayerIds = () => rankingSnapshot().then((s) => s.top);

/** Marco de la foto de un jugador (null si no tiene o está fuera del top 100). */
export const playerFrame = (id: string) => rankingSnapshot().then((s) => s.frames[id] ?? null);

/** Ids de quienes tienen la insignia definitiva (Leyenda de OLO). */
export const legendIds = () => rankingSnapshot().then((s) => s.legends);
