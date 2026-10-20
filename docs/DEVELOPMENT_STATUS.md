# Estado de desarrollo — Lost and Found

> Instantánea del estado del proyecto. Actualizar tras hitos importantes.

- **Versión actual**: 0.12.0 (rama `feature/supabase-android`; `main` va por 0.10.1)
- **Fecha**: 2026-10-20
- **Commit más reciente**: conexión real a Supabase, Fase 1 (ver `git log`)
- **Última funcionalidad completada**: **Fase 1 de Supabase conectada**. La UI consume la
  capa `services`; con `VITE_DATA_BACKEND=supabase` funcionan auth (login por número de
  colaborador con email sintético `@lostandfound.olo`), muro, publicar con foto (Storage),
  reclamaciones, notificaciones y restablecimiento de contraseña por admin (Edge Function
  `admin-reset-password`). El modo `rest` sigue intacto.
- **Pendiente (Fase 2)**: portar IA (búsqueda, coincidencias, asistente) y panel admin
  (métricas, usuarios, auditoría, bandeja global) a Edge Functions; hoy dependen del backend
  Express y no cargan en modo Supabase.

## Estado de las pruebas

- **Automatizadas**: aún no hay suite. Pendiente (Vitest + Supertest para backend,
  React Testing Library para frontend).
- **Manuales (ejecutadas)**: verificación E2E a través del proxy de Vite:
  - `GET /api/health` → ok.
  - Login de empleado y de administradora.
  - Listado del muro con datos del seed.
  - Crear reclamación (estado `PENDING`).
  - Aprobar reclamación → objeto a `CLAIMED` y notificación al reclamante.
  - Estadísticas del panel admin.
  - Acceso sin token rechazado con `401`.
  - Builds de `shared`, `backend` y `frontend` sin errores.

## Responsable habitual por área

| Área | Responsable |
|------|-------------|
| Frontend | Kiro |
| Backend | Claude |
| Estado actual | Kiro trabaja en ambas partes (autorización temporal vigente) |

## Tareas pendientes

### Prioridad alta
- [ ] Pruebas automatizadas (backend y frontend) con cobertura de los flujos críticos.
- [ ] Recuperación de contraseña (`forgot/reset-password`).

### Prioridad media
- [ ] Emparejado automático entre objetos perdidos y encontrados.
- [ ] Notificaciones por email además de las de la interfaz.
- [ ] Rate limiting en autenticación.

### Antes de producción
- [ ] Migrar base de datos a PostgreSQL.
- [ ] Mover almacenamiento de imágenes a un servicio privado (URLs firmadas).
- [ ] Definir infraestructura y pipeline de despliegue.
- [ ] Revisión de seguridad (tokens, cabeceras, auditoría de dependencias).

## Pendiente de configuración del usuario (Supabase / Android)

- [x] **Supabase**: proyecto creado, migraciones aplicadas, `.env` configurado con
  `VITE_DATA_BACKEND=supabase`. Modelo de auth: email sintético `@lostandfound.olo`.
- [ ] **Supabase (pendiente del usuario)**: crear usuarios (ADMIN + EMPLEADO), confirmar el
  bucket `item-photos` en el panel, desplegar la Edge Function `admin-reset-password`, y
  antes de producción rotar la anon key. Ver `docs/SUPABASE_SETUP.md`.
- [x] Migradas a la capa `services` las páginas de CRUD/auth/notificaciones.
- [ ] **Fase 2**: portar IA y panel admin a Edge Functions.
- [ ] **Android**: instalar Android Studio + SDK + JDK 17, compilar y probar en
  emulador/teléfono. Ver `docs/ANDROID_SETUP.md`.

## Bloqueos actuales

- Ninguno técnico en el repo. Para avanzar en Supabase hacen falta credenciales del usuario;
  para compilar Android hace falta Android Studio/JDK (no presentes en este entorno, por lo
  que la app **no ha sido compilada ni probada en un dispositivo** desde aquí).

## Notas de entorno

- `git` está instalado en `C:\Users\<usuario>\AppData\Local\Programs\Git` y puede no estar
  en el `PATH` de la terminal; añadirlo a la sesión si `git` no se reconoce.
- Identidad de commits configurada **a nivel de repositorio** como
  `dpaniaguaOLO <dpaniagua@ologistics.com>` (la configuración global del equipo no se modificó).
- El `push` a un remoto todavía no está autorizado para esta tarea.
