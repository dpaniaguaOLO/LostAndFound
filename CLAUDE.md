# CLAUDE.md — Contexto compartido de Lost and Found

> Fuente principal de contexto para Claude y Kiro. Léelo antes de tocar código.
> Mantenerlo actualizado cuando cambien arquitectura, contratos de API, modelo de
> datos, responsabilidades, decisiones técnicas o estado de funcionalidades.
> **Nunca** incluir secretos reales (contraseñas, tokens, claves privadas).

---

## A. Resumen del proyecto

**Lost and Found** es una aplicación web interna para los trabajadores de una empresa.
Facilita recuperar objetos perdidos y encontrados dentro de las instalaciones.

**Flujo principal**
1. Un trabajador encuentra un objeto y lo publica (foto, descripción, ubicación, fecha).
2. La publicación aparece en un muro general para trabajadores autorizados.
3. Los trabajadores consultan, buscan y filtran publicaciones.
4. Quien reconoce un objeto como suyo solicita reclamarlo con un mensaje.
5. El autor del hallazgo (o un administrador) aprueba o rechaza la reclamación.
6. Al aprobar, el objeto pasa a `CLAIMED`; tras la entrega se marca `RETURNED`.
7. También se pueden reportar objetos perdidos para compararlos con los encontrados.

**Estado de funcionalidades** (detalle en §H):
- Implementado: auth, muro con búsqueda/filtros/paginación, publicación con foto,
  reportes de perdidos, flujo de reclamaciones con notificaciones, "mis cosas",
  notificaciones, panel admin (stats + gestión de roles), marcar devuelto/archivar.
- Pendiente: emparejado automático perdido↔encontrado, notificaciones por email,
  almacenamiento de imágenes en la nube, recuperación de contraseña, pruebas automatizadas.

---

## B. Arquitectura

**Stack**
- Monorepo con **npm workspaces**.
- Frontend: **React 18 + Vite 5 + TypeScript** (strict) + **Tailwind CSS 3** + **React Router 6**.
- Backend: **Node + Express 4 + TypeScript** (ESM) + **Prisma 5** + **SQLite** (desarrollo).
- Tipos/contratos compartidos: paquete **`@laf/shared`** (única fuente de verdad).
- Identidad visual alineada con **OLO** (verde de marca `#00a785`, tipografía Open Sans,
  logo oficial). Investigación en `docs/OLO_BRAND_RESEARCH.md`; tokens centralizados en
  `frontend/tailwind.config.js` (paleta `olo-*`, alias `brand-*` → `olo`) y
  `frontend/src/index.css`.
- **Modo claro/oscuro**: Tailwind `darkMode: 'class'`. Estado en `ThemeContext`
  (persistido en `localStorage` `laf.theme`, con respeto de `prefers-color-scheme`).
  Toggle en la barra de navegación. Script anti-FOUC en `index.html`.
- Auth: **JWT** (header `Authorization: Bearer`), contraseñas con **bcryptjs**.
- Validación: **zod** en el backend. Subida de imágenes: **multer 2.x** a disco local.
- Seguridad HTTP: **helmet** + **cors**.
- **IA local (sin servicios externos)**: motor de NLP clásico (TF-IDF + similitud de coseno
  + señales de categoría/ubicación/fecha) en `backend/src/lib/nlp.ts` y
  `backend/src/lib/matching.ts`. Da búsqueda semántica y emparejado perdido↔encontrado.
  No usa ningún proveedor externo ni API key; todo corre en el servidor. Capa aislada:
  se puede sustituir por embeddings en el futuro sin tocar las rutas.
  - **Aviso automático**: al crear un reporte perdido (`POST /lost-reports`), se ejecuta el
    emparejado y, si la mejor coincidencia ≥55%, se notifica al dueño (`matchNotify.ts`).
  - **Asistente de búsqueda** (`assistant.ts`): intención por palabras clave, sin LLM.
  - **Búsqueda visual ligera** (`visual.ts`, rama `feature/ia-visual`): firma de imagen
    (dHash + histograma de color con `sharp`) guardada en `imageSignature`. Añade una señal
    de similitud visual al emparejado cuando ambos objetos tienen foto. Sin modelos pesados
    ni servicios externos; capa aislada para migrar a embeddings (CLIP) en el futuro.

