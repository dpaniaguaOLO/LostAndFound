# Changelog

## [0.21.2] - 2026-10-20

### Cambiado
- **Botón de Olivia más visible**: avatar más grande, halo animado, sombra y anillo que
  resaltan, etiqueta "Pregunta a Olivia" al lado (se oculta al abrir el chat) y punto de
  "disponible". Invita más claramente a usar el asistente.

---

## [0.21.1] - 2026-10-20

### Cambiado
- **Avatar de Olivia rediseñado como robot** (antena, visor y ojos que brillan en verde
  menta sobre el verde de marca OLO). Reemplaza la carita humana anterior, que resultaba
  menos clara como asistente. Solo cambia el SVG; nombre, voz y comportamiento intactos.

---

## [0.21.0] - 2026-10-20

Olivia: identidad del asistente, y se retira la barra de búsqueda inteligente.

### Añadido
- **Olivia**, la asistente de OLO: nombre, avatar propio (SVG en el verde de marca,
  `components/OliviaAvatar.tsx`) y voz cálida en primera persona. Aparece en el botón
  flotante, la cabecera del chat y junto a cada respuesta. El prompt del LLM se ajustó para
  que responda como Olivia.

### Cambiado / Eliminado
- **Se quita la barra de "Búsqueda inteligente"** del muro: Olivia cubre esa función. Se
  elimina el componente `SmartSearch`.

### Notas
- Requiere redesplegar la Edge Function (hecho) para el nuevo prompt.
- Versión de desarrollo (sin APK).

---

## [0.20.0] - 2026-10-20

Asistente con LLM (Fase 1, solo lectura) — rama `feature/llm`.

### Añadido
- **Asistente potenciado por OpenAI** (`gpt-4o-mini`). El backend filtra por permisos los
  objetos que el usuario puede ver y el LLM redacta una respuesta en lenguaje natural sobre
  ese extracto. No accede a la base ni ejecuta acciones (solo lectura).
  - Cliente aislado en `supabase/functions/_shared/llm.ts`; integrado en el endpoint
    `POST /ai/assistant` de la Edge Function `api`.
  - La API key vive solo en el servidor (secret `OPENAI_API_KEY`); nunca en el cliente.
    Solo se envía texto (nunca fotos).
- **Fallback automático**: si no hay clave, o el LLM falla o tarda, el asistente usa el motor
  de palabras clave anterior (la app nunca se rompe por el LLM).
- Documentación: `docs/LLM.md`.

### Notas
- Verificado end-to-end contra Supabase real: el asistente responde con lenguaje natural
  usando datos reales; sin clave cae al motor clásico.
- Requiere `supabase secrets set OPENAI_API_KEY=...` y `supabase functions deploy api`.
- Fase 2 (acciones via function calling) pendiente.
- Versión de desarrollo (sin APK).

---

## [0.19.0] - 2026-10-20

Desactivación de colaboradores por el administrador (en vez de borrado, para conservar el
historial).

### Añadido
- **Desactivar / reactivar colaborador** desde el panel admin. Desactivar impide iniciar
  sesión pero conserva sus datos, publicaciones e historial; es reversible.
  - Nueva columna `profiles.active` (migración `20261020000008`) y `my_profile()` actualizada
    para exponerla.
  - Endpoint `PATCH /admin/users/:id/active` en la Edge Function `api` (revoca las sesiones
    activas al desactivar y audita `USER_ACTIVATED`/`USER_DEACTIVATED`).
  - El login rechaza a los colaboradores desactivados (cierra la sesión recién abierta); al
    cargar la app, una cuenta desactivada tampoco se considera sesión válida.
  - Panel admin: columna "Estado" (Activo/Desactivado) y botones Desactivar/Reactivar, con
    confirmación. Un admin no puede desactivarse a sí mismo.

### Notas
- Elegido **desactivar** sobre **borrar**: en una app con auditoría, eliminar se llevaría el
  historial del colaborador. La desactivación es reversible y segura.
- El modo REST (Prisma) no modela desactivación; ese endpoint responde `501` en modo `rest`.
- Requiere **redesplegar** la Edge Function y **aplicar la migración 008** (ambas hechas).

---

## [0.18.0] - 2026-10-20

Modelo de alta de usuarios por administrador (app interna): se quita el auto-registro en
modo Supabase y el admin crea las cuentas.

### Cambiado
- **Sin auto-registro en modo Supabase.** La pantalla de login ya no ofrece "Regístrate"
  cuando el backend es Supabase (flag `allowSelfRegister`, true solo en modo `rest`). Coherente
  con la opción 2 (email sintético `@lostandfound.olo`, sin confirmación por correo): las altas
  las hace un admin. En modo `rest` se conserva el registro.

