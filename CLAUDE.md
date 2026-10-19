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

**Servicios externos**: ninguno por ahora.

**Infraestructura / despliegue**: aún no definido.

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
Códigos HTTP usados: 400 (BAD_REQUEST), 401 (UNAUTHORIZED), 403 (FORBIDDEN),
404 (NOT_FOUND), 409 (CONFLICT), 500 (INTERNAL).

### Existentes (implementados y verificados)

| Método | Ruta | Auth | Cuerpo / Query | Respuesta |
|--------|------|------|----------------|-----------|
| GET | `/api/health` | no | — | `{ status, version }` |
| POST | `/api/auth/register` | no | `{ name, employeeId, password(≥8), email? }` | `201 { token, user }` |
| POST | `/api/auth/login` | no | `{ employeeId, password }` | `{ token, user }` |
| GET | `/api/auth/me` | sí | — | `User` |
| GET | `/api/found-items` | sí | query: `search, category, status, location, page, pageSize` | `Paginated<FoundItem>` |
| GET | `/api/found-items/:id` | sí | — | `FoundItem` |
| POST | `/api/found-items` | sí | `multipart/form-data`: `title, description, category, location, foundAt(ISO)`, `image?` | `201 FoundItem` |
| PATCH | `/api/found-items/:id` | sí (autor o admin) | cuerpo como POST | `FoundItem` (editar) |
| PATCH | `/api/found-items/:id/return` | sí (autor o admin) | — | `FoundItem` |
| PATCH | `/api/found-items/:id/archive` | sí (admin) | — | `FoundItem` |
| DELETE | `/api/found-items/:id` | sí (admin) | — | `{ ok }` (borra también sus claims) |
| GET | `/api/found-items/mine/list` | sí | — | `FoundItem[]` |
| GET | `/api/lost-reports` | sí | query: `search, category, status, location, page, pageSize` | `Paginated<LostReport>` |
| GET | `/api/lost-reports/:id` | sí | — | `LostReport` |
| POST | `/api/lost-reports` | sí | `multipart/form-data`: `title, description, category, location, lostAt(ISO)`, `image?` | `201 LostReport` |
| PATCH | `/api/lost-reports/:id/resolve` | sí (autor o admin) | — | `LostReport` |
| GET | `/api/lost-reports/mine/list` | sí | — | `LostReport[]` |
| POST | `/api/claims` | sí | `{ foundItemId, message }` | `201 Claim` |
| GET | `/api/claims/mine` | sí | — | `Claim[]` (reclamaciones que hice) |
| GET | `/api/claims/incoming` | sí | — | `Claim[]` (sobre objetos que publiqué) |
| PATCH | `/api/claims/:id/review` | sí (autor del hallazgo o admin) | `{ status: APPROVED\|REJECTED, reviewNote? }` | `Claim` |
| PATCH | `/api/claims/:id/cancel` | sí (reclamante) | — | `Claim` |
| GET | `/api/notifications` | sí | — | `Notification[]` (máx 100) |
| PATCH | `/api/notifications/:id/read` | sí | — | `Notification` |
| PATCH | `/api/notifications/read-all` | sí | — | `{ ok: true }` |
| POST | `/api/ai/search` | sí | `{ query, limit? }` | `SemanticSearchResponse` (encontrados rankeados 0–100) |
| GET | `/api/ai/match/:lostReportId` | sí (autor o admin) | — | `MatchSuggestionsResponse` (encontrados candidatos con score y motivos) |
| POST | `/api/ai/assistant` | sí | `{ question }` | `AssistantResponse` (texto + items reales) |
| GET | `/api/admin/stats` | admin | — | `{ users, foundItems, lostReports, claimsPending, returned }` |
| GET | `/api/admin/users` | admin | — | `User[]` |
| PATCH | `/api/admin/users/:id/role` | admin | `{ role: ADMIN\|EMPLOYEE }` | `User` |
| GET | `/api/admin/audit` | admin | `limit?` | `AuditEntry[]` (historial) |
| GET | `/api/claims/all` | admin | — | `Claim[]` (bandeja global) |
| PATCH | `/api/lost-reports/:id` | sí (autor o admin) | cuerpo como POST | `LostReport` (editar) |
| DELETE | `/api/lost-reports/:id` | sí (admin) | — | `{ ok }` |

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
- No se puede reclamar un objeto propio, ni uno `RETURNED`/`ARCHIVED`.
- Un usuario no puede tener dos reclamaciones `PENDING` sobre el mismo objeto.
- Al aprobar una reclamación: el objeto pasa a `CLAIMED` y las demás reclamaciones
  pendientes del mismo objeto se rechazan automáticamente (transacción).
- Marcar devuelto: solo el autor del hallazgo o un admin.
- Categorías válidas (`ItemCategory`): ELECTRONICS, CLOTHING, ACCESSORIES, DOCUMENTS,
  KEYS, BAGS, WALLET, JEWELRY, OTHER.

**Migraciones**: `20261019141016_init` (esquema inicial completo).

---

## F. Seguridad

- **Autenticación**: JWT firmado con `JWT_SECRET`; expiración `JWT_EXPIRES_IN` (12h).
  Contraseñas hasheadas con bcrypt (coste 12). Login devuelve mensaje genérico para no
  revelar si un email existe.
- **Autorización**: middleware `authenticate` (token válido) y `requireAdmin` (rol).
  La autorización se valida **en el servidor**, no en la UI. Permisos por recurso:
  reclamar/devolver/revisar comprueban propiedad o rol.
- **Validación de entradas**: zod en todos los cuerpos de escritura.
- **Prevención de inyección**: Prisma usa consultas parametrizadas.
- **XSS**: React escapa por defecto; no se usa `dangerouslySetInnerHTML`.
- **Subida de archivos**: lista blanca de MIME (jpg/png/webp/gif), límite de tamaño
  (`MAX_UPLOAD_BYTES`, 5 MB), nombres aleatorios.
- **Cabeceras**: helmet. CORS restringido a `CORS_ORIGIN`.
- **Gestión de secretos**: variables en `.env` (ignorado por git). `.env.example`
  documenta las claves sin valores reales.

**Riesgos conocidos / pendientes**
- Imágenes servidas públicamente desde `/uploads` (no hay control de acceso por archivo).
  En producción: almacenamiento privado + URLs firmadas.
- Sin rate limiting ni bloqueo por intentos fallidos de login.
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

- **Versión**: 0.1.0 (ver `VERSION`).
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
