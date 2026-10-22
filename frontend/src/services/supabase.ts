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
import { NotAvailableError } from '../lib/errors';
import { requireSupabase, setRememberDevice } from '../lib/supabase';
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

type ProfileRow = {
  id: string;
  name: string;
  employee_id: string;
  email: string | null;
  role: string;
  active?: boolean | null;
  created_at: string;
};

function toUser(r: ProfileRow): User {
  return {
    id: r.id,
    name: r.name,
    employeeId: r.employee_id,
    email: r.email,
    role: r.role as UserRole,
    active: r.active ?? true,
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

/**
 * Sube una foto a "<carpeta>/<uuid>.<ext>". La carpeta es la del AUTOR de la
 * publicación (`ownerId`): la BD exige que la foto esté en la carpeta del autor
 * (CHECK image_owner_chk), también cuando edita un admin (FUN-02).
 */
async function uploadPhoto(file: File, ownerId?: string): Promise<string> {
  const sb = requireSupabase();
  const folder = ownerId ?? (await currentUserId());
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) throw new Error('Formato de imagen no permitido. Usa JPG, PNG, WEBP o GIF.');
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Borra (best-effort) una foto recién subida cuyo guardado en la BD falló. */
function discardUpload(path: string | null): void {
  if (path) void requireSupabase().storage.from(PHOTO_BUCKET).remove([path]).catch(() => undefined);
}

/**
 * Edición de un objeto/reporte (autor o admin; lo garantizan RLS y los GRANT por
 * columna). Si cambia la foto, sube la nueva y borra la anterior de Storage
 * (best-effort: si el borrado falla, solo queda un archivo huérfano).
 */
async function updateItem(table: 'found_items' | 'lost_reports', id: string, form: FormData) {
  const sb = requireSupabase();
  const f = readItemForm(form);
  const { data: current, error: readErr } = await sb
    .from(table)
    .select('image_path, reporter_id')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new NotAvailableError();
  const oldPath = (current.image_path as string | null) ?? null;

  const patch: Record<string, unknown> = {
    title: f.title,
    description: f.description,
    category: f.category,
    location: f.location,
  };
  const date = table === 'found_items' ? f.foundAt : f.lostAt;
  if (date) patch[table === 'found_items' ? 'found_at' : 'lost_at'] = date;
  const newPath = f.image ? await uploadPhoto(f.image, current.reporter_id as string) : null;
  if (newPath) patch.image_path = newPath;
  else if (form.get('removeImage') === '1') patch.image_path = null;

  const { data, error } = await sb.from(table).update(patch).eq('id', id).select(REPORTER_SELECT).single();
  if (error) {
    discardUpload(newPath); // sin esto la foto quedaba huérfana (INT-05)
    throw error;
  }
  if (oldPath && 'image_path' in patch && patch.image_path !== oldPath) {
    void sb.storage.from(PHOTO_BUCKET).remove([oldPath]).catch(() => undefined);
  }
  return data;
}

/**
 * Borrado definitivo (admin, o el autor según el estado: RLS de la migración 014)
 * que elimina también la foto de Storage: antes quedaba huérfana y seguía siendo
 * legible por cualquier colaborador.
 */
async function removeWithPhoto(table: 'found_items' | 'lost_reports', id: string) {
  const sb = requireSupabase();
  const { data } = await sb.from(table).select('image_path').eq('id', id).maybeSingle();
  const { data: deleted, error } = await sb.from(table).delete().eq('id', id).select('id');
  if (error) throw error;
  // Si la RLS no permite borrar la fila, PostgREST no da error: simplemente no borra nada.
  if (!deleted?.length) throw new Error('No se pudo eliminar: ya no está disponible o no tienes permiso.');
  const path = (data?.image_path as string | null) ?? null;
  if (path) void sb.storage.from(PHOTO_BUCKET).remove([path]).catch(() => undefined);
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
    // getUser() valida la sesión contra el servidor de Auth (no solo la local).
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    // employee_id/email no son legibles en `profiles` para el cliente (migración
    // 007): el perfil propio completo se obtiene con la función my_profile().
    const { data: profile } = await sb.rpc('my_profile').maybeSingle();
    if (!profile) return null;
    const user = toUser(profile as ProfileRow);
    // Si la cuenta fue desactivada, no se considera sesión válida.
    if (!user.active) {
      await sb.auth.signOut();
      return null;
    }
    return user;
  },

  async login(employeeId, password, remember = true) {
    const sb = requireSupabase();
    setRememberDevice(remember);
    // Opción 2 (email sintético): el email se deriva del número de colaborador,
    // así el login no depende de una consulta previa a profiles (que además
    // estaría bloqueada por RLS antes de autenticar).
    const email = syntheticEmail(employeeId);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Credenciales incorrectas');
    const user = await this.getCurrentUser();
    if (!user) throw new Error('No se pudo cargar el perfil');
    // Un colaborador desactivado no puede usar la app: cierra la sesión recién abierta.
    if (!user.active) {
      await sb.auth.signOut();
      throw new Error('Tu cuenta está desactivada. Contacta a un administrador.');
    }
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

/** Patrón ILIKE "contiene" con los comodines del usuario (% _ \) tratados como literales. */
function containsPattern(text: string): string {
  return `%${text.trim().slice(0, 200).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Filtros de búsqueda y ubicación. `.or()` recibe una cadena con la sintaxis de
 * PostgREST: el valor va entre comillas dobles (escapando " y \) para que comas,
 * paréntesis o puntos del usuario no puedan añadir condiciones al filtro.
 */
function applyTextFilters<Q extends { ilike: (c: string, p: string) => Q; or: (f: string) => Q }>(
  q: Q,
  params: FoundItemsQueryParams,
): Q {
  if (params.location) q = q.ilike('location', containsPattern(params.location));
  if (params.search) {
    const quoted = `"${containsPattern(params.search).replace(/["\\]/g, (c) => `\\${c}`)}"`;
    q = q.or(`title.ilike.${quoted},description.ilike.${quoted}`);
  }
  return q;
}

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
    q = applyTextFilters(q, params);
    const { data, count, error } = await q;
    if (error) throw error;
    const items = await mapWithImages(data ?? [], (r) => r.image_path, toFoundItem);
    const total = count ?? items.length;
    return { data: items, page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) || 1 };
  },

  async get(id) {
    const sb = requireSupabase();
    // maybeSingle: si fue eliminado (o archivado y no es tuyo) no hay fila; antes
    // .single() lanzaba "Cannot coerce the result to a single JSON object".
    const { data, error } = await sb.from('found_items').select(REPORTER_SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotAvailableError('Este objeto ya no está disponible: pudo ser eliminado o retirado por un administrador.');
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
    if (error) {
      discardUpload(imagePath); // la foto ya subida no debe quedar huérfana (INT-05)
      throw error;
    }
    return toFoundItem(data);
  },

  async update(id, form) {
    return toFoundItem(await updateItem('found_items', id, form));
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
    await removeWithPhoto('found_items', id);
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
    q = applyTextFilters(q, params);
    const { data, count, error } = await q;
    if (error) throw error;
    const items = await mapWithImages(data ?? [], (r) => r.image_path, toLostReport);
    const total = count ?? items.length;
    return { data: items, page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) || 1 };
  },

  async get(id) {
    const sb = requireSupabase();
    const { data, error } = await sb.from('lost_reports').select(REPORTER_SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotAvailableError('Este reporte ya no está disponible: pudo ser eliminado o cerrado por un administrador.');
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
    if (error) {
      discardUpload(imagePath); // la foto ya subida no debe quedar huérfana (INT-05)
      throw error;
    }
    // Aviso automático si ya hay un encontrado muy parecido (Edge Function, en
    // segundo plano: si falla no debe impedir que el reporte quede creado).
    void sb.functions
      .invoke(`api/ai/match/${data.id}/notify`, { method: 'POST' })
      .catch(() => undefined);
    return toLostReport(data);
  },

  async update(id, form) {
    return toLostReport(await updateItem('lost_reports', id, form));
  },

  async resolve(id) {
    const { data, error } = await requireSupabase()
      .from('lost_reports')
      .update({ status: 'RESOLVED' })
      .eq('id', id)
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
    await removeWithPhoto('lost_reports', id);
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
          reporterName: ((fi.reporter as Row | null)?.name as string | undefined) ?? undefined,
        }
      : undefined,
    lostReportId: (c.lost_report_id as string | null) ?? null,
    claimant: { id: (claimant?.id ?? c.claimant_id) as string, name: (claimant?.name as string) ?? '' },
    message: c.message as string,
    status: c.status as Claim['status'],
    reviewerId: (c.reviewer_id as string | null) ?? null,
    reviewNote: (c.review_note as string | null) ?? null,
    createdAt: c.created_at as string,
    updatedAt: c.updated_at as string,
  };
}

// Literal en una sola cadena: supabase-js infiere el tipo de la fila a partir de ella.
const CLAIM_SELECT =
  '*, found_item:found_items!inner (id, title, image_path, status, reporter_id, reporter:profiles!reporter_id (id, name)), claimant:profiles!claimant_id (id, name)';
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
  async create(foundItemId, message, lostReportId) {
    return edgeClaim('POST', '/claims', { foundItemId, message, lostReportId: lostReportId || undefined });
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
  async unreadCount() {
    // HEAD + count: solo el número (la RLS limita a las propias). Antes se
    // descargaban hasta 100 filas completas en cada navegación (PERF-01).
    const { count, error } = await requireSupabase()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('read', false);
    if (error) throw error;
    return count ?? 0;
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
