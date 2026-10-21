# Olivia — Asistente con IA (Fase 1)

**Olivia** es la asistente de Lost & Found (OLO). Usa un modelo de lenguaje (OpenAI) para
responder preguntas en lenguaje natural con un tono cálido y cercano, tuteando al
colaborador. Esta es la **Fase 1: solo lectura** — el LLM no accede a la base de datos ni
ejecuta acciones; solo redacta una respuesta a partir de datos que el servidor ya seleccionó
y filtró por permisos.

Identidad: nombre **Olivia**, avatar SVG propio en `frontend/src/components/OliviaAvatar.tsx`
(verde de marca OLO), personalidad definida en el *system prompt* de
`supabase/functions/_shared/llm.ts`. Olivia reemplaza la antigua barra de "búsqueda
inteligente" del muro.

## Cómo funciona

1. El colaborador escribe una pregunta en el asistente.
2. La Edge Function `api` (ruta `POST /ai/assistant`) interpreta la intención y **consulta
   Supabase** los objetos que ese usuario puede ver (filtrado por permisos/RLS).
3. Se envía al LLM: la pregunta + un extracto compacto de esos objetos (título, categoría,
   ubicación, fecha, descripción recortada). **Nunca se envían fotos ni datos sensibles.**
4. El LLM devuelve una respuesta breve en español, basada únicamente en esos datos.
5. La app muestra el texto del LLM junto con las tarjetas de los objetos reales.

El código del cliente vive en `supabase/functions/_shared/llm.ts`; la integración en
`supabase/functions/api/index.ts` (endpoint `/ai/assistant`).

## Seguridad

- La **API key vive solo en el servidor**, como secret de la Edge Function
  (`OPENAI_API_KEY`). Nunca se expone al cliente ni se versiona.
- El LLM solo ve lo que el backend le entrega (ya filtrado); no consulta la base directamente.
- Solo texto. Las imágenes no se envían al proveedor.

## Fallback automático

Si no hay `OPENAI_API_KEY` configurada, o si la llamada al LLM falla o tarda demasiado, el
asistente **cae automáticamente al motor de palabras clave** (TF-IDF, sin servicios externos).
Así la app nunca se rompe por un problema del LLM, y encender/apagar el LLM es tan simple como
poner o quitar el secret.

## Configuración

Modelo usado: `gpt-4o-mini` (OpenAI). Para activarlo:

```bash
# 1. Verifica que la clave es válida (debe listar modelos):
#    curl https://api.openai.com/v1/models -H "Authorization: Bearer <clave>"
# 2. Guarda la clave como secret del proyecto Supabase:
supabase secrets set OPENAI_API_KEY=<clave-completa-sk-proj-...>
# 3. Redespliega la función para que tome el secret:
supabase functions deploy api
```

> La clave de OpenAI empieza por `sk-proj-...` y es larga (~160 caracteres). Pégala completa,
> sin añadir ni duplicar el prefijo. Si al guardarla da `401 Incorrect API key`, verifica que
> no haya espacios/saltos de línea (usar `--env-file` evita problemas de shell).

## Consideraciones

- **Privacidad**: usar un LLM por API envía las descripciones de objetos a un tercero
  (OpenAI). Para una app interna de OLO, validar esta decisión con quien lleve privacidad.
- **Costo**: `gpt-4o-mini` es de bajo costo, pero cada consulta del asistente consume tokens.
- **Proyecto Supabase en plan Free**: se pausa por inactividad; mientras está pausado, las
  Edge Functions no responden (reactivar desde el panel con "Restore project").

## Fase 2 (pendiente)

Dar al LLM capacidad de **acción** (function calling): p. ej. disparar avisos o registrar
seguimientos. Requiere que cada herramienta valide permisos en el servidor (el LLM propone,
el backend autoriza y ejecuta). No implementado todavía.