### Añadido
- **Crear colaborador desde el panel admin.** Nuevo endpoint `POST /admin/users` en la Edge
  Function `api` (usa la Auth Admin API con `service_role` y `email_confirm`, ajusta perfil y
  rol, audita) y en el backend Express (paridad). Formulario `CreateUserCard` en el panel
  (número, nombre, contraseña, rol), con alta inmediata usable para iniciar sesión.

### Notas
- Requiere **redesplegar** la Edge Function: `supabase functions deploy api` (ya desplegada).
- Verificado end-to-end: el admin crea un colaborador y este inicia sesión de inmediato.

---

## [0.17.0] - 2026-10-20

Auditoría e implementación de seguridad (20 medidas). Detalle, verificación y pasos
externos en `docs/SECURITY.md`.

### Seguridad — vulnerabilidades corregidas
- **Imágenes públicas sin autenticación** (Express): `/uploads` era accesible por URL sin
  sesión. Ahora solo con URL firmada (HMAC) y caducidad, emitida por la API.
- **Cerrar sesión no invalidaba el JWT** y **resetear la contraseña no cerraba las sesiones
  abiertas** (Express y Supabase). Nuevo `POST /api/auth/logout` (revoca el `jti`),
  `sessionVersion` por usuario y `revoke_user_sessions()` en Supabase.
- **Supabase: datos de perfil expuestos** — cualquier usuario leía `employee_id` (identificador
  de login) y `email` de todos. Ahora solo `id, name, role, created_at`; el propio vía `my_profile()`.
- **Supabase: mass assignment** — el cliente podía crear objetos ya `ARCHIVED`/`CLAIMED`, escribir
  `image_signature`, editar título/cuerpo de sus notificaciones. Privilegios por columna.
- **Supabase: `anon`** tenía privilegios de tabla (solo los frenaba RLS): revocados.
- **Inyección en filtros**: el texto de búsqueda se concatenaba en `.or()` de PostgREST; y `%`/`_`
  actuaban como comodines en Express y Supabase (buscar `%` devolvía todo).
- **Enumeración de usuarios por tiempo** en el login (sin usuario no se ejecutaba bcrypt).
- **EXIF/GPS** de las fotos subidas se conservaba (Express): ahora se elimina.
- Contraseñas > 72 bytes (bcrypt las truncaba en silencio) rechazadas.
- Android: `allowBackup` desactivado (la sesión se podía extraer con `adb backup`).

### Añadido
- Rate limiting: registro, creación de contenido, IA, admin y global por IP (Express); tabla
  compartida `rate_limits` + `rate_limit_hit()` para las Edge Functions (IA, reclamaciones,
  reset de contraseña). Login: además, límite por IP.
- Validación: zod en IA/admin, rangos de fechas, longitudes; CHECK en la BD (categoría,
  ubicación, nombre, número de colaborador, foto en carpeta propia, nota de revisión); UUID en
  rutas de la Edge Function.
- Cabeceras: CSP estricta en la API y en el build del frontend (hash del script inline, sin
  `unsafe-inline`), Permissions-Policy, Referrer-Policy, HSTS en producción, CORS sin credenciales.
- HTTPS: `FORCE_HTTPS`, `TRUST_PROXY` (no se confía en `X-Forwarded-*` por defecto).
- `ALLOW_SELF_REGISTRATION` para cerrar el registro abierto en Express.
- Detección de secretos: `scripts/check-secrets.mjs` (+ hook `.githooks/pre-commit`), `.gitignore`
  ampliado (keystores, certificados, service accounts).
- Pruebas: `backend/src/security.e2e.test.ts` (13 escenarios) y `supabase/tests/db.test.mjs` (14).

### Dependencias
- `vite` 5 → 6.4.4 (+ `esbuild` 0.25): path traversal / `fs.deny` bypass en Windows del servidor dev.
- `react-router-dom` 6 → 7.18.4: open redirect (CVE-2025-68470). Producción: 0 vulnerabilidades.
- `supabase-js` fijado a versión exacta en las Edge Functions.

### Migraciones
- Supabase `20261020000007_security_hardening.sql`; Prisma `20261020150000_session_security`
  (no destructivas).

## [0.16.0] - 2026-10-20

Revisión de backend y seguridad (Claude), incluida la revisión del flujo de reclamaciones
de 0.15.0.

