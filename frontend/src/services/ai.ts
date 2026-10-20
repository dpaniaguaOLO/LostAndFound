/**
 * Servicio de IA (búsqueda semántica, coincidencias, asistente).
 *
 * En REST llama al backend Express (/api/ai/*). En Supabase invoca la Edge
 * Function `api`, que reimplementa la misma lógica (ver supabase/functions/api).
 * La UI usa esta capa y no sabe qué backend hay detrás.
 */
import type {
  AssistantResponse,
  MatchSuggestionsResponse,
  SemanticSearchResponse,
} from '@laf/shared';
import { useSupabase } from '../lib/config';
import { requireSupabase } from '../lib/supabase';
import { api } from '../lib/api';

export interface AiService {
  search(query: string): Promise<SemanticSearchResponse>;
  match(lostReportId: string): Promise<MatchSuggestionsResponse>;
  assistant(question: string): Promise<AssistantResponse>;
}

/** Invoca la Edge Function `api` con método y ruta, devolviendo JSON tipado. */
async function invokeEdge<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke(`api${path}`, {
    method: method as 'GET' | 'POST' | 'PATCH',
    body,
  });
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
  return data as T;
}

const supabaseAi: AiService = {
  search: (query) => invokeEdge<SemanticSearchResponse>('POST', '/ai/search', { query }),
  match: (lostReportId) =>
    invokeEdge<MatchSuggestionsResponse>('GET', `/ai/match/${lostReportId}`),
  assistant: (question) => invokeEdge<AssistantResponse>('POST', '/ai/assistant', { question }),
};

const restAi: AiService = {
  search: (query) =>
    api<SemanticSearchResponse>('/ai/search', { method: 'POST', body: { query } }),
  match: (lostReportId) => api<MatchSuggestionsResponse>(`/ai/match/${lostReportId}`),
  assistant: (question) =>
    api<AssistantResponse>('/ai/assistant', { method: 'POST', body: { question } }),
};

export const aiService: AiService = useSupabase ? supabaseAi : restAi;
