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

Hay dos formas de dar de alta usuarios, a decidir según política de OLO:

1. **Email corporativo real** (p. ej. `dpaniagua@ologistics.com`): el más simple y permite
   recuperación de contraseña por correo.
2. **Email sintético** derivado del número (p. ej. `1001@lostandfound.olo`): evita exponer
   correos, pero inhabilita la recuperación por email.

El trigger `handle_new_user()` crea automáticamente la fila en `profiles` cuando se registra
un usuario en Auth, tomando `name` y `employee_id` de los metadatos del registro.

> **Pendiente de decisión del usuario.** Esta guía no asume cuál se usará; documenta ambas.

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

El emparejado por IA (NLP + firma visual) y el asistente **siguen en el backend Express**
(es cómputo, no SQL). Cuando se migre a Supabase, las operaciones que requieran privilegios
(crear notificaciones, escribir audit logs, aprobar reclamaciones con validación de flujo)
deben ir en **Edge Functions** que usen `service_role`, nunca en el cliente.

---

## 7. Activar Supabase en el frontend

En `frontend/.env` (copia de `.env.example`):

```env
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon-publica
```

Reconstruye (`npm run build:frontend`). Con el flag en `rest` (por defecto) la app sigue
usando el backend Express sin cambios.

---

## Checklist de pasos manuales pendientes

- [ ] Crear el proyecto en Supabase y copiar URL + anon key.
- [ ] Aplicar las 4 migraciones (`supabase db push` o SQL Editor).
- [ ] Decidir el modelo de auth (email corporativo vs sintético) y dar de alta usuarios.
- [ ] Verificar que el bucket `item-photos` existe y es privado.
- [ ] Rellenar `frontend/.env` y cambiar `VITE_DATA_BACKEND=supabase`.
- [ ] Portar las operaciones sensibles a Edge Functions antes de producción.