**Estructura de carpetas**
```
LostAndFound/
├─ package.json            # workspaces + scripts raíz
├─ VERSION                 # versión semántica actual
├─ CHANGELOG.md
├─ CLAUDE.md               # este archivo
├─ docs/
│  └─ DEVELOPMENT_STATUS.md
├─ packages/shared/        # @laf/shared: tipos y contratos (TS)
│  └─ src/index.ts
├─ backend/                # API Express (@laf/backend)
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  ├─ migrations/
│  │  └─ seed.ts
│  ├─ uploads/             # imágenes subidas (ignorado por git salvo .gitkeep)
│  └─ src/
│     ├─ server.ts         # arranque
│     ├─ app.ts            # ensamblado de Express
│     ├─ config.ts         # variables de entorno
│     ├─ db.ts             # instancia Prisma
│     ├─ lib/              # auth, http, validation, serialize, notify, asyncHandler
│     ├─ middleware/       # authenticate (+requireAdmin, errorHandler), upload
│     └─ routes/           # auth, foundItems, lostReports, claims, notifications, admin
└─ frontend/               # SPA React (@laf/frontend)
   └─ src/
      ├─ main.tsx, router.tsx, index.css
      ├─ context/          # AuthContext, ToastContext
      ├─ lib/              # api.ts (cliente HTTP), format.ts, useDebounce.ts
      ├─ components/       # ui, Layout, ProtectedRoute, ItemCard, Filters, ItemForm
      └─ pages/            # Login, Wall, FoundItemDetail, LostReports, Publish,
                           #   MyThings, Claims, Notifications, Admin, NotFound
```

**Base de datos**: SQLite en desarrollo (`backend/prisma/dev.db`, ignorado por git).
Para producción se recomienda migrar a PostgreSQL (ver §G).

**Autenticación**: JWT firmado con `JWT_SECRET`. El inicio de sesión es por **número de
colaborador** (`employeeId`, único) + contraseña (el correo ya no se usa para entrar). El
token se guarda en el frontend según "Recordar este dispositivo": `localStorage` (`laf.token`,
persistente) si se marca, o `sessionStorage` si no. Expiración configurable (`JWT_EXPIRES_IN`,
por defecto 12h).

**Almacenamiento de imágenes**: disco local en `backend/uploads`, servido en
`/uploads/<archivo>`. En producción debería moverse a almacenamiento privado (S3 o
equivalente) con URLs firmadas (ver §F y §G).

**Servicios externos**: ninguno activo por ahora. **Supabase** está *preparado pero no
conectado* (ver más abajo y `docs/SUPABASE_SETUP.md`).

**Infraestructura / despliegue**: aún no definido.

### Preparación para Supabase y Android (rama `feature/supabase-android`)

El proyecto se ha preparado de forma **progresiva y reversible** para dos objetivos, sin
romper ni eliminar nada de lo existente. Documentación completa en
`docs/ARCHITECTURE.md`, `docs/SUPABASE_SETUP.md` y `docs/ANDROID_SETUP.md`.

