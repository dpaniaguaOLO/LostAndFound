# Arquitectura — Lost and Found (OLO)

Documento de referencia de la arquitectura tras la preparación para **Supabase** y
**Android**. Describe el estado actual del sistema, las piezas nuevas y las decisiones
de diseño. Para pasos operativos ver `SUPABASE_SETUP.md` y `ANDROID_SETUP.md`.

---

## Visión general

Lost and Found es una app interna de objetos perdidos/encontrados para colaboradores de
OLO. Monorepo con npm workspaces:

```
LostAndFound/
├── packages/shared      # Tipos TypeScript compartidos (User, FoundItem, Claim, ...)
├── backend              # API REST: Express + Prisma + SQLite + IA local
├── frontend             # SPA: React + Vite + TypeScript + Tailwind
│   ├── src/services     # Capa de datos (interfaz + impl. REST / Supabase)
│   ├── src/lib          # config, cliente Supabase, puente nativo Capacitor
│   ├── capacitor.config.ts
│   └── android          # Proyecto nativo Android (Capacitor)
├── supabase/migrations  # Esquema Postgres + RLS + Storage (preparado)
└── docs                 # Documentación
```

---

## Estado: dos caminos preparados, nada roto

La preparación es **progresiva y reversible**. Ni Supabase ni Android alteran el
comportamiento actual por defecto:

- **Datos:** el flag `VITE_DATA_BACKEND` (`rest` | `supabase`) selecciona el backend.
  Por defecto `rest` → se usa el backend Express de siempre.
- **Android:** el puente nativo (`src/lib/native.ts`) solo actúa dentro del contenedor
  Capacitor; en el navegador es un *no-op*.

---

## Capa de datos (frontend)

La UI depende de **interfaces**, no de implementaciones. Esto permite migrar a Supabase
por partes sin tocar componentes.

```
components/pages
      │  importan
      ▼
services/index.ts  ──selecciona según VITE_DATA_BACKEND──┐
      │                                                   │
      ▼                                                   ▼
services/rest.ts (Express)                     services/supabase.ts (Supabase)
      │                                                   │
      ▼                                                   ▼
 lib/api.ts (fetch /api)                        lib/supabase.ts (cliente JS)
```

- `services/types.ts` define los contratos: `AuthService`, `FoundItemsService`,
  `LostReportsService`, `ClaimsService`, `NotificationsService`, agrupados en `DataServices`.
- `services/index.ts` exporta `services`, resuelto en tiempo de arranque según `useSupabase`.

> **Nota de estado:** la capa existe y compila, pero las páginas actuales todavía llaman a
> `api()` directamente en varios sitios. La migración página a página a `services` es el
> siguiente paso natural; el *scaffold* está listo para hacerlo incrementalmente.

---

## Backend de datos: Supabase (preparado, no conectado)

- **PostgreSQL** con esquema equivalente al modelo Prisma/SQLite actual, adaptado a
  Postgres (`uuid`, `timestamptz`, `jsonb`, CHECK constraints en vez de enums).
- **Auth**: identidad gestionada por Supabase; `profiles.id = auth.users.id`. El login
  sigue siendo por **número de colaborador** (`employee_id`): el cliente resuelve el email
  a partir del número y llama a `signInWithPassword`.
- **Storage**: bucket privado `item-photos`, rutas `"<uid>/<uuid>.<ext>"`, acceso por
  **URL firmada**. `image_path` guarda la ruta, no una URL pública.
- **RLS** en todas las tablas (ver `SUPABASE_SETUP.md` §5). La clave `service_role` jamás
  va al cliente.

### Tablas

`profiles`, `found_items`, `lost_reports`, `claims`, `notifications`, `audit_logs`.

### Protecciones a nivel de base de datos

| Mecanismo | Qué garantiza |
|---|---|
| `is_admin()` (SECURITY DEFINER) | Resuelve el rol del usuario para las policies |
| Trigger `prevent_role_escalation` | Un no-admin no puede promoverse a ADMIN |
| Trigger `claims_no_self_review` | El reclamante no revisa su propia solicitud |
| Índice único parcial `claims_unique_pending` | No dos reclamaciones `PENDING` del mismo objeto por usuario |
| Trigger `handle_new_user` | Crea `profiles` automáticamente al registrarse en Auth |

---

## La IA y el admin: backend Express o Edge Functions

El motor de emparejado (NLP semántico + firma visual) y el asistente son **cómputo, no SQL**.

- En modo **`rest`** viven en el backend Express (`backend/src/lib/`).
- En modo **`supabase`** (Fase 2) se sirven desde la **Edge Function `api`**
  (`supabase/functions/api/`), que reutiliza el motor portado a Deno en
  `supabase/functions/_shared/` (NLP, matching, firma visual). Los pesos y fórmulas son
  idénticos a los del backend. Las rutas de administración y el restablecimiento de
  contraseña usan la `service_role` **solo en el servidor** (Edge Functions), nunca en el
  cliente.

Detalle importante de la firma visual: la **comparación** de dos firmas es aritmética pura
sobre el JSON guardado y corre en la Edge Function sin problema; la **generación** de la
firma (que usa `sharp`) ocurre al subir la imagen, fuera de la Edge Function.

---

## Android: Capacitor

El frontend web se envuelve en un contenedor nativo con Capacitor (justificación en
`ANDROID_SETUP.md` §1). Reutiliza la SPA al completo.

- `capacitor.config.ts`: `appId=com.olo.lostandfound`, `webDir=dist`, StatusBar/Keyboard,
  `server.url` opcional para live-reload.
- `src/lib/native.ts`: inicializa StatusBar (verde OLO), Keyboard y el botón físico atrás.
- Experiencia móvil: `viewport-fit=cover` + utilidades CSS `safe-top` / `safe-bottom` /
  `safe-x` basadas en `env(safe-area-inset-*)` para respetar notch y gestos.

Flujo de build: `npm run build` (web) → `npx cap sync android` (copia a `android/`) →
compilar con Android Studio / Gradle.

---

## Decisiones clave (resumen)

1. **Capacitor** sobre React Native/Expo: reutiliza el frontend web sin reescribir.
2. **Supabase preparado pero no conectado**: sin credenciales no se simula conexión; se
   dejan migraciones, RLS, cliente y docs listos para enchufar.
3. **IA y admin** como Edge Function `api` en modo Supabase (motor portado a Deno), o backend
   Express en modo `rest`. No se consulta IA directamente desde el cliente.
4. **Feature flag `VITE_DATA_BACKEND`** (default `rest`) para no romper nada.
5. **Login por `employee_id`** conservado también en el flujo de Supabase.