### Seguridad
- **Supabase: un reclamante podía autoaprobar su reclamación** con un `UPDATE` directo vía
  PostgREST (la política `claims_update_involved` lo permitía). Nueva migración
  `20261020000005_harden_rls.sql`: el cliente ya no escribe en `claims` (solo la Edge
  Function `api`), un no-admin solo puede pasar su objeto a `RETURNED` (no des-archivar ni
  marcar `CLAIMED`), y no puede cambiar su `employee_id`/`email`. Requiere desplegar antes la
  Edge Function `api` con las rutas `/claims`.
- **Express: XSS almacenado vía `/uploads`.** La extensión se tomaba del nombre original:
  un `x.html` declarado como `image/png` se servía como HTML. Ahora la extensión sale del
  MIME y el contenido se valida con `sharp`.
- **Express: el rol venía del JWT** y un admin degradado conservaba permisos hasta 12 h.
  `authenticate` relee el rol de la BD en cada petición.
- **Express: límite de intentos de login** (10 fallos / 15 min por IP + colaborador → 429).
- Nunca se puede quitar el rol al último administrador (Express y trigger en Supabase).

### Corregido
- Supabase: el trigger anti-escalada bloqueaba también los cambios de rol sin usuario
  (`service_role` de la Edge Function y `seed_users.sql`), con lo que cambiar roles desde
  el panel en modo Supabase fallaba.
- REST: "Archivar" un reporte perdido siempre fallaba con 400 (llamaba a `PATCH /:id` sin
  el cuerpo completo). Nuevo `PATCH /api/lost-reports/:id/close` (admin) + auditoría
  `LOST_REPORT_CLOSED`. El listado de perdidos oculta `CLOSED` por defecto (como Supabase).
- REST: "Restablecer contraseña" daba 404. Nuevo `POST /api/admin/users/reset-password`.
- Aprobación de reclamaciones segura ante concurrencia (antes dos aprobaciones simultáneas
  podían aprobar a dos reclamantes); no se aprueba si el objeto ya no está `PUBLISHED`; los
  rechazados en cascada reciben notificación.
- `?page=abc`, JSON mal formado, imagen > 5 MB: antes 500, ahora 200/400/413.
- Las imágenes se borran del disco al eliminar el objeto o si la petición falla.
- `/api/health` devolvía la versión fija `0.10.1`; ahora lee `VERSION`.

### Revisión del flujo de reclamaciones de v0.15.0 (Supabase)
- **Revisión atómica**: nueva función SQL `review_claim()` (migración
  `20261020000006_review_claim_rpc.sql`), que la Edge Function llama por RPC. Antes eran
  3 escrituras sueltas sin transacción ni condición de estado: dos aprobaciones simultáneas
  prosperaban ambas y un fallo a mitad dejaba datos incoherentes. Ahora bloquea las filas,
  exige objeto `PUBLISHED` para aprobar, prohíbe revisar la propia reclamación, notifica
  también a los rechazados en cascada y audita. Solo `service_role` puede ejecutarla.
- Crear: mensaje de 2 a 1000 caracteres; un duplicado concurrente devuelve 400 (antes 500).
- Cancelar: condicionado a `PENDING` (no pisa una revisión concurrente).
- Pantalla Reclamaciones en modo Supabase: `mine()`/`incoming()` devolvían filas sin
  mapear (nombres vacíos, fechas inválidas, sin título). Ahora se mapean a `Claim`, e
  `incoming()` se limita a objetos que publiqué (antes incluía las propias, con botones de
  aprobar).
- Edge Function: quitar el rol al último admin → 400; `/admin/restore` con id inexistente →
  404 (antes 500); los errores 500 ya no exponen mensajes internos de la BD.
- Express: un admin tampoco puede revisar su propia reclamación (paridad).

### Rendimiento
- Supabase: las URLs firmadas de imágenes se piden **en lote** (`createSignedUrls`) y se
  cachean 1 h, en el frontend y en la Edge Function (antes: 1 petición por imagen, p. ej. 12
  por página del muro y hasta 50 en búsqueda). El id de usuario sale de la sesión local en
  lugar de `auth.getUser()` (una llamada de red menos por operación).
- Frontend: rutas cargadas bajo demanda y dependencias (React, Supabase) en chunks
  cacheables. JS propio inicial: 530 KB → 58 KB (las dependencias se cachean aparte).

### Pruebas
- Tests unitarios de `rateLimit`/`query` (15 en total). Smoke E2E de 28 escenarios contra el
  backend y prueba de las políticas RLS sobre Postgres (PGlite) antes y después de la
  migración.