- **Supabase (PostgreSQL + Auth + Storage), Fase 1 CONECTADA.** El `.env` del repo NO se
  versiona (credenciales fuera de git). Piezas:
  - Migraciones SQL versionadas en `supabase/migrations/` (esquema, helpers, RLS, Storage).
  - RLS en todas las tablas; `service_role` nunca en el cliente.
  - Cliente JS (`frontend/src/lib/supabase.ts`) y capa de datos con interfaz común
    (`frontend/src/services/`): implementaciones `rest` y `supabase`. **La UI ya consume
    `services`** (AuthContext, muro, publicar, mis objetos, detalles, reclamaciones,
    notificaciones).
  - Feature flag **`VITE_DATA_BACKEND`** (`rest` por defecto → no cambia nada; `supabase`
    activa el backend de Supabase para el CRUD).
  - Login por **número de colaborador** con **email sintético** `<numero>@lostandfound.olo`
    (opción 2; dominio en `VITE_SUPABASE_EMAIL_DOMAIN`). Helper `syntheticEmail()`.
  - **Reset de contraseña por admin**: Edge Function `supabase/functions/admin-reset-password`
    (verifica ADMIN + usa `service_role` en servidor), `services/admin.ts`, `PasswordResetCard`.
  - **Fase 2 COMPLETA**: IA (`/ai/*`) y panel admin (`/admin/*`, `/claims/all`) portados a la
    Edge Function `api` (`supabase/functions/api/`), con el motor NLP/matching/firma visual en
    `supabase/functions/_shared/` (port verbatim de `backend/src/lib/`). El frontend los consume
    vía `services/ai.ts` y `services/admin.ts` (enrutan Edge Function o Express según el flag).
    En modo `supabase` la app funciona completa sin el backend Express. Requiere desplegar la
    Edge Function (`supabase functions deploy api`).
- **Android con Capacitor** (elegido sobre React Native/Expo para reutilizar la web):
  - `frontend/capacitor.config.ts`, proyecto nativo en `frontend/android/`.
  - Puente nativo `frontend/src/lib/native.ts` (StatusBar, Keyboard, botón atrás); *no-op*
    en web. Safe-areas vía `viewport-fit=cover` + utilidades CSS `safe-*`.
  - Scripts: `build:mobile`, `cap:sync`, `cap:open`.
- **La IA (NLP + firma visual + asistente) se queda en el backend Express.** Es cómputo,
  no SQL; las operaciones con privilegios irían en Edge Functions (`service_role`).

---

## C. División de responsabilidades

| Área | Responsable habitual |
|------|----------------------|
| Frontend (UI, UX, navegación, formularios, integración de APIs desde el cliente, pruebas de interfaz) | **Kiro** |
| Backend (APIs, lógica de negocio, base de datos y migraciones, auth del servidor, seguridad, almacenamiento de archivos, notificaciones del servidor, pruebas del backend) | **Claude** |

**Autorización temporal vigente**: Kiro tiene permiso para trabajar en **frontend y
backend** porque no hay cargas disponibles de Claude. Todo el código actual (frontend +
backend + shared) fue implementado por Kiro bajo esta autorización.

**Traspaso a Claude**: cuando el usuario lo indique explícitamente, Kiro dejará de iniciar
tareas de backend no esenciales y Claude asumirá el backend. El backend ya implementado
**no debe revertirse**; Claude parte de lo documentado aquí. Coordinar cambios que toquen
ambas partes mediante los contratos de `@laf/shared` y este archivo.

---

## D. Contratos de API

Base URL en desarrollo: `http://localhost:4000` (el frontend usa el proxy de Vite, así que
llama a rutas `/api/...` relativas). Todas las respuestas son JSON.

**Autenticación**: salvo `register`, `login` y `health`, todos los endpoints requieren
header `Authorization: Bearer <token>`. Rutas `/api/admin/*` requieren además rol `ADMIN`.

**Formato de error** (todas las rutas):
```json
{ "error": "CODE", "message": "texto legible", "details": {} }
```
Códigos HTTP usados: 400 (BAD_REQUEST, también JSON mal formado), 401 (UNAUTHORIZED),
403 (FORBIDDEN), 404 (NOT_FOUND), 409 (CONFLICT), 413 (PAYLOAD_TOO_LARGE, imagen > límite),
429 (TOO_MANY_REQUESTS, login bloqueado; incluye cabecera `Retry-After`), 500 (INTERNAL).

