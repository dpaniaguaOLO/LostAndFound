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
  createdAt: string;
  updatedAt: string;
}

export interface Claim {
  id: string;
  foundItemId: string;
  /** `reporterName`: quien encontró el objeto (para coordinar la entrega). */
  foundItem?: Pick<FoundItem, 'id' | 'title' | 'imageUrl' | 'status'> & { reporterName?: string };
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
