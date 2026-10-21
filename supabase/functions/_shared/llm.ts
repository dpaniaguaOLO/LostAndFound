// Cliente de LLM (OpenAI) para el asistente — Fase 1 (solo lectura).
//
// El LLM NUNCA accede a la base de datos ni ejecuta acciones: el backend ya
// seleccionó y filtró por permisos los objetos que el usuario puede ver, y aquí
// solo se le pide redactar una respuesta en lenguaje natural a partir de ESE
// extracto. Si no hay API key o la llamada falla, se devuelve null y el
// asistente cae al motor de palabras clave (composeAnswer).
//
// La clave vive solo en el servidor (secret OPENAI_API_KEY de la Edge Function),
// nunca en el cliente. Solo se envía texto (título, categoría, ubicación, fecha,
// descripción recortada); nunca fotos ni datos sensibles.

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 12_000;

/** Objeto compacto que se envía al LLM (sin datos sensibles). */
export interface AssistantItem {
  kind: 'found' | 'lost';
  title: string;
  category: string;
  location: string;
  date: string; // ISO
  description: string;
}

/** ¿Está configurado el LLM? (hay API key en el entorno del servidor) */
export function llmConfigured(): boolean {
  return !!Deno.env.get('OPENAI_API_KEY');
}

/**
 * Pide al LLM una respuesta en español basada EXCLUSIVAMENTE en los objetos dados.
 * Devuelve el texto, o null si no hay clave / hay error / tarda demasiado
 * (el llamador hace fallback al motor clásico).
 */
export async function assistantAnswer(
  question: string,
  items: AssistantItem[],
): Promise<string | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;

  // Recorta descripciones para acotar tokens y no filtrar textos largos.
  const compact = items.slice(0, 12).map((i) => ({
    tipo: i.kind === 'found' ? 'encontrado' : 'perdido',
    titulo: i.title,
    categoria: i.category,
    ubicacion: i.location || '(no indicada)',
    fecha: i.date?.slice(0, 10) ?? '',
    descripcion: (i.description ?? '').slice(0, 200),
  }));

  const system =
    'Eres Olivia, la asistente de Lost & Found, la app interna de objetos perdidos y ' +
    'encontrados de OLO (Overseas Logistics Operations). Hablas en primera persona como ' +
    'Olivia, con un tono cálido, cercano y servicial, tuteando al colaborador. ' +
    'Responde SIEMPRE en español, de forma breve y clara (1-3 frases). ' +
    'Usa ÚNICAMENTE la información de la lista de objetos que se te entrega; ' +
    'no inventes objetos, datos ni cantidades. Si la lista está vacía, dilo con naturalidad ' +
    'y ofrece ayudar a buscar de otra forma. No te presentes en cada mensaje (solo si te ' +
    'saludan). No incluyas enlaces ni IDs; la app ya muestra las tarjetas de los objetos.';

  const user =
    `Pregunta del colaborador: ${question}\n\n` +
    `Objetos disponibles (ya filtrados por permisos): ${JSON.stringify(compact)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('[llm] HTTP', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch (e) {
    console.error('[llm]', (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
