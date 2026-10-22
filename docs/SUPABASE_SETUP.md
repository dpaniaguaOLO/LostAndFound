# Supabase — Guía de configuración

Esta guía explica cómo conectar **Lost and Found** a [Supabase](https://supabase.com)
(PostgreSQL + Auth + Storage). El proyecto ya trae las migraciones, políticas RLS,
el bucket de Storage y la capa de datos del frontend **preparados pero no conectados**:
no hay credenciales reales en el repositorio. Sigue estos pasos con tu propio proyecto.

> **Estado actual:** el frontend usa por defecto el backend REST actual
> (`VITE_DATA_BACKEND=rest`). Supabase se activa cambiando ese flag y rellenando
> las variables de entorno. Nada se rompe mientras no lo actives.

---

## 1. Crear el proyecto en Supabase

1. Entra en [app.supabase.com](https://app.supabase.com) y crea un proyecto nuevo.
2. Elige región cercana a los usuarios y guarda la **contraseña de la base de datos**.
3. En **Project Settings → API** anota:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY` (clave pública, segura en el cliente **si** RLS está activo)
   - `service_role` key → **secreta, solo servidor/Edge Functions. Nunca en el cliente.**

---

## 2. Aplicar las migraciones

Las migraciones SQL versionadas están en `supabase/migrations/`:

| Archivo | Contenido |
|---|---|
| `20261020000001_init_schema.sql` | Tablas: `profiles`, `found_items`, `lost_reports`, `claims`, `notifications`, `audit_logs` + trigger `set_updated_at()` |
| `20261020000002_helpers.sql` | Funciones `is_admin()`, `current_profile_role()`, `handle_new_user()` + trigger `on_auth_user_created` |
| `20261020000003_rls.sql` | Row Level Security en todas las tablas + triggers de integridad |
| `20261020000004_storage.sql` | Bucket privado `item-photos` + políticas de acceso |

### Opción A — Supabase CLI (recomendada)

```bash
# Instala la CLI: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref <TU-PROJECT-REF>
supabase db push          # aplica todas las migraciones en orden
```

### Opción B — SQL Editor del panel

Abre **SQL Editor** y pega el contenido de cada archivo **en orden** (del 0001 al 0004),
ejecutándolos uno por uno.

---

## 3. Modelo de autenticación (login por número de colaborador)

La app no usa email para iniciar sesión, sino el **número de colaborador** (`employee_id`).
Supabase Auth trabaja con email/contraseña, así que se resuelve así:

- Cada colaborador tiene un registro en `auth.users` (gestionado por Supabase Auth) y un
  `profiles` enlazado (`profiles.id = auth.users.id`).
- `profiles.employee_id` guarda el número de colaborador (único).
- En el login, el frontend **resuelve el email a partir del `employee_id`** y luego llama
  a `signInWithPassword`. La implementación está en `frontend/src/services/supabase.ts`.

**Modelo elegido para este proyecto: email sintético (opción 2).** El email se deriva del
número de colaborador con el dominio **`@lostandfound.olo`**, p. ej. el colaborador `1001`
usa internamente `1001@lostandfound.olo`. El dominio es configurable con la variable
`VITE_SUPABASE_EMAIL_DOMAIN` (por defecto `lostandfound.olo`). Como no hay correo real, la
recuperación de contraseña la hace un **administrador** (ver §8).

El trigger `handle_new_user()` crea automáticamente la fila en `profiles` cuando se registra
un usuario en Auth, tomando `name` y `employee_id` de los metadatos del registro.

### 3.1 Crear usuarios (Paso 4 del alta)

Al crear cada usuario, el email **debe** seguir el patrón `<numero>@lostandfound.olo` y hay
que pasar `name` y `employee_id` en los metadatos para que el perfil se cree bien.

**Opción recomendada — desde el SQL Editor** (crea usuario + confirma email + metadatos):

```sql
-- Crea un colaborador. Repite cambiando número, nombre y contraseña.
-- ⚠ Nunca reutilices la contraseña demo del backend local: es pública.
select auth.admin_create_user(
  '{
     "email": "1001@lostandfound.olo",
     "password": "<CONTRASEÑA_ROBUSTA_ÚNICA>",
     "email_confirm": true,
     "user_metadata": { "name": "Admin OLO", "employee_id": "1001" }
   }'::jsonb
);
```

> Si `auth.admin_create_user` no está disponible en tu plan, usa **Authentication → Users →
> Add user** en el panel: pon el email `1001@lostandfound.olo`, marca *Auto Confirm User*, y
> tras crearlo añade en *User Metadata* las claves `name` y `employee_id`. Si el perfil no se
> crea con el employee_id correcto, ajústalo con un UPDATE sobre `public.profiles`.

**Promover a administrador** (el trigger crea todos como `EMPLOYEE`):

```sql
update public.profiles set role = 'ADMIN' where employee_id = '1001';
```

Crea al menos uno de prueba de cada tipo, por ejemplo: `1001` (ADMIN) y `2002` (EMPLOYEE).

---

## 4. Storage de fotos

- Bucket **privado** `item-photos` (creado por `20261020000004_storage.sql`).
- Las fotos se guardan con rutas `"<uid>/<uuid>.<ext>"`, de modo que cada usuario solo
  escribe en su propia carpeta.
- Las imágenes **no son públicas**: se sirven mediante **URLs firmadas** de corta duración
  generadas en el cliente autenticado.
- La columna `image_path` de `found_items`/`lost_reports` guarda la ruta de Storage,
  no una URL.

---

## 5. Seguridad (RLS)

Todas las tablas tienen Row Level Security activado. Puntos clave:

- `is_admin()` (SECURITY DEFINER) determina si el usuario actual es ADMIN.
- Trigger `prevent_role_escalation`: un no-admin **no puede** promoverse a ADMIN.
- Trigger `claims_no_self_review`: el reclamante no puede revisar su propia solicitud.
- Índice único parcial `claims_unique_pending`: no se permiten dos reclamaciones `PENDING`
  del mismo objeto por el mismo colaborador.
- `notifications` y `audit_logs` se **escriben desde el servidor** (Edge Function con
  `service_role`), no directamente desde el cliente.

**Regla de oro:** la clave `service_role` jamás se incluye en el frontend ni en el
bundle de la app Android.

---

## 6. Operaciones sensibles → Edge Functions

Las operaciones que requieren privilegios (crear notificaciones, escribir audit logs,
aprobar reclamaciones con validación de flujo) y la IA (NLP y asistente) van en la **Edge
Function `api`** con `service_role`, nunca en el cliente (ver la sección 7). La firma
visual de imágenes solo existe en el backend Express: en modo Supabase el emparejado no
usa la imagen.

Hay **dos Edge Functions** en `supabase/functions/`. Ambas se despliegan con la Supabase
CLI (tras `supabase login` y `supabase link`):

```bash
supabase functions deploy api
supabase functions deploy admin-reset-password
```

> **Importante:** cada vez que cambie el código de una Edge Function (p. ej. al añadir
> endpoints), hay que **volver a desplegarla** con el mismo comando para que el cambio surta
> efecto en el proyecto.

Ambas usan `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, que Supabase
**inyecta automáticamente** en las Edge Functions del proyecto; no hay que configurarlas a
mano. La `service_role` nunca sale del servidor.

#### `api` — IA y administración (Fase 2)

Reimplementa en Supabase la lógica que antes vivía en el backend Express. Un único endpoint
con router interno:

- `POST /ai/search` — búsqueda semántica (NLP: TF-IDF + coseno).
- `GET /ai/match/:lostReportId` — coincidencias perdido↔encontrado (texto + categoría +
  ubicación + fecha + firma visual). Solo el autor del reporte o un admin.
- `POST /ai/assistant` — asistente por intención (sin LLM).
- `GET /admin/stats`, `GET /admin/users`, `PATCH /admin/users/:id/role`, `GET /admin/audit`,
  `GET /claims/all` — todas exigen rol ADMIN.

El motor NLP/matching/firma visual se portó **verbatim** desde el backend
(`supabase/functions/_shared/`); los pesos y fórmulas son idénticos. La comparación de firmas
visuales es aritmética pura sobre el JSON guardado (no necesita `sharp`). La **generación** de
la firma al subir una foto sigue haciéndose fuera de la Edge Function.

#### `admin-reset-password` — restablecer contraseña

1. Verifica el token del llamador y que su `profiles.role = 'ADMIN'`.
2. Usa la `service_role` para cambiar la contraseña del usuario destino (Auth Admin API).
3. Registra la acción en `audit_logs`.

---

## 7. Activar Supabase en el frontend

En `frontend/.env` (copia de `.env.example`):

```env
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon-publica
# Opcional: dominio del email sintético (por defecto lostandfound.olo)
VITE_SUPABASE_EMAIL_DOMAIN=lostandfound.olo
```

Reconstruye (`npm run build:frontend`). Con el flag en `rest` (por defecto) la app sigue
usando el backend Express sin cambios.

### Estado de la integración (Fases 1 y 2 completas)

Con Supabase como backend de datos, la UI consume la capa `frontend/src/services` y **toda
la funcionalidad** está cubierta, sin depender del backend Express:

- **Fase 1** — Autenticación (login/registro/logout) por número de colaborador; muro
  (encontrados y perdidos); publicar con foto (Storage); detalle; reclamaciones; notificaciones;
  restablecimiento de contraseña por admin.
- **Fase 2** — IA (búsqueda semántica, coincidencias perdido↔encontrado, asistente) y panel
  de administración (métricas, usuarios, cambio de rol, auditoría, bandeja global de
  reclamaciones), servidos por la Edge Function `api`.

Para que la IA y el admin funcionen hay que **desplegar la Edge Function `api`** (ver arriba).
El backend Express queda como alternativa (modo `rest`); ya no es necesario con Supabase.

---

## Checklist de pasos manuales pendientes

- [x] Crear el proyecto en Supabase y copiar URL + anon key.
- [x] Aplicar las 4 migraciones (`supabase db push` o SQL Editor).
- [x] Modelo de auth decidido: email sintético con dominio `@lostandfound.olo` (opción 2).
- [x] Rellenar `frontend/.env` y cambiar `VITE_DATA_BACKEND=supabase`.
- [ ] **Crear los usuarios** (al menos un ADMIN y un EMPLEADO) con email `<numero>@lostandfound.olo` (§3.1).
- [ ] Verificar en el panel que el bucket `item-photos` existe y es privado (Storage).
- [ ] Desplegar las Edge Functions: `supabase functions deploy api` y `supabase functions deploy admin-reset-password`.
- [ ] Probar end-to-end: login, muro, publicar con foto, búsqueda inteligente, coincidencias, asistente y panel admin.
- [x] Fase 2: IA y panel admin portados a la Edge Function `api`.
- [ ] Antes de producción: rotar la anon key (se compartió en chat) y revisar políticas.