---

## [0.15.0] - 2026-10-20

Corrige el flujo de reclamaciones en modo Supabase: ahora genera notificaciones y aplica
las transiciones de estado, igual que el backend Express.

### Corregido
- **Notificaciones de reclamaciones con fecha inválida / inexistentes.** En modo Supabase,
  reclamar un objeto solo insertaba la fila de la reclamación: no avisaba al dueño, no
  cambiaba el estado del objeto al aprobar, y las notificaciones que aparecían mostraban
  "Invalid date". La causa: el flujo privilegiado (notificar a otro usuario, cambiar estado
  de objetos ajenos) no puede hacerse desde el cliente por RLS.

### Cambiado
- El flujo de reclamaciones (`crear`, `revisar`, `cancelar`) en modo Supabase pasa ahora por
  la Edge Function `api`, que corre con `service_role` y replica el comportamiento del
  backend Express:
  - Al **crear**: valida (objeto disponible, no propio, sin duplicados pendientes) y notifica
    al dueño (`CLAIM_REQUESTED`).
  - Al **aprobar**: marca el objeto como `CLAIMED`, rechaza en cascada las demás reclamaciones
    pendientes y notifica al reclamante (`CLAIM_APPROVED`).
  - Al **rechazar**: notifica al reclamante (`CLAIM_REJECTED`). Registra auditoría.
- `frontend/src/services/supabase.ts`: `claims.create/review/cancel` invocan la Edge Function.

### Notas
- Requiere **redesplegar** la Edge Function: `supabase functions deploy api`.
- Verificado end-to-end contra Supabase real: reclamar notifica al dueño, aprobar deja el
  objeto `CLAIMED` y notifica al reclamante, con `created_at` válido en todas las notificaciones.

---

## [0.14.0] - 2026-10-20

Moderación de admin más completa: paridad de acciones entre objetos encontrados y
reportes perdidos, y una vista de archivados con restauración.

### Añadido
- **Archivar reportes perdidos** (admin): además de eliminar, el admin puede archivar un
  reporte perdido, que pasa a estado `CLOSED` (equivalente a archivar un encontrado). Botones
  Archivar/Eliminar en el detalle del reporte perdido.
- **Pestaña "Archivados" en el panel admin**: lista los objetos encontrados `ARCHIVED` y los
  reportes perdidos `CLOSED` de toda la organización, con botón **Restaurar** que los devuelve
  al muro (encontrado → `PUBLISHED`, perdido → `OPEN`). Nuevos endpoints `GET /admin/archived`
  y `POST /admin/restore` en la Edge Function `api` y en el backend Express.
- Nuevas acciones de auditoría `FOUND_ITEM_RESTORED` y `LOST_REPORT_RESTORED`.

### Cambiado
- El **muro de perdidos** ahora oculta los reportes `CLOSED` (archivados), igual que el muro
  de encontrados ya ocultaba los `ARCHIVED`. Los archivados siguen visibles para su dueño en
  "Mis objetos" y en el detalle.

### Notas
- Requiere **redesplegar** la Edge Function tras actualizar: `supabase functions deploy api`.
- Verificado: build completo (shared+backend+frontend) sin errores.

---

## [0.13.0] - 2026-10-20

Supabase **Fase 2**: la IA y el panel de administración se portan a una Edge Function, de
modo que en modo `supabase` la app funciona completa sin el backend Express.

### Añadido
- **Edge Function `api`** (`supabase/functions/api/`) con router interno:
  - IA: `POST /ai/search`, `GET /ai/match/:lostReportId`, `POST /ai/assistant`.
  - Admin: `GET /admin/stats`, `GET /admin/users`, `PATCH /admin/users/:id/role`,
    `GET /admin/audit`, `GET /claims/all` (todas exigen rol ADMIN).
  - Escribe `audit_logs` en el cambio de rol. Usa `service_role` solo en el servidor.
- **Motor de IA portado a Deno** en `supabase/functions/_shared/` (nlp, matching, visual,
  assistant, serialize, http). Pesos y fórmulas idénticos al backend; verificado por diff
  que la lógica de puntuación no cambia.
- **Capa de servicios de IA/admin en el frontend**: `services/ai.ts` y ampliación de
  `services/admin.ts` (stats, users, setRole, audit, allClaims), que enrutan a la Edge
  Function en modo Supabase o al backend Express en modo `rest`.
- Cableado de `SmartSearch`, `MatchSuggestions`, `Assistant` y `AdminPage` a esa capa.