Query strings tolerantes: `page`/`pageSize`/`limit` no numéricos usan el valor por defecto
(no dan 500); parámetros repetidos toman el primero; `status` fuera del conjunto válido se ignora.

### Existentes (implementados y verificados)

| Método | Ruta | Auth | Cuerpo / Query | Respuesta |
|--------|------|------|----------------|-----------|
| GET | `/api/health` | no | — | `{ status, version }` |
| POST | `/api/auth/register` | no | `{ name, employeeId, password(≥8), email? }` | `201 { token, user }` |
| POST | `/api/auth/login` | no | `{ employeeId, password }` | `{ token, user }` |
| GET | `/api/auth/me` | sí | — | `User` |
| POST | `/api/auth/logout` | sí | — | `{ ok }` (revoca el token en el servidor) |
| GET | `/api/found-items` | sí | query: `search, category, status, location, page, pageSize` | `Paginated<FoundItem>` |
| GET | `/api/found-items/:id` | sí | — | `FoundItem` |
| POST | `/api/found-items` | sí | `multipart/form-data`: `title, description, category, location, foundAt(ISO)`, `image?` | `201 FoundItem` |
| PATCH | `/api/found-items/:id` | sí (autor o admin) | cuerpo como POST | `FoundItem` (editar) |
| PATCH | `/api/found-items/:id/return` | sí (autor o admin) | — | `FoundItem` |
| PATCH | `/api/found-items/:id/archive` | sí (admin) | — | `FoundItem` |
| DELETE | `/api/found-items/:id` | sí (admin) | — | `{ ok }` (borra también sus claims) |
| GET | `/api/found-items/mine/list` | sí | — | `FoundItem[]` |
| GET | `/api/lost-reports` | sí | query: `search, category, status, location, page, pageSize` | `Paginated<LostReport>` (sin `status` oculta `CLOSED`) |
| GET | `/api/lost-reports/:id` | sí | — | `LostReport` |
| POST | `/api/lost-reports` | sí | `multipart/form-data`: `title, description, category, location, lostAt(ISO)`, `image?` | `201 LostReport` |
| PATCH | `/api/lost-reports/:id/resolve` | sí (autor o admin) | — | `LostReport` |
| GET | `/api/lost-reports/mine/list` | sí | — | `LostReport[]` |
| POST | `/api/claims` | sí | `{ foundItemId, message, lostReportId? }` (`lostReportId` solo Supabase) | `201 Claim` |
| GET | `/api/claims/mine` | sí | — | `Claim[]` (reclamaciones que hice) |
| GET | `/api/claims/incoming` | sí | — | `Claim[]` (sobre objetos que publiqué) |
| PATCH | `/api/claims/:id/review` | sí (autor del hallazgo o admin) | `{ status: APPROVED\|REJECTED, reviewNote? }` | `Claim` |
| PATCH | `/api/claims/:id/cancel` | sí (reclamante) | — | `Claim` |
| GET | `/api/notifications` | sí | — | `Notification[]` (máx 100) |
| PATCH | `/api/notifications/:id/read` | sí | — | `Notification` |
| PATCH | `/api/notifications/read-all` | sí | — | `{ ok: true }` |
| POST | `/api/ai/search` | sí | `{ query, limit? }` | `SemanticSearchResponse` (encontrados rankeados 0–100) |
| GET | `/api/ai/match/:lostReportId` | sí (autor o admin) | — | `MatchSuggestionsResponse` (encontrados candidatos con score y motivos) |
| POST | `/api/ai/assistant` | sí | `{ question, history? }` | `AssistantResponse` (texto + items reales; `kind: 'chat'` sin items) |
| POST | `/ai/match/:lostReportId/notify` (solo Edge Function `api`) | sí (autor) | — | `{ notified, foundItemId?, score? }` (aviso `MATCH_FOUND` ≥55%, idempotente) |
| GET | `/api/admin/stats` | admin | — | `{ users, foundItems, lostReports, claimsPending, returned }` |
| GET | `/api/admin/users` | admin | — | `User[]` |
| PATCH | `/api/admin/users/:id/role` | admin | `{ role: ADMIN\|EMPLOYEE }` | `User` |
| GET | `/api/admin/audit` | admin | `limit?` | `AuditEntry[]` (historial) |
| GET | `/api/claims/all` | admin | — | `Claim[]` (bandeja global) |
| PATCH | `/api/lost-reports/:id` | sí (autor o admin) | cuerpo como POST | `LostReport` (editar) |
| PATCH | `/api/lost-reports/:id/close` | admin | — | `LostReport` (→ `CLOSED`, archivar) |
| DELETE | `/api/lost-reports/:id` | sí (admin) | — | `{ ok }` (borra también la imagen) |
| POST | `/api/admin/users/reset-password` | admin | `{ employeeId, newPassword(≥8) }` | `{ ok }` |
| GET | `/api/admin/archived` | admin | — | `ArchivedResponse` |
| POST | `/api/admin/restore` | admin | `{ kind: found\|lost, id }` | `{ ok }` |

