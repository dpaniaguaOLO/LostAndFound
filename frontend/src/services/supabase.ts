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

/** Genera una URL firmada para una ruta de Storage (o null). */
async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const sb = requireSupabase();
  const { data } = await sb.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
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

async function uploadPhoto(file: File): Promise<string> {
  const sb = requireSupabase();
  const { data: userData } = await sb.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Sesión no válida');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
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
    const items = await Promise.all((data ?? []).map(toFoundItem));
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
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb
      .from('found_items')
      .select(REPORTER_SELECT)
      .eq('reporter_id', u.user?.id ?? '')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return Promise.all((data ?? []).map(toFoundItem));
  },

  async create(form) {
    const sb = requireSupabase();
    const f = readItemForm(form);
    const { data: u } = await sb.auth.getUser();
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
        reporter_id: u.user?.id,
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
    const items = await Promise.all((data ?? []).map(toLostReport));
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
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb
      .from('lost_reports')
      .select(REPORTER_SELECT)
      .eq('reporter_id', u.user?.id ?? '')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return Promise.all((data ?? []).map(toLostReport));
  },

  async create(form) {
    const sb = requireSupabase();
    const f = readItemForm(form);
    const { data: u } = await sb.auth.getUser();
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
        reporter_id: u.user?.id,
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

// --- Claims / Notifications (núcleo CRUD) ------------------------------------
// Nota: las transiciones complejas (aprobar => objeto CLAIMED + rechazar otras,
// y la notificación asociada) deberían ejecutarse en una Edge Function para
// garantizar atomicidad y permisos. Aquí se deja la operación base.

const claims: ClaimsService = {
  async mine() {
    const sb = requireSupabase();
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb
      .from('claims')
      .select('*, found_item:found_items (id, title, image_path, status), claimant:profiles!claimant_id (id, name)')
      .eq('claimant_id', u.user?.id ?? '')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Claim[];
  },
  async incoming() {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from('claims')
      .select('*, found_item:found_items!inner (id, title, image_path, status, reporter_id), claimant:profiles!claimant_id (id, name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Claim[];
  },
  async create(foundItemId, message) {
    const sb = requireSupabase();
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb
      .from('claims')
      .insert({ found_item_id: foundItemId, claimant_id: u.user?.id, message })
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Claim;
  },
  async review(id, status, reviewNote) {
    const sb = requireSupabase();
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb
      .from('claims')
      .update({ status, review_note: reviewNote ?? null, reviewer_id: u.user?.id })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Claim;
  },
  async cancel(id) {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from('claims')
      .update({ status: 'CANCELLED' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Claim;
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
    const { data: u } = await sb.auth.getUser();
    const { error } = await sb
      .from('notifications')
      .update({ read: true })
      .eq('user_id', u.user?.id ?? '')
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