### Notas
- Con esto, en modo `supabase` la app cubre todas las funciones (CRUD + IA + admin). El
  backend Express queda como alternativa (`VITE_DATA_BACKEND=rest`).
- Verificado: build completo (shared+backend+frontend) y 11 tests del backend OK. Las Edge
  Functions **no** se compilaron ni desplegaron desde este entorno (sin Deno ni Supabase CLI);
  requieren `supabase functions deploy api` por parte del usuario.

---

## [0.12.0] - 2026-10-20

Conexión real a **Supabase** (Fase 1) en la rama `feature/supabase-android`. La UI pasa a
consumir la capa de datos `services`, de modo que con `VITE_DATA_BACKEND=supabase` el CRUD,
la autenticación y las fotos funcionan contra Supabase. El modo `rest` sigue intacto.

### Añadido
- **La UI consume la capa `services`** (antes llamaba al backend REST directo). Migrados:
  AuthContext, muro, publicar, mis objetos, detalle de encontrado/perdido, reclamaciones,
  notificaciones y el contador de notificaciones del encabezado.
- **Login por número de colaborador con email sintético** (opción 2): el email se deriva
  como `<numero>@lostandfound.olo` (dominio configurable con `VITE_SUPABASE_EMAIL_DOMAIN`).
  Helper `syntheticEmail()` en `lib/config.ts`.
- **Restablecimiento de contraseña por administrador**: Edge Function
  `supabase/functions/admin-reset-password` (verifica rol ADMIN y usa `service_role` solo en
  el servidor; registra en `audit_logs`), servicio `services/admin.ts` y formulario
  `components/PasswordResetCard.tsx` en el panel admin.
- Utilidad `lib/errors.ts` (`getErrorMessage`) para mostrar errores de forma agnóstica del
  backend (REST o Supabase).

### Notas
- **Fase 2 pendiente**: las funciones de IA (búsqueda, coincidencias, asistente) y el panel
  admin (métricas, usuarios, auditoría, bandeja global) aún dependen del backend Express;
  se portarán a Edge Functions. En modo Supabase esas vistas no cargan datos todavía.
- Verificado contra el proyecto Supabase real: las 6 tablas existen y responden con la anon
  key; build del frontend sin errores. La app Android no se recompiló en esta fase.
- Pendiente del usuario: crear usuarios, confirmar el bucket `item-photos`, desplegar la
  Edge Function y (antes de producción) rotar la anon key.

---

## [0.11.0] - 2026-10-20

Preparación para **Supabase** y **Android** (rama `feature/supabase-android`). Cambios
progresivos y reversibles: nada del comportamiento actual cambia por defecto.

### Añadido
- **Supabase preparado (no conectado).** Migraciones SQL versionadas en
  `supabase/migrations/`: esquema (`profiles`, `found_items`, `lost_reports`, `claims`,
  `notifications`, `audit_logs`), funciones helper (`is_admin()`, `handle_new_user()`),
  **RLS en todas las tablas** y bucket privado de Storage `item-photos`. No se incluyen
  credenciales reales.
- **Capa de datos del frontend con feature flag `VITE_DATA_BACKEND`** (`rest` | `supabase`,
  por defecto `rest`): interfaz común en `src/services/types.ts` con dos implementaciones.
  Cliente Supabase en `src/lib/supabase.ts` y configuración en `src/lib/config.ts`.
- **Android con Capacitor.** `frontend/capacitor.config.ts`, proyecto nativo
  `frontend/android/`, puente nativo `src/lib/native.ts` (StatusBar, Keyboard, botón atrás)
  y scripts npm (`build:mobile`, `cap:sync`, `cap:open`). Plugins: core, app, status-bar,
  keyboard.
- **Experiencia móvil**: `viewport-fit=cover` y utilidades CSS `safe-top`/`safe-bottom`/
  `safe-x` basadas en `env(safe-area-inset-*)`.
- **Documentación nueva**: `docs/ARCHITECTURE.md`, `docs/SUPABASE_SETUP.md`,
  `docs/ANDROID_SETUP.md`. `frontend/.env.example` con las variables de Supabase/API.

### Cambiado
- `frontend/src/lib/api.ts` usa `config.apiBaseUrl` para que la app Android pueda apuntar a
  un backend remoto (en web sigue usando el proxy de Vite `/api`).

### Notas
- El login sigue siendo por **número de colaborador**: en Supabase el cliente resuelve el
  email desde `profiles.employee_id`.
- La IA (NLP + firma visual + asistente) permanece en el backend Express.
- La UI aún usa `api()` directo en varias páginas; migrarla a `services` es el siguiente paso.

