# Olivia — Asistente con IA

**Olivia** es la asistente de Lost & Found (OLO). Usa un modelo de lenguaje (OpenAI) para
responder preguntas en lenguaje natural con un tono cálido y cercano, tuteando al
colaborador. Es de **solo lectura**: desde la v0.29.0 consulta datos mediante herramientas
(function calling) que ejecuta el servidor con los permisos del usuario; nunca escribe nada.

## Herramientas (v0.29.0)

Definidas y ejecutadas en `supabase/functions/_shared/assistantTools.ts`; el bucle del
modelo está en `_shared/llm.ts` (`assistantAgent`, máx. 5 rondas, 8 llamadas y 25 s).

| Herramienta | Qué responde |
|---|---|
| `buscar_objetos` | Encontrados/perdidos en cualquier estado, con categoría, lugar, texto, rango de fechas (hallazgo/pérdida, publicación o **devolución**) y "solo los míos". Devuelve `total` + muestra. |
| `resumen` | Cuántos hay por estado y, en un rango, publicados/devueltos/recuperados. Admin: usuarios y reclamaciones pendientes. |
| `reclamaciones` | Hechas por el usuario, recibidas sobre sus objetos, o todas (solo admin). |
| `notificaciones` | Las propias y cuántas sin leer. |
| `coincidencias` | Encontrados parecidos a un reporte de perdido propio (motor de `matching.ts`). |
| `historial` | Auditoría (solo admin). |

Seguridad: la Edge Function consulta con `service_role`, así que **cada herramienta replica
la RLS** (lo `ARCHIVED`/`CLOSED` ajeno no se ve, reclamaciones solo propias o recibidas,
notificaciones propias, historial solo admin) y nunca devuelve número de colaborador,
correo, fotos ni firmas. Los argumentos del modelo se validan (enumeraciones, fechas,
límites). Las tarjetas que devuelve la respuesta (`mostrar`) solo pueden ser ids que las
herramientas devolvieron en esa petición, y se releen comprobando visibilidad.
Pruebas: `supabase/tests/assistant.test.mjs` (modelo con guion y base en memoria).

La fecha de devolución es `found_items.returned_at` (migración 015, la fija un trigger al
pasar a `RETURNED`; los ya devueltos se rellenaron con `updated_at`). Para perdidos
`RESOLVED` no hay fecha propia: se usa `updated_at` como aproximación.

> Lo que sigue describe el diseño original (Fase 1); el flujo de "Cómo funciona" se
> sustituyó por las herramientas, pero el fallback, la seguridad y la configuración siguen
> vigentes.

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

**Personalidad y conversación (0.23.0)**: Olivia también conversa sobre sí misma y sobre
cómo usar la app (la guía está en el *system prompt*). Lo ajeno a la app se rechaza con
amabilidad. El modelo responde JSON `{tipo: busqueda|conversacion|fuera_de_tema, respuesta}`;
solo en `busqueda` se muestran tarjetas (si no, `kind: 'chat'`). Los saludos y preguntas
evidentes ("¿cómo te llamas?", "¿cómo reclamo?") no consultan la BD (`isSmallTalk` en
`_shared/assistant.ts`, con respuestas fijas de respaldo). El cliente envía los últimos 6
turnos como `history` (el servidor los valida y recorta).

Antes de llamar al LLM, el servidor lee hasta 40 candidatos (filtrados por categoría,
ubicación y fecha según la intención) y prioriza los que contienen las palabras de la
pregunta; se devuelven los 10 mejores. "Hoy/ayer/esta semana" se calculan en
`APP_TIMEZONE` (`supabase/functions/_shared/time.ts`), no en UTC.

## Seguridad

- La **API key vive solo en el servidor**, como secret de la Edge Function
  (`OPENAI_API_KEY`). Nunca se expone al cliente ni se versiona.
- El LLM solo ve lo que el backend le entrega (ya filtrado); no consulta la base directamente.
- Solo texto. Las imágenes no se envían al proveedor.
- **Inyección de prompt**: pregunta y descripciones (texto de usuarios) se envían como JSON
  de datos y el system prompt ordena no seguir instrucciones incrustadas. Aun así el modelo
  sus herramientas solo leen lo que el propio usuario ya puede ver: lo peor que puede hacer
  es redactar un texto erróneo (React lo escapa).
- **Coste**: límite de 30 peticiones/min a `/ai/*` y 120 preguntas/hora al asistente por
  usuario. Cada pregunta puede hacer hasta 5 llamadas al modelo (consultas encadenadas).

## Fallback automático

Si no hay `OPENAI_API_KEY` configurada, o si la llamada al LLM falla o tarda demasiado, el
asistente **cae automáticamente al motor de palabras clave** (TF-IDF, sin servicios externos).
Así la app nunca se rompe por un problema del LLM, y encender/apagar el LLM es tan simple como
poner o quitar el secret.

## Configuración

Modelo usado: `gpt-4o-mini` (OpenAI), cambiable con el secret opcional `OPENAI_MODEL`.
Zona horaria opcional: `APP_TIMEZONE` (por defecto `America/Costa_Rica`). Para activarlo:

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

## Acciones (pendiente)

Las herramientas actuales solo leen. Dar al LLM capacidad de **acción** (reclamar, marcar
devuelto, etc.) requeriría que cada herramienta valide permisos en el servidor y pida
confirmación al usuario. No implementado.

En modo REST (Express) no hay LLM: el asistente usa solo el motor de palabras clave, que
desde la v0.29.0 también entiende "devueltos/entregados/recuperados" y "reclamados".