Reglas añadidas en v0.15.x: `PATCH /admin/users/:id/role` no permite dejar el sistema sin
administradores (400). `PATCH /claims/:id/review` con `APPROVED` exige que el objeto siga
`PUBLISHED` y es seguro ante revisiones concurrentes; las reclamaciones rechazadas en
cascada reciben notificación `CLAIM_REJECTED`.

### Pendientes (NO implementados aún)
- `POST /api/auth/forgot-password` / `reset-password` (recuperación de contraseña).
- Notificaciones por email (actualmente solo en base de datos / UI).
- (Hecho en rama `feature/ia`) Búsqueda semántica y emparejado perdido↔encontrado.

---

## E. Modelo de datos

Definido en `backend/prisma/schema.prisma`. Las enumeraciones se guardan como `String`
(SQLite no soporta enums nativos) y su conjunto de valores vive en `@laf/shared`.

**User**: `id, name, employeeId (único, acceso), email? (opcional, único), passwordHash, role(EMPLOYEE|ADMIN), createdAt, updatedAt`.

**FoundItem**: `id, title, description, category, location, foundAt, imageUrl?, imageSignature?, status, reporterId→User, createdAt, updatedAt`.
- `status`: `PUBLISHED → CLAIMED → RETURNED`, o `ARCHIVED`.
- `imageSignature`: firma visual JSON (rama `feature/ia-visual`).

**LostReport**: `id, title, description, category, location, lostAt, imageUrl?, imageSignature?, status, reporterId→User, ...`.
- `status`: `OPEN | MATCHED | RESOLVED | CLOSED`.

**Claim**: `id, foundItemId→FoundItem, claimantId→User, message, status, reviewerId?→User, reviewNote?, ...`.
- `status`: `PENDING | APPROVED | REJECTED | CANCELLED`.

**Notification**: `id, userId→User, type, title, body, read, relatedItemId?, createdAt`.

**AuditLog**: `id, actorId→User, action, entityType, entityId, summary, createdAt`. Registro
de trazabilidad para el panel admin (migración `audit_log`).

**Privilegios de ADMIN** (además de lo de un colaborador): panel con métricas, gestión de
usuarios/roles, **moderar cualquier objeto** (editar/archivar/eliminar, no solo los propios),
**resolver cualquier reclamación y marcar cualquier devolución**, bandeja global de
reclamaciones e **historial de auditoría**. El borrado es destructivo y se registra; se
prefiere archivar.

**Reglas de negocio clave**
- Solo se reclaman objetos `PUBLISHED` (no propios). Uno `CLAIMED` ya tiene una
  reclamación aprobada y otra nunca podría aprobarse.