---

## [0.10.1] - 2026-10-19

### Corregido
- En las sugerencias de coincidencia, el nombre del objeto se cortaba cuando era largo (sobre
  todo en las tarjetas angostas de "Mis objetos"). Se reorganizó la tarjeta: el título va
  arriba, a todo el ancho, y la comparación de imágenes debajo. Ahora el nombre se ve completo.

---

## [0.10.0] - 2026-10-19

Mejoras de la vista de coincidencias y ubicación opcional.

### Añadido
- **Comparación de imágenes lado a lado** en las sugerencias de coincidencia: miniatura del
  objeto perdido junto a la del encontrado, con el porcentaje en medio.
- **Desglose del porcentaje** por señal (descripción, imagen, categoría, ubicación, fecha)
  con barras, expandible con "Ver por qué coincide". El backend devuelve `breakdown`.
- **Página de detalle del objeto perdido** (`/perdidos/:id`) que muestra las coincidencias
  de la IA de forma destacada (no colapsadas).

### Cambiado
- La **ubicación es opcional al reportar un objeto perdido** (quien pierde algo a menudo no
  sabe dónde lo dejó). El emparejado tolera la ubicación vacía.

---


## [0.9.0] - 2026-10-19

Privilegios de administración: moderación, supervisión e historial.

### Añadido
- **Moderación de objetos** (admin): editar, archivar y eliminar cualquier objeto
  encontrado o perdido, no solo los propios. Botones en el detalle del objeto.
  - `PATCH /api/found-items/:id`, `DELETE /api/found-items/:id`, y equivalentes en
    `lost-reports`.
- **Bandeja global de reclamaciones** para admin (`GET /api/claims/all`) y pestaña
  "Reclamaciones" en el panel.
- **Historial / auditoría** (`GET /api/admin/audit`, modelo `AuditLog`): registra
  devoluciones, moderación, revisión de reclamaciones y cambios de rol, con autor y fecha.
  Pestaña "Historial" en el panel.
- Panel de administración reorganizado en pestañas: Resumen · Reclamaciones · Historial.

### Notas
- El borrado es solo para admin y pide confirmación; se prefiere "archivar" (reversible)
  frente a "eliminar" (permanente). Todo queda registrado en el historial.
- Migración `audit_log`.

---


## [0.8.0] - 2026-10-19 (rama `feature/ia-visual`)

Búsqueda visual ligera (sin modelos pesados ni servicios externos).

### Añadido
- **Firma visual de imágenes** (`backend/src/lib/visual.ts`): dHash (estructura) +
  histograma de color por rejilla, calculados con `sharp`. Rápido, local, sin GPU.
- Al subir una foto (encontrado o perdido) se calcula y guarda su firma en
  `imageSignature` (migración `image_signature`).
- El **emparejado** suma una señal de **similitud visual** cuando ambos objetos tienen
  foto (reescalando los pesos), y muestra el motivo "Imagen parecida" en coincidencias
  fuertes. Aplica también al aviso automático.
- Script `backend/scripts/backfill_signatures.ts` para firmar imágenes ya existentes.
- Pruebas del motor visual (`visual.test.ts`).

### Notas
- Es una base **ligera** a propósito (hash + color), no un modelo neuronal. Distingue bien
  color y forma general; con fotos reales mejora respecto a imágenes planas. La capa está
  aislada para sustituirla por embeddings (CLIP/MobileNet) más adelante sin tocar la app.

---


## [0.7.0] - 2026-10-19 (rama `feature/ia`)

Fase 1 de asistencia con IA local (sin LLM).

### Añadido
- **Aviso automático de coincidencias**: al reportar un objeto perdido, el sistema busca
  entre los encontrados y, si hay una coincidencia fuerte (≥55%), envía una notificación
  `MATCH_FOUND` al dueño con el porcentaje y un enlace al objeto.
- **Asistente de búsqueda** (botón flotante en toda la app): interpreta preguntas frecuentes
  por intención (categoría, ubicación, rango de fecha; encontrados vs perdidos) y responde
  con datos reales de la base, enlazando los objetos. No es un LLM ni conversa libremente.
- Backend: `POST /api/ai/assistant`, `backend/src/lib/assistant.ts`,
  `backend/src/lib/matchNotify.ts`. Contratos `AssistantRequest/Response` y tipo de
  notificación `MATCH_FOUND` en `@laf/shared`.
- Las notificaciones con objeto relacionado ahora llevan a su detalle al pulsarlas.

---

