# Estado de desarrollo — Lost and Found

> Instantánea del estado del proyecto. Actualizar tras hitos importantes.

- **Versión actual**: 0.23.0 (rama `feature/llm`, también en `main`). 0.23.0 = Olivia
  conversa (personalidad, guía de la app, límites de tema, memoria corta) + APK debug. El trabajo de Supabase + Android +
  seguridad (0.11.0–0.19.0) ya está **mergeado en `main`** (PR #3). 0.20.0–0.21.x = asistente
  con LLM Fase 1 / Olivia (solo lectura, ver `docs/LLM.md`). 0.22.0 = revisión del LLM
  (zona horaria, relevancia, prompt endurecido, tope de coste) y rediseño mobile first
  (navegación inferior, sistema de sombras/animaciones, esqueletos de carga).
- **Fecha**: 2026-10-21
- **Commit más reciente**: revisión de seguridad y robustez de backend + Supabase (ver `git log`
  y `CHANGELOG.md` 0.16.0): RLS endurecida, revisión de reclamaciones atómica (`review_claim`),
  correcciones en Express, URLs firmadas en lote, code splitting.
- **Última funcionalidad completada**: **Fase 2 de Supabase**. La IA (búsqueda, coincidencias,
  asistente) y el panel admin (métricas, usuarios, rol, auditoría, bandeja global) se portaron
  a la Edge Function `api` (motor NLP/matching/firma visual en `supabase/functions/_shared/`).
  Con `VITE_DATA_BACKEND=supabase` la app funciona completa sin el backend Express. Fase 1
  (auth/CRUD/storage/reset-password) sigue operativa.
- **Pendiente del usuario**: desplegar las Edge Functions (`supabase functions deploy api` y
  `admin-reset-password`); crear usuarios; probar end-to-end. Edge Functions no compiladas ni
  desplegadas desde el entorno de desarrollo (sin Deno/Supabase CLI).

## Estado de las pruebas

- **Automatizadas**: `npm test` → backend (node:test: 15 unitarios + 13 de seguridad e2e contra
  la app real con SQLite temporal) y BD (`npm run test:db`: 14 sobre Postgres/PGlite con todas las
  migraciones de Supabase). Pendiente: pruebas de interfaz (React Testing Library).
- **v0.16.0 (Claude)**: smoke E2E de 28 escenarios contra Express con BD temporal; políticas
  RLS y `review_claim()` probadas sobre Postgres (PGlite, 15 + 18 casos); `deno check` de las
  Edge Functions.
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
- [x] **Fase 2**: IA y panel admin portados a la Edge Function `api`.
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
