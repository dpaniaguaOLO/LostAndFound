# Changelog

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
