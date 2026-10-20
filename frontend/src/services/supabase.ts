/**
 * Implementación Supabase de la capa de datos.
 *
 * Mapea las filas de Postgres (snake_case) a los tipos compartidos (camelCase).
 * La autenticación usa Supabase Auth; el login por "número de colaborador" se
 * resuelve buscando el email asociado al employee_id (ver nota más abajo y
 * docs/SUPABASE_SETUP.md, donde se explica la estrategia de identidad).
 *
 * Las imágenes se suben al bucket privado 'item-photos' y se leen con URLs firmadas.
 * Las funciones de IA (búsqueda semántica, emparejado, asistente) NO viven aquí:
 * permanecen en el backend REST / una Edge Function, porque dependen de cómputo
 * (NLP, sharp) que no es SQL. Ver ARCHITECTURE.md.
 */
import type {
  Claim,
  FoundItem,
  FoundItemStatus,
  ItemCategory,
  LostReport,
  Notification,
  Paginated,
  User,
  UserRole,
} from '@laf/shared';
import { syntheticEmail } from '../lib/config';
import { requireSupabase } from '../lib/supabase';
import type {
  AuthService,
  ClaimsService,
  DataServices,
  FoundItemsQueryParams,
  FoundItemsService,
  LostReportsService,
  NotificationsService,
} from './types';

const PAGE_SIZE = 12;
const PHOTO_BUCKET = 'item-photos';

/**
 * Invoca la Edge Function `api` para operaciones de reclamación que requieren
 * privilegios de servidor (notificaciones, transición de estado). Devuelve el
 * Claim serializado.
 */
async function edgeClaim(
  method: 'POST' | 'PATCH',
  path: string,
  body?: Record<string, unknown>,
): Promise<Claim> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke(`api${path}`, { method, body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const parsed = await ctx.json();
        if (parsed?.message) message = parsed.message;
      }
    } catch {
      /* usa mensaje por defecto */
    }
    throw new Error(message);
  }
  return data as Claim;
}

// --- Mapeo de filas Postgres -> tipos compartidos ---------------------------

type ProfileRow = { id: string; name: string; employee_id: string; email: string | null; role: string; created_at: string };

function toUser(r: ProfileRow): User {
  return {
    id: r.id,
    name: r.name,
    employeeId: r.employee_id,
    email: r.email,
    role: r.role as UserRole,
    createdAt: r.created_at,
  };
}

/**
 * Id del usuario de la sesión actual. Usa la sesión local (sin ir a la red, a
 * diferencia de auth.getUser()); la autorización real la impone RLS en el servidor.
 */
async function currentUserId(): Promise<string> {
  const { data } = await requireSupabase().auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Sesión no válida');
  return uid;
}

// URLs firmadas (válidas 2 h) reutilizadas durante 1 h: evita pedir una URL a
// Storage por cada imagen cada vez que se recarga un listado.
const SIGN_TTL_S = 7200;
const CACHE_TTL_MS = 3600_000;
const urlCache = new Map<string, { url: string; exp: number }>();

function cachedUrl(path: string): string | null {
  const hit = urlCache.get(path);
  return hit && hit.exp > Date.now() ? hit.url : null;
}

/** Firma en una sola petición todas las rutas que aún no estén en caché. */
async function primeSignedUrls(paths: unknown[]): Promise<void> {
  const missing = [...new Set(paths.filter((p): p is string => typeof p === 'string' && !!p))]
    .filter((p) => !cachedUrl(p));
  if (missing.length === 0) return;
  const { data } = await requireSupabase().storage.from(PHOTO_BUCKET).createSignedUrls(missing, SIGN_TTL_S);
  const exp = Date.now() + CACHE_TTL_MS;
  for (const r of data ?? []) {
    if (r.path && r.signedUrl && !r.error) urlCache.set(r.path, { url: r.signedUrl, exp });
  }
}

/** URL firmada para una ruta de Storage (o null). */
async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  await primeSignedUrls([path]);
  return cachedUrl(path);
}

type Row = Record<string, unknown>;

