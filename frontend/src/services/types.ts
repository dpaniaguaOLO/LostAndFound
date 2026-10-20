/**
 * Contratos de la capa de datos (servicios/repositorios).
 *
 * La UI depende de estas interfaces, no de una implementación concreta. Hay dos
 * implementaciones: `rest` (backend Express actual) y `supabase`. El selector vive
 * en services/index.ts según la configuración (VITE_DATA_BACKEND).
 *
 * Esto separa interfaz visual, lógica de negocio y acceso a datos, y permite migrar
 * a Supabase por partes sin tocar los componentes.
 */
import type {
  AuthResponse,
  Claim,
  FoundItem,
  LostReport,
  Notification,
  Paginated,
  User,
} from '@laf/shared';

export interface FoundItemsQueryParams {
  search?: string;
  category?: string;
  location?: string;
  page?: number;
}

export interface AuthService {
  getCurrentUser(): Promise<User | null>;
  login(employeeId: string, password: string, remember?: boolean): Promise<User>;
  register(input: { name: string; employeeId: string; password: string; email?: string }, remember?: boolean): Promise<User>;
  logout(): Promise<void>;
}

export interface FoundItemsService {
  list(params: FoundItemsQueryParams): Promise<Paginated<FoundItem>>;
  get(id: string): Promise<FoundItem>;
  mine(): Promise<FoundItem[]>;
  create(form: FormData): Promise<FoundItem>;
  markReturned(id: string): Promise<FoundItem>;
  archive(id: string): Promise<FoundItem>;
  remove(id: string): Promise<void>;
}

export interface LostReportsService {
  list(params: FoundItemsQueryParams): Promise<Paginated<LostReport>>;
  get(id: string): Promise<LostReport>;
  mine(): Promise<LostReport[]>;
  create(form: FormData): Promise<LostReport>;
}

export interface ClaimsService {
  mine(): Promise<Claim[]>;
  incoming(): Promise<Claim[]>;
  create(foundItemId: string, message: string): Promise<Claim>;
  review(id: string, status: 'APPROVED' | 'REJECTED', reviewNote?: string): Promise<Claim>;
  cancel(id: string): Promise<Claim>;
}

export interface NotificationsService {
  list(): Promise<Notification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}

/** Agregado de todos los servicios. */
export interface DataServices {
  auth: AuthService;
  foundItems: FoundItemsService;
  lostReports: LostReportsService;
  claims: ClaimsService;
  notifications: NotificationsService;
}

export type { AuthResponse };
