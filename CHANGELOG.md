# Changelog

Todas las versiones relevantes de Lost and Found se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

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
