# Estado de desarrollo — Lost and Found

> Instantánea del estado del proyecto. Actualizar tras hitos importantes.

- **Versión actual**: 0.4.1
- **Fecha**: 2026-10-19
- **Commit más reciente**: barra de navegación rediseñada + menú de usuario (ver `git log`)
- **Última funcionalidad completada**: modo oscuro con toggle (corregido), persistencia y
  preferencia del sistema; logo legible en oscuro; superficies oscuras con tinte de marca OLO.

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

## Bloqueos actuales

- Ninguno. El entorno local está operativo (Node, npm y Git disponibles).

## Notas de entorno

- `git` está instalado en `C:\Users\<usuario>\AppData\Local\Programs\Git` y puede no estar
  en el `PATH` de la terminal; añadirlo a la sesión si `git` no se reconoce.
- Identidad de commits configurada **a nivel de repositorio** como
  `dpaniaguaOLO <dpaniagua@ologistics.com>` (la configuración global del equipo no se modificó).
- El `push` a un remoto todavía no está configurado ni autorizado.