- Al marcar un objeto `RETURNED` (trigger `found_items_on_returned` en Supabase; igual en
  Express): aviso `ITEM_RETURNED` al reclamante aprobado, su reporte enlazado
  (`claims.lost_report_id`) pasa a `RESOLVED` y las pendientes se rechazan con aviso.
- Supabase: `claims.lost_report_id` (opcional) enlaza la reclamación con el reporte de
  perdido del propio reclamante; al aprobar pasa a `MATCHED`.
- Un usuario no puede tener dos reclamaciones `PENDING` sobre el mismo objeto.
- Al aprobar una reclamación: el objeto pasa a `CLAIMED` y las demás reclamaciones
  pendientes del mismo objeto se rechazan automáticamente (transacción).
- Marcar devuelto: solo el autor del hallazgo o un admin.
- Categorías válidas (`ItemCategory`): ELECTRONICS, CLOTHING, ACCESSORIES, DOCUMENTS,
  KEYS, BAGS, WALLET, JEWELRY, OTHER.

**Migraciones**: `20261019141016_init` (esquema inicial completo).

---

## F. Seguridad

> Referencia completa (controles, verificación, pasos externos, riesgos): `docs/SECURITY.md`.
> Pruebas: `npm test` (incluye `backend/src/security.e2e.test.ts` y `supabase/tests/db.test.mjs`).
> Antes de commitear: `git config core.hooksPath .githooks` (detección de secretos).
>
> Reglas para cambios nuevos: cada endpoint/columna nueva necesita su autorización en
> **ambos** backends (ruta Express + RLS/GRANT por columna en Supabase); las imágenes Express
> se exponen siempre vía `signUploadUrl()`; nada de `select('*')` sobre `profiles` desde el
> cliente (usar `my_profile()`); los filtros de texto pasan por `likeSafe()` (Express) o
> `applyTextFilters()` (Supabase).

- **Autenticación**: JWT firmado con `JWT_SECRET`; expiración `JWT_EXPIRES_IN` (12h).
  Contraseñas hasheadas con bcrypt (coste 12). Login devuelve mensaje genérico para no
  revelar si un email existe.
- **Autorización**: middleware `authenticate` (token válido; el **rol se relee de la BD** en
  cada petición, así degradar a un admin o borrar un usuario surte efecto al instante) y
  `requireAdmin` (rol).
  La autorización se valida **en el servidor**, no en la UI. Permisos por recurso:
  reclamar/devolver/revisar comprueban propiedad o rol.
- **Validación de entradas**: zod en todos los cuerpos de escritura.
- **Prevención de inyección**: Prisma usa consultas parametrizadas.
- **XSS**: React escapa por defecto; no se usa `dangerouslySetInnerHTML`.
- **Subida de archivos**: lista blanca de MIME (jpg/png/webp/gif), límite de tamaño
  (`MAX_UPLOAD_BYTES`, 5 MB), nombres aleatorios. La **extensión se deriva del MIME**, nunca
  del nombre original (evita servir `.html` desde `/uploads`), y el contenido se verifica
  con `sharp` (debe ser realmente una imagen). Si la petición falla, el archivo se borra.
- **Fuerza bruta**: `POST /auth/login` bloquea 15 min tras 10 fallos por IP + número de
  colaborador (`lib/rateLimit.ts`, en memoria: no se comparte entre instancias).
- **Cuentas desactivadas** (`profiles.active=false`): sin acceso en la BD (políticas
  `RESTRICTIVE *_active_only`), `is_admin()` exige `active`, la Edge Function las rechaza en
  `getCaller` y se banean en Auth. Toda tabla nueva necesita su política `*_active_only`.
- **Supabase (RLS)**: el cliente no escribe en `claims` (solo la Edge Function `api` con
  `service_role`); un no-admin solo puede pasar su objeto a `RETURNED`; un no-admin no
  puede cambiar `role`, `employee_id` ni `email`; nunca se puede quitar el último ADMIN.
  Ver `supabase/migrations/20261020000005_harden_rls.sql`. La revisión de reclamaciones
  es la función transaccional `review_claim()` (migración 006), ejecutable solo por
  `service_role`; la Edge Function traduce su `HINT` ('400'/'403'/'404') a código HTTP.
  **Orden de despliegue**: `supabase db push` (migraciones 005 y 006) → `supabase functions
  deploy api`.
