# Lost and Found

Aplicación web interna para que los trabajadores de una empresa publiquen y recuperen
objetos perdidos y encontrados dentro de las instalaciones.

- **Muro** de objetos encontrados con búsqueda, filtros y paginación.
- **Publicación** de hallazgos con fotografía, descripción, ubicación y fecha.
- **Reportes** de objetos perdidos.
- **Reclamaciones**: solicitar, revisar (aprobar/rechazar) y coordinar la devolución.
- **Notificaciones** en la interfaz y **panel de administración**.

## Stack

Monorepo con npm workspaces.

- **Frontend**: React 18 + Vite 5 + TypeScript + Tailwind CSS + React Router.
- **Backend**: Node + Express + TypeScript + Prisma + SQLite (desarrollo) + JWT.
- **Compartido**: `@laf/shared` (tipos y contratos de API).

## Inicio rápido

```bash
# 1. Instalar dependencias (desde la raíz)
npm install

# 2. Configurar entorno del backend
Copy-Item backend/.env.example backend/.env    # Windows PowerShell
# cp backend/.env.example backend/.env          # macOS / Linux

# 3. Preparar la base de datos (desde backend/)
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
cd ..

# 4. Ejecutar en dos terminales (desde la raíz)
npm run dev:backend     # API  -> http://localhost:4000
npm run dev:frontend    # SPA  -> http://localhost:5173
```

Abre `http://localhost:5173` e inicia sesión con una cuenta demo:

| Cuenta | Rol | Contraseña |
|--------|-----|-----------|
| `admin@empresa.com` | Administrador | `password123` |
| `empleado@empresa.com` | Empleado | `password123` |

## Scripts útiles (raíz)

| Script | Descripción |
|--------|-------------|
| `npm run build` | Compila shared, backend y frontend |
| `npm run dev:backend` | Servidor de API en desarrollo |
| `npm run dev:frontend` | SPA en desarrollo |
| `npm test` | Pruebas de los workspaces (si existen) |

## Documentación

- **`CLAUDE.md`** — contexto compartido: arquitectura, contratos de API, modelo de datos,
  seguridad, decisiones técnicas y estado. Léelo antes de trabajar en el proyecto.
- **`CHANGELOG.md`** — cambios por versión.
- **`docs/DEVELOPMENT_STATUS.md`** — estado actual, pruebas y tareas pendientes.

## Licencia

Uso interno. Sin licencia pública definida.