## [0.6.0] - 2026-10-19 (rama `feature/ia`)

Búsqueda inteligente y emparejado con IA local (sin servicios externos).

### Añadido
- **Motor de IA local** (`backend/src/lib/nlp.ts`, `matching.ts`): NLP clásico con
  normalización en español (acentos, stopwords, stemming ligero, sinónimos del dominio),
  TF-IDF + similitud de coseno, y señales de categoría/ubicación/fecha. Con pruebas.
- **Búsqueda semántica** (`POST /api/ai/search`): el colaborador describe el objeto en
  lenguaje natural y recibe los encontrados ordenados por relevancia (0–100%).
- **Emparejado perdido↔encontrado** (`GET /api/ai/match/:lostReportId`): sugiere objetos
  encontrados que podrían corresponder a un perdido, con porcentaje y motivos.
- Frontend: caja de **Búsqueda inteligente** en el Muro y panel **"Ver posibles
  coincidencias"** en cada objeto perdido de "Mis objetos".
- Contratos en `@laf/shared`: `ScoredFoundItem`, `SemanticSearchRequest/Response`,
  `MatchSuggestionsResponse`.

### Notas
- Toda la IA corre en el servidor; **no** se usan proveedores externos ni API keys, y no se
  envían datos a terceros. La capa está aislada para poder migrar a embeddings más adelante.

---


Todas las versiones relevantes de Lost and Found se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [0.5.0] - 2026-10-19

Reestructuración de módulos según el flujo de trabajo del colaborador.

### Cambiado
- **Muro**: ahora muestra las publicaciones de todos los colaboradores con pestañas
  **Encontrados** y **Perdidos**.
- **Mis objetos** (antes "Mis publicaciones"): los objetos propios, con pestañas
  **Perdidos** y **Encontrados**.
- **Publicar**: una sola pantalla con selector **"Encontré un objeto" / "Perdí un objeto"**
  que usa el endpoint y los textos correspondientes.
- Navegación simplificada: **Muro · Mis objetos · Publicar · Reclamaciones** (se elimina la
  sección separada de "Perdidos"; los perdidos viven en el Muro y en Mis objetos).

### Eliminado
- Página independiente de reporte de perdidos (`LostReportsPage`): su función se integró en
  Publicar y en el Muro.

---

## [0.4.1] - 2026-10-19

### Cambiado
- **Barra de navegación rediseñada**: etiquetas cortas de una palabra
  (Encontrados · Perdidos · Publicar · Reclamaciones) para que no se partan ni se
  desalineen. Se añadió un **menú de usuario** (avatar + nombre) que agrupa
  "Mis publicaciones" y "Cerrar sesión".
- Se elimina la redundancia: "Mis publicaciones" ya no ocupa un espacio en la barra
  principal; se accede desde el menú de usuario (y desde el menú móvil).

---

## [0.4.0] - 2026-10-19

Login por número de colaborador, ajustes de navegación, cámara y mobile-first.

### Añadido
- Inicio de sesión con **número de colaborador** en lugar de correo (campo `employeeId`,
  único). El correo pasa a ser opcional.
- En el login: **mostrar/ocultar contraseña** y **"Recordar este dispositivo"**
  (sesión persistente en `localStorage` si se marca, en `sessionStorage` si no).
- En "Publicar": botón **"Tomar foto"** (abre la cámara en móvil) además de "Elegir archivo",
  con vista previa y opción de quitar la imagen.

### Cambiado
- Navegación: "Perdidos" → **"Objetos perdidos"** (muro general); se elimina "Mis cosas"
  y se renombra a **"Mis publicaciones"** (encontrados + perdidos propios, en pestañas).
- **Rediseño mobile-first**: cabeceras que se apilan en móvil, botones de ancho completo,
  títulos adaptables y formularios en una columna.

### Corregido
- **Contraste del modo oscuro**: los números de las tarjetas del panel de administración
  (y otros textos con la tinta de marca) ahora son legibles en tema oscuro.

### Migración
- `employee_id_login`: añade `employeeId` (único) y hace `email` opcional en `User`.

---

## [0.3.2] - 2026-10-19

### Cambiado
- Las superficies del modo oscuro pasan a **gris oscuro / negro neutro** (`#0b0e12`,
  `#151a21`, `#272e38`) en lugar del tinte verde. El verde de marca OLO se conserva solo
  como color de acento.

---

## [0.3.1] - 2026-10-19

Correcciones del modo oscuro y refuerzo de la identidad de OLO.

