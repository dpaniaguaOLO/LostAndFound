# Changelog

## [0.10.1] - 2026-10-19

### Corregido
- En las sugerencias de coincidencia, el nombre del objeto se cortaba cuando era largo (sobre
  todo en las tarjetas angostas de "Mis objetos"). Se reorganizó la tarjeta: el título va
  arriba, a todo el ancho, y la comparación de imágenes debajo. Ahora el nombre se ve completo.

---

## [0.10.0] - 2026-10-19

Mejoras de la vista de coincidencias y ubicación opcional.

### Añadido
- **Comparación de imágenes lado a lado** en las sugerencias de coincidencia: miniatura del
  objeto perdido junto a la del encontrado, con el porcentaje en medio.
- **Desglose del porcentaje** por señal (descripción, imagen, categoría, ubicación, fecha)
  con barras, expandible con "Ver por qué coincide". El backend devuelve `breakdown`.
- **Página de detalle del objeto perdido** (`/perdidos/:id`) que muestra las coincidencias
  de la IA de forma destacada (no colapsadas).

### Cambiado
- La **ubicación es opcional al reportar un objeto perdido** (quien pierde algo a menudo no
  sabe dónde lo dejó). El emparejado tolera la ubicación vacía.

---


## [0.9.0] - 2026-10-19

Privilegios de administración: moderación, supervisión e historial.

### Añadido
- **Moderación de objetos** (admin): editar, archivar y eliminar cualquier objeto
  encontrado o perdido, no solo los propios. Botones en el detalle del objeto.
  - `PATCH /api/found-items/:id`, `DELETE /api/found-items/:id`, y equivalentes en
    `lost-reports`.
- **Bandeja global de reclamaciones** para admin (`GET /api/claims/all`) y pestaña
  "Reclamaciones" en el panel.
- **Historial / auditoría** (`GET /api/admin/audit`, modelo `AuditLog`): registra
  devoluciones, moderación, revisión de reclamaciones y cambios de rol, con autor y fecha.
  Pestaña "Historial" en el panel.
- Panel de administración reorganizado en pestañas: Resumen · Reclamaciones · Historial.

### Notas
- El borrado es solo para admin y pide confirmación; se prefiere "archivar" (reversible)
  frente a "eliminar" (permanente). Todo queda registrado en el historial.
- Migración `audit_log`.

---


## [0.8.0] - 2026-10-19 (rama `feature/ia-visual`)

Búsqueda visual ligera (sin modelos pesados ni servicios externos).

### Añadido
- **Firma visual de imágenes** (`backend/src/lib/visual.ts`): dHash (estructura) +
  histograma de color por rejilla, calculados con `sharp`. Rápido, local, sin GPU.
- Al subir una foto (encontrado o perdido) se calcula y guarda su firma en
  `imageSignature` (migración `image_signature`).
- El **emparejado** suma una señal de **similitud visual** cuando ambos objetos tienen
  foto (reescalando los pesos), y muestra el motivo "Imagen parecida" en coincidencias
  fuertes. Aplica también al aviso automático.
- Script `backend/scripts/backfill_signatures.ts` para firmar imágenes ya existentes.
- Pruebas del motor visual (`visual.test.ts`).

### Notas
- Es una base **ligera** a propósito (hash + color), no un modelo neuronal. Distingue bien
  color y forma general; con fotos reales mejora respecto a imágenes planas. La capa está
  aislada para sustituirla por embeddings (CLIP/MobileNet) más adelante sin tocar la app.

---


## [0.7.0] - 2026-10-19 (rama `feature/ia`)

Fase 1 de asistencia con IA local (sin LLM).

### Añadido
- **Aviso automático de coincidencias**: al reportar un objeto perdido, el sistema busca
  entre los encontrados y, si hay una coincidencia fuerte (≥55%), envía una notificación
  `MATCH_FOUND` al dueño con el porcentaje y un enlace al objeto.
- **Asistente de búsqueda** (botón flotante en toda la app): interpreta preguntas frecuentes
  por intención (categoría, ubicación, rango de fecha; encontrados vs perdidos) y responde
  con datos reales de la base, enlazando los objetos. No es un LLM ni conversa libremente.
- Backend: `POST /api/ai/assistant`, `backend/src/lib/assistant.ts`,
  `backend/src/lib/matchNotify.ts`. Contratos `AssistantRequest/Response` y tipo de
  notificación `MATCH_FOUND` en `@laf/shared`.
- Las notificaciones con objeto relacionado ahora llevan a su detalle al pulsarlas.

---

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
