/**
 * Implementación REST de la capa de datos: usa el backend Express actual.
 * Es el comportamiento por defecto (VITE_DATA_BACKEND != 'supabase').
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
import { api, tokenStore } from '../lib/api';
import type {
  AuthService,
  ClaimsService,
  DataServices,
  FoundItemsQueryParams,
  FoundItemsService,
  LostReportsService,
  NotificationsService,
} from './types';

function buildQuery(params: FoundItemsQueryParams): string {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.category) q.set('category', params.category);
  if (params.location) q.set('location', params.location);
  if (params.page) q.set('page', String(params.page));
  const s = q.toString();
  return s ? `?${s}` : '';
}

const auth: AuthService = {
  getCurrentUser: () => api<User>('/auth/me').catch(() => null),
  async login(employeeId, password, remember = true) {
    const res = await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { employeeId, password },
      auth: false,
    });
    tokenStore.set(res.token, remember);
    return res.user;
  },
  async register(input, remember = true) {
    const res = await api<AuthResponse>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    });
    tokenStore.set(res.token, remember);
    return res.user;
  },
  async logout() {
    // Revoca el token en el servidor (si falla, p. ej. sin red, se cierra igual en local).
    try {
      if (tokenStore.get()) await api('/auth/logout', { method: 'POST' });
    } catch {
      /* el token caducará igualmente */
    }
    tokenStore.clear();
  },
};

const foundItems: FoundItemsService = {
  list: (p) => api<Paginated<FoundItem>>(`/found-items${buildQuery(p)}`),
  get: (id) => api<FoundItem>(`/found-items/${id}`),
  mine: () => api<FoundItem[]>('/found-items/mine/list'),
  create: (form) => api<FoundItem>('/found-items', { method: 'POST', formData: form }),
  markReturned: (id) => api<FoundItem>(`/found-items/${id}/return`, { method: 'PATCH' }),
  archive: (id) => api<FoundItem>(`/found-items/${id}/archive`, { method: 'PATCH' }),
  remove: async (id) => {
    await api(`/found-items/${id}`, { method: 'DELETE' });
  },
};

const lostReports: LostReportsService = {
  list: (p) => api<Paginated<LostReport>>(`/lost-reports${buildQuery(p)}`),
  get: (id) => api<LostReport>(`/lost-reports/${id}`),
  mine: () => api<LostReport[]>('/lost-reports/mine/list'),
  create: (form) => api<LostReport>('/lost-reports', { method: 'POST', formData: form }),
  close: (id) => api<LostReport>(`/lost-reports/${id}/close`, { method: 'PATCH' }),
  remove: async (id) => {
    await api(`/lost-reports/${id}`, { method: 'DELETE' });
  },
};

const claims: ClaimsService = {
  mine: () => api<Claim[]>('/claims/mine'),
  incoming: () => api<Claim[]>('/claims/incoming'),
  create: (foundItemId, message) =>
    api<Claim>('/claims', { method: 'POST', body: { foundItemId, message } }),
  review: (id, status, reviewNote) =>
    api<Claim>(`/claims/${id}/review`, { method: 'PATCH', body: { status, reviewNote } }),
  cancel: (id) => api<Claim>(`/claims/${id}/cancel`, { method: 'PATCH' }),
};

const notifications: NotificationsService = {
  list: () => api<Notification[]>('/notifications'),
  markRead: async (id) => {
    await api(`/notifications/${id}/read`, { method: 'PATCH' });
  },
  markAllRead: async () => {
    await api('/notifications/read-all', { method: 'PATCH' });
  },
};

export const restServices: DataServices = {
  auth,
  foundItems,
  lostReports,
  claims,
  notifications,
};