- **Cabeceras**: helmet. CORS restringido a `CORS_ORIGIN`.
- **Gestión de secretos**: variables en `.env` (ignorado por git). `.env.example`
  documenta las claves sin valores reales.

**Riesgos conocidos / pendientes**
- Imágenes servidas públicamente desde `/uploads` (no hay control de acceso por archivo).
  En producción: almacenamiento privado + URLs firmadas.
- Rate limiting solo en login y en memoria (si se escala a varias instancias, moverlo a
  Redis o al proxy). Sin rate limiting general de la API.
- Supabase: `enable_signup = true` y la anon key es pública → cualquiera con la URL puede
  registrarse. Para una app interna conviene desactivar el registro abierto y dar de alta
  usuarios desde el panel/Admin API.
- Token en `localStorage` (considerar cookies httpOnly si se endurece el modelo).
- Sin rotación/refresh de tokens.
- `JWT_SECRET` por defecto solo para desarrollo; en producción es obligatorio definirlo.

---

## G. Decisiones técnicas

1. **Monorepo con npm workspaces** (no pnpm/turborepo): mínimo de herramientas, Node trae
   npm. Consecuencia: builds secuenciales simples vía scripts raíz.
2. **`@laf/shared` como única fuente de verdad de tipos/contratos**: evita divergencias
   entre frontend y backend. Debe actualizarse junto con el schema y este documento.
3. **SQLite en desarrollo**: cero configuración para arrancar. Para producción se
   recomienda **PostgreSQL** (cambiar `provider` y `DATABASE_URL`, regenerar migraciones).
   Impacto: los enums se modelan como String para ser portables.
4. **JWT en vez de sesiones en servidor**: API sin estado, fácil de escalar. Impacto:
   invalidación de tokens limitada (ver pendientes de seguridad).
5. **multer 2.x a disco local**: suficiente para el MVP interno. Marcado para migrar a
   almacenamiento en la nube antes de producción.
6. **Proxy de Vite** (`/api`, `/uploads` → :4000) en desarrollo: evita CORS y simplifica
   el cliente HTTP (rutas relativas).

> Si una decisión debe cambiar, documentar motivo e impacto aquí antes de aplicarla.

---

## H. Estado actual

- **Versión**: 0.26.1 (ver `VERSION`). 0.26.1: migración 011 (auditoría y avisos al
  eliminar/archivar, aplicada) y estado "No disponible" para elementos eliminados. 0.26.0: 0.26.0: introducción para nuevos usuarios, barra de
  acción móvil (`MobileActionBar`), hápticos (`lib/haptics.ts`), muro sin conexión
  (`lib/cache.ts`), "Para ti" en el muro. 0.25.0: 0.25.0: auditoría de seguridad (migración 010:
  cuentas inactivas sin acceso, guard de estados en `lost_reports`, moderado solo visible a
  autor/admin, nombre no editable), editar publicaciones, fotos optimizadas sin EXIF,
  accesibilidad. Migraciones 008–010 aplicadas en Supabase y Edge Functions desplegadas (2026-10-22). 0.24.0: 0.24.0: flujo reclamación → entrega completo
  (migración 009: trigger de devolución, `claims.lost_report_id`), aviso de coincidencia en
  Supabase, navegación desde coincidencias/Olivia. 0.23.1: icono y splash de Android con la marca OLO
  (opción "verde OLO"). 0.23.0: Olivia conversa (personalidad, guía de la
  app, límites de tema, memoria corta); APK debug. 0.22.0: revisión del LLM (Olivia) + rediseño mobile
  first (barra inferior en móvil, tokens de sombra/animación en `tailwind.config.js`,
  componentes `PageHeader`/`Modal`/esqueletos en `components/ui.tsx`). 0.16.0: revisión de seguridad/robustez; 0.17.0:
  auditoría de seguridad completa (20 medidas, `docs/SECURITY.md`). Ambas de Claude. Rama `feature/supabase-android`: Supabase Fases 1 y 2
  completas (CRUD/auth/storage + IA/admin en Edge Functions) y Android (Capacitor) preparado.
  La rama `main` iba por 0.10.1.