/** Mapea una lista de filas precargando antes todas sus URLs de imagen. */
async function mapWithImages<T>(rows: Row[], pathOf: (r: Row) => unknown, map: (r: Row) => Promise<T>): Promise<T[]> {
  await primeSignedUrls(rows.map(pathOf));
  return Promise.all(rows.map(map));
}

async function toFoundItem(r: Record<string, unknown>): Promise<FoundItem> {
  const reporter = (r.reporter as ProfileRow | null) ?? null;
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    category: r.category as ItemCategory,
    location: r.location as string,
    foundAt: r.found_at as string,
    imageUrl: await signedUrl((r.image_path as string | null) ?? null),
    status: r.status as FoundItemStatus,
    reporter: { id: reporter?.id ?? (r.reporter_id as string), name: reporter?.name ?? '' },
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

async function toLostReport(r: Record<string, unknown>): Promise<LostReport> {
  const reporter = (r.reporter as ProfileRow | null) ?? null;
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    category: r.category as ItemCategory,
    location: r.location as string,
    lostAt: r.lost_at as string,
    imageUrl: await signedUrl((r.image_path as string | null) ?? null),
    status: r.status as LostReport['status'],
    reporter: { id: reporter?.id ?? (r.reporter_id as string), name: reporter?.name ?? '' },
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// --- Subida de imagen a Storage ---------------------------------------------

// Extensión según el tipo real (no el nombre del archivo, que lo controla el usuario).
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

async function uploadPhoto(file: File): Promise<string> {
  const sb = requireSupabase();
  const uid = await currentUserId();
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) throw new Error('Formato de imagen no permitido. Usa JPG, PNG, WEBP o GIF.');
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

// Extrae los campos del FormData que usan los formularios actuales.
function readItemForm(form: FormData) {
  return {
    title: String(form.get('title') ?? ''),
    description: String(form.get('description') ?? ''),
    category: String(form.get('category') ?? 'OTHER'),
    location: String(form.get('location') ?? ''),
    foundAt: form.get('foundAt') ? String(form.get('foundAt')) : null,
    lostAt: form.get('lostAt') ? String(form.get('lostAt')) : null,
    image: (form.get('image') as File | null) ?? null,
  };
}

// --- Auth --------------------------------------------------------------------

const auth: AuthService = {
  async getCurrentUser() {
    const sb = requireSupabase();
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    const { data: profile } = await sb
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();
    return profile ? toUser(profile as ProfileRow) : null;
  },

  async login(employeeId, password) {
    const sb = requireSupabase();
    // Opción 2 (email sintético): el email se deriva del número de colaborador,
    // así el login no depende de una consulta previa a profiles (que además
    // estaría bloqueada por RLS antes de autenticar).
    const email = syntheticEmail(employeeId);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Credenciales incorrectas');
    const user = await this.getCurrentUser();
    if (!user) throw new Error('No se pudo cargar el perfil');
    return user;
  },

  async register(input) {
    const sb = requireSupabase();
    // Email sintético derivado del número de colaborador (opción 2).
    const email = syntheticEmail(input.employeeId);
    const { error } = await sb.auth.signUp({
      email,
      password: input.password,
      options: { data: { name: input.name, employee_id: input.employeeId } },
    });
    if (error) throw error;
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Registro incompleto: confirma el correo si es necesario');
    return user;
  },

  async logout() {
    await requireSupabase().auth.signOut();
  },
};

// --- Found items -------------------------------------------------------------

const REPORTER_SELECT = '*, reporter:profiles!reporter_id (id, name)';

const foundItems: FoundItemsService = {
  async list(params: FoundItemsQueryParams): Promise<Paginated<FoundItem>> {
    const sb = requireSupabase();
    const page = Math.max(1, params.page ?? 1);
    const from = (page - 1) * PAGE_SIZE;
    let q = sb
      .from('found_items')
      .select(REPORTER_SELECT, { count: 'exact' })
      .in('status', ['PUBLISHED', 'CLAIMED'])
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (params.category) q = q.eq('category', params.category);
    if (params.location) q = q.ilike('location', `%${params.location}%`);
    if (params.search) q = q.or(`title.ilike.%${params.search}%,description.ilike.%${params.search}%`);
    const { data, count, error } = await q;
    if (error) throw error;
    const items = await mapWithImages(data ?? [], (r) => r.image_path, toFoundItem);
    const total = count ?? items.length;
    return { data: items, page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) || 1 };
  },

  async get(id) {
    const sb = requireSupabase();
    const { data, error } = await sb.from('found_items').select(REPORTER_SELECT).eq('id', id).single();
    if (error) throw error;
    return toFoundItem(data);
  },

  async mine() {
    const sb = requireSupabase();
    const uid = await currentUserId();
    const { data, error } = await sb
      .from('found_items')
      .select(REPORTER_SELECT)
      .eq('reporter_id', uid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return mapWithImages(data ?? [], (r) => r.image_path, toFoundItem);
  },

  async create(form) {
    const sb = requireSupabase();
    const f = readItemForm(form);
    const uid = await currentUserId();
    const imagePath = f.image ? await uploadPhoto(f.image) : null;
    const { data, error } = await sb
      .from('found_items')
      .insert({
        title: f.title,
        description: f.description,
        category: f.category,
        location: f.location,
        found_at: f.foundAt ?? new Date().toISOString(),
        image_path: imagePath,
        reporter_id: uid,
      })
      .select(REPORTER_SELECT)
      .single();
    if (error) throw error;
    return toFoundItem(data);
  },

  async markReturned(id) {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from('found_items')
      .update({ status: 'RETURNED' })
      .eq('id', id)
      .select(REPORTER_SELECT)
      .single();
    if (error) throw error;
    return toFoundItem(data);
  },

  async archive(id) {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from('found_items')
      .update({ status: 'ARCHIVED' })
      .eq('id', id)
      .select(REPORTER_SELECT)
      .single();
    if (error) throw error;
    return toFoundItem(data);
  },

  async remove(id) {
    const { error } = await requireSupabase().from('found_items').delete().eq('id', id);
    if (error) throw error;
  },
};

// --- Lost reports ------------------------------------------------------------

const lostReports: LostReportsService = {
  async list(params) {
    const sb = requireSupabase();
    const page = Math.max(1, params.page ?? 1);
    const from = (page - 1) * PAGE_SIZE;
    let q = sb
      .from('lost_reports')
      .select(REPORTER_SELECT, { count: 'exact' })
      // Oculta los archivados/cerrados del muro (equivale a excluir ARCHIVED en encontrados).
      .in('status', ['OPEN', 'MATCHED', 'RESOLVED'])
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (params.category) q = q.eq('category', params.category);
    if (params.location) q = q.ilike('location', `%${params.location}%`);
    if (params.search) q = q.or(`title.ilike.%${params.search}%,description.ilike.%${params.search}%`);
    const { data, count, error } = await q;
    if (error) throw error;
    const items = await mapWithImages(data ?? [], (r) => r.image_path, toLostReport);
    const total = count ?? items.length;
    return { data: items, page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) || 1 };
  },

  async get(id) {
    const sb = requireSupabase();
    const { data, error } = await sb.from('lost_reports').select(REPORTER_SELECT).eq('id', id).single();
    if (error) throw error;
    return toLostReport(data);
  },

  async mine() {
    const sb = requireSupabase();
    const uid = await currentUserId();
    const { data, error } = await sb
      .from('lost_reports')
      .select(REPORTER_SELECT)
      .eq('reporter_id', uid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return mapWithImages(data ?? [], (r) => r.image_path, toLostReport);
  },

  async create(form) {
    const sb = requireSupabase();
    const f = readItemForm(form);
    const uid = await currentUserId();
    const imagePath = f.image ? await uploadPhoto(f.image) : null;
    const { data, error } = await sb
      .from('lost_reports')
      .insert({
        title: f.title,
        description: f.description,
        category: f.category,
        location: f.location,
        lost_at: f.lostAt ?? new Date().toISOString(),
        image_path: imagePath,
        reporter_id: uid,
      })
      .select(REPORTER_SELECT)
      .single();
    if (error) throw error;
    return toLostReport(data);
  },

  async close(id) {
    const { data, error } = await requireSupabase()
      .from('lost_reports')
      .update({ status: 'CLOSED' })
      .eq('id', id)
      .select(REPORTER_SELECT)
      .single();
    if (error) throw error;
    return toLostReport(data);
  },

  async remove(id) {
    const { error } = await requireSupabase().from('lost_reports').delete().eq('id', id);
    if (error) throw error;
  },
};

// --- Claims / Notifications ----------------------------------------------------

async function toClaim(c: Row): Promise<Claim> {
  const fi = c.found_item as Row | null;
  const claimant = c.claimant as Row | null;
  return {
    id: c.id as string,
    foundItemId: c.found_item_id as string,
    foundItem: fi
      ? {
          id: fi.id as string,
          title: fi.title as string,
          imageUrl: await signedUrl((fi.image_path as string | null) ?? null),
          status: fi.status as FoundItemStatus,
        }
      : undefined,
    claimant: { id: (claimant?.id ?? c.claimant_id) as string, name: (claimant?.name as string) ?? '' },
    message: c.message as string,
    status: c.status as Claim['status'],
    reviewerId: (c.reviewer_id as string | null) ?? null,
    reviewNote: (c.review_note as string | null) ?? null,
    createdAt: c.created_at as string,
    updatedAt: c.updated_at as string,
  };
}

const CLAIM_SELECT =
  '*, found_item:found_items!inner (id, title, image_path, status, reporter_id), claimant:profiles!claimant_id (id, name)';
const claimImage = (c: Row) => (c.found_item as Row | null)?.image_path;

const claims: ClaimsService = {
  async mine() {
    const sb = requireSupabase();
    const uid = await currentUserId();
    const { data, error } = await sb
      .from('claims')
      .select(CLAIM_SELECT)
      .eq('claimant_id', uid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return mapWithImages(data ?? [], claimImage, toClaim);
  },
  async incoming() {
    // Solo las reclamaciones sobre objetos que publiqué (RLS también deja ver las
    // propias como reclamante, y a un admin todas: aquí se acota como en REST).
    const sb = requireSupabase();
    const uid = await currentUserId();
    const { data, error } = await sb
      .from('claims')
      .select(CLAIM_SELECT)
      .eq('found_item.reporter_id', uid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return mapWithImages(data ?? [], claimImage, toClaim);
  },
  // Las reclamaciones pasan por la Edge Function `api`: el flujo necesita
  // privilegios (notificar al dueño/reclamante, cambiar el estado del objeto,
  // rechazar en cascada), que no se pueden hacer con RLS desde el cliente.
  async create(foundItemId, message) {
    return edgeClaim('POST', '/claims', { foundItemId, message });
  },
  async review(id, status, reviewNote) {
    return edgeClaim('PATCH', `/claims/${id}/review`, { status, reviewNote });
  },
  async cancel(id) {
    return edgeClaim('PATCH', `/claims/${id}/cancel`);
  },
};

const notifications: NotificationsService = {
  async list() {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map((n: Record<string, unknown>) => ({
      id: n.id as string,
      type: n.type as Notification['type'],
      title: n.title as string,
      body: n.body as string,
      read: n.read as boolean,
      relatedItemId: (n.related_item_id as string | null) ?? null,
      createdAt: n.created_at as string,
    }));
  },
  async markRead(id) {
    const { error } = await requireSupabase().from('notifications').update({ read: true }).eq('id', id);
    if (error) throw error;
  },
  async markAllRead() {
    const sb = requireSupabase();
    const uid = await currentUserId();
    const { error } = await sb
      .from('notifications')
      .update({ read: true })
      .eq('user_id', uid)
      .eq('read', false);
    if (error) throw error;
  },
};

export const supabaseServices: DataServices = {
  auth,
  foundItems,
  lostReports,
  claims,
  notifications,
};