### Corregido
- El botón de cambio de tema ahora aplica el cambio directamente al DOM en el clic
  (antes podía no reflejarse si el estado y el DOM se desincronizaban).
- El logo de OLO era casi invisible en modo oscuro: ahora el SVG está incrustado y el
  texto del wordmark se aclara en oscuro, manteniendo el bloque verde de marca.

### Cambiado
- Las superficies del modo oscuro usan un **tinte verde de OLO** (`olo-dark-950/900/800`)
  en vez de gris neutro, para que el tema oscuro siga sintiéndose corporativo.

---

## [0.3.0] - 2026-10-19

Modo oscuro.

### Añadido
- Modo oscuro con estrategia `class` de Tailwind (`darkMode: 'class'`).
- `ThemeContext` con persistencia en `localStorage` (`laf.theme`) y respeto de la
  preferencia del sistema (`prefers-color-scheme`) cuando no hay elección manual.
- Botón de alternancia (sol/luna) en la barra de navegación.
- Script anti-parpadeo (FOUC) en `index.html` que aplica el tema antes de pintar.
- Variantes `dark:` en tokens de componentes (botones, inputs, tarjetas) y en todas las
  páginas y componentes; los colores de estado funcional también tienen versión oscura.

---

## [0.2.0] - 2026-10-19

Identidad visual corporativa de OLO (Overseas Logistics Operations).

### Añadido
- Investigación de marca documentada en `docs/OLO_BRAND_RESEARCH.md` (fuentes oficiales,
  colores verificados, tipografía, logo).
- Logo y favicon oficiales de OLO (`frontend/src/assets/logo-olo.svg`,
  `frontend/public/favicon-olo.svg`) y componente reutilizable `Logo`.
- Sistema de diseño con tokens centralizados: paleta `olo-*` (verde de marca `#00a785`),
  color de tinta `#251e1f`, tipografía **Open Sans** (Google Fonts).

### Cambiado
- La identidad pasa de un azul genérico al **verde corporativo de OLO** en botones,
  enlaces, navegación, foco de formularios y acentos.
- Logo oficial de OLO en la barra de navegación y la pantalla de inicio de sesión.
- Panel de administración con tarjetas de métricas al estilo de los indicadores de OLO.
- Los colores de **estado funcional** (publicado/abierto ahora en azul neutro) se mantienen
  independientes del verde de marca para evitar confusión; éxito/devuelto usa verde neutro.
- Título y `theme-color` de la app alineados con OLO.

---

## [0.1.0] - 2026-10-19

Primera versión funcional de desarrollo (MVP). Base completa frontend + backend.

### Añadido
- **Monorepo** con npm workspaces: `packages/shared`, `backend`, `frontend`.
- **`@laf/shared`**: tipos y contratos compartidos (única fuente de verdad).
- **Backend** (Node + Express + TypeScript + Prisma + SQLite):
  - Autenticación JWT con bcrypt (`register`, `login`, `me`).
  - CRUD de objetos encontrados con búsqueda, filtros y paginación; subida de imágenes.
  - Reportes de objetos perdidos con búsqueda y filtros.
  - Flujo de reclamaciones (crear, listar propias/recibidas, aprobar/rechazar, cancelar)
    con transiciones de estado y notificaciones.
  - Notificaciones (listar, marcar leída, marcar todas).
  - Panel de administración (estadísticas, gestión de usuarios y roles).
  - Seguridad: helmet, CORS, validación con zod, autorización por rol y por recurso.
  - Migración inicial de Prisma y datos de ejemplo (seed).
- **Frontend** (React + Vite + TypeScript + Tailwind + React Router):
  - Pantallas: inicio de sesión, muro de objetos, detalle, publicar, reportar perdido,
    búsqueda y filtros, reclamaciones (recibidas/propias), mis cosas, notificaciones,
    panel admin, y página 404.
  - Sistema de diseño con componentes reutilizables y estados de carga, error y vacío.
  - Cliente HTTP único, contexto de autenticación y notificaciones (toasts).
  - Diseño responsive y navegación adaptada a móvil.
- **Documentación**: `CLAUDE.md` (contexto compartido), `README.md`,
  `docs/DEVELOPMENT_STATUS.md`, este `CHANGELOG.md` y `VERSION`.

### Notas
- Implementado por Kiro bajo autorización temporal para trabajar en frontend y backend.
- Pendiente para futuras versiones: pruebas automatizadas, emparejado perdido↔encontrado,
  recuperación de contraseña, migración a PostgreSQL y almacenamiento de imágenes en la nube.

[0.1.0]: https://example.com/lost-and-found/releases/0.1.0