- **Último commit relevante**: ver `git log` / `CHANGELOG.md` (primer release 0.1.0).
- **Terminado**: monorepo, shared, backend completo (auth, found-items, lost-reports,
  claims con notificaciones, notifications, admin), frontend completo (10 pantallas),
  integración y pruebas manuales E2E, seed con datos demo.
- **En desarrollo**: —
- **Problemas conocidos**: ver riesgos en §F; aún sin pruebas automatizadas.
- **Pruebas ejecutadas** (manuales, vía proxy): health, login (empleado/admin), listado
  del muro, crear reclamación, aprobar reclamación (objeto → CLAIMED, resto rechazadas),
  notificación al reclamante, stats de admin, verificación de 401 sin token. Builds de
  `shared`, `backend` y `frontend` sin errores.
- **Próximos pasos recomendados**: pruebas automatizadas (Vitest + Supertest / RTL),
  emparejado perdido↔encontrado, recuperación de contraseña, migración a PostgreSQL y
  almacenamiento de imágenes en la nube para producción.

---

## I. Instrucciones de desarrollo

**Requisitos**: Node ≥ 20 (probado con v24), npm. Git.

**Instalar dependencias** (desde la raíz):
```bash
npm install
```

**Configurar entorno (backend)**:
```bash
# copiar el ejemplo y ajustar valores
cp backend/.env.example backend/.env   # en Windows: Copy-Item backend/.env.example backend/.env
```

**Preparar la base de datos** (desde `backend/`):
```bash
npm run prisma:generate      # genera el cliente Prisma
npm run prisma:migrate       # aplica migraciones (crea dev.db)
npm run db:seed              # datos demo
```

**Ejecutar en desarrollo** (dos terminales, desde la raíz):
```bash
npm run dev:backend          # API en http://localhost:4000
npm run dev:frontend         # SPA en http://localhost:5173 (proxy a :4000)
```

**Compilar / comprobaciones de calidad**:
```bash
npm run build                # shared + backend + frontend
npm run build:frontend       # incluye tsc --noEmit (typecheck estricto)
npm run build:backend        # tsc
```

**Cuentas demo** (tras el seed): número de colaborador `1001` (ADMIN) y `2002` (EMPLOYEE),
contraseña `password123`.

**Resetear la base de datos de desarrollo** (desde `backend/`):
```bash
npx prisma migrate reset --force && npx tsx prisma/seed.ts
```

**Convención de commits** (Conventional Commits + versión):
```
feat(frontend): add found-items feed [v0.2.0]
fix(backend): correct claim transition [v0.2.1]
docs: update shared project context [v0.1.0]
```
Antes de cada commit: revisar cambios, verificar que no hay secretos, compilar/probar,
actualizar documentación afectada (`CHANGELOG.md`, `docs/DEVELOPMENT_STATUS.md`,
`VERSION` si cambia) y revisar `git status`. No hacer push ni operaciones destructivas sin
autorización.

**Versiones de producción (APK):** toda versión para la que se **genere un APK** se considera
de **producción**. Al generar el APK: subir la versión (`VERSION` + `CHANGELOG.md`), dejar
constancia de que es un build de producción (p. ej. etiqueta/sección "Producción" en el
changelog) y, antes de distribuirlo, cumplir los requisitos de producción (anon key rotada,
configuración de Auth revisada, firma de release del APK). Las versiones sin APK son de
desarrollo.
