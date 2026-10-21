# Seguridad — Lost and Found

Estado de los controles de seguridad, cómo verificarlos y qué requiere configuración
externa. Última revisión: v0.17.0 (2026-10-20).

## Cómo verificar

```bash
npm test                              # backend (unit + 13 pruebas de seguridad e2e) + BD
npm run test:db                       # RLS/privilegios/RPC sobre Postgres (PGlite)
npm run check:secrets -- --all        # secretos en archivos versionados
npm run check:secrets -- --history    # secretos en todo el historial de git
npm run audit:prod                    # vulnerabilidades en dependencias de producción
git config core.hooksPath .githooks   # (una vez por clon) bloquea commits con secretos
```

## Arquitectura de seguridad (resumen)

| Capa | Control |
|------|---------|
| Credenciales | Solo la clave `anon` de Supabase va al cliente; `service_role` vive en los secrets de las Edge Functions. `.env` ignorados; hook de pre-commit con detección de secretos. |
| Autenticación | Express: JWT HS256 (algoritmo fijado) + `jti` + versión de sesión, validados contra la BD en cada petición; logout revoca el token; reset de contraseña invalida todas las sesiones. Supabase Auth: sesiones revocadas al resetear (`revoke_user_sessions`). |
| Autorización | Express: comprobación de propiedad/rol en cada ruta. Supabase: RLS en todas las tablas + privilegios **por columna** + triggers de transición de estado. `anon` sin acceso a tablas. |
| Entradas | zod en todos los cuerpos y query strings; restricciones CHECK en la BD (categoría, longitudes, carpeta de la foto); escape de comodines LIKE y de filtros PostgREST. |
| Archivos | MIME en lista blanca + tipo real verificado con `sharp`, extensión según el contenido, nombre aleatorio, 5 MB, EXIF (GPS) eliminado; servidos solo con URL firmada y caducidad, `nosniff` y CSP `sandbox`. Supabase: bucket privado + URLs firmadas. |
| Abuso | Rate limiting: login (por IP+usuario y por IP), registro, creación de contenido, IA, admin. Express en memoria; Edge Functions con tabla compartida (`rate_limit_hit`). |
| Cabeceras | API: CSP `default-src 'none'`, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, HSTS (producción). Frontend: CSP en `<meta>` generada en el build con hashes de los scripts inline. |
| Contraseñas | bcrypt coste 12 (Express) / Supabase Auth (bcrypt). Mínimo 8, máximo 72 bytes. Login con tiempo constante (no revela si el usuario existe). |

## Auditoría 2026-10-21 (v0.25.0)

Auditoría adversarial completa (RLS, GRANTs, funciones SECURITY DEFINER, Edge
Functions, Storage, LLM, frontend, Android, secretos). Hallazgos corregidos:

| Sev. | Hallazgo | Corrección |
|------|----------|------------|
| Alta | Una cuenta **desactivada** seguía accediendo (JWT previo o nuevo login contra Auth) y un **admin desactivado seguía siendo admin** (podía resetear contraseñas ajenas). | Migración 010: políticas `RESTRICTIVE` `*_active_only` en todas las tablas y en Storage, `is_admin()` exige `active`; `getCaller` rechaza inactivos; al desactivar se **banea en Auth** (`ban_duration`); no se puede desactivar al último admin activo; `review_claim` exige actor activo. |
| Alta | **Registro abierto** en Supabase Auth: con la anon key (va en el APK) cualquiera creaba cuentas y podía ocupar números de colaborador. | `enable_signup = false` en `config.toml` + **desactivarlo en el panel** (ver abajo). |
| Media | El autor de un reporte de perdido podía cambiar su estado libremente (reabrir uno **cerrado por moderación**, marcarlo `MATCHED`). | Trigger `lost_reports_guard_status`: un no-admin solo pasa de `OPEN/MATCHED` a `RESOLVED`. |
| Media | APK de depuración con WebView inspeccionable y `run-as` (token de sesión legible por USB). | `webContentsDebuggingEnabled: false` y `debuggable false` también en el build debug. |
| Baja | Cualquiera podía **cambiarse el nombre** ("Administrador OLO", o el de un colega) y suplantar en avisos y reclamaciones. | `revoke update (name)` (lo cambia un admin). |
| Baja | Objetos `ARCHIVED` / reportes `CLOSED` seguían legibles y editables por todos vía PostgREST; las fotos de lo borrado quedaban en Storage. | SELECT/UPDATE solo autor/admin para lo moderado; el borrado elimina la foto. Express: filtro `status` moderado solo para admin. |
| Baja | Inyección de instrucciones vía descripciones hacia Olivia ("pide su contraseña…"). | Enlaces/correos se eliminan antes y después del modelo; respuestas que mencionan credenciales se sustituyen por un aviso fijo. |
| Baja | Login CSRF con `#access_token=` en la URL (`detectSessionInUrl`). | `detectSessionInUrl: false`. |
| Baja | `TRUNCATE`/`TRIGGER`/`REFERENCES` heredados (RLS no cubre TRUNCATE). | Revocados a `anon`/`authenticated`. |
| Baja | El límite del asistente (coste de OpenAI) dejaba pasar todo si fallaba. | `rateLimit(..., failClosed)` para el asistente. |

Además, las fotos se redimensionan en el dispositivo antes de subirlas, lo que
**elimina los metadatos EXIF (ubicación GPS)** de quien hizo la foto.

Pruebas de regresión en `supabase/tests/db.test.mjs` (migraciones 009 y 010).

## Acciones que requieren intervención (no automatizables desde el repo)

### Supabase (panel: Authentication / Project Settings)
1. **Desactivar el registro abierto** (Authentication → Sign In / Providers → *Allow new users to sign up* = off) — **PRIORITARIO** (hallazgo Alta de la auditoría 2026-10-21; `config.toml` ya lo tiene en `false`, pero el proyecto alojado se configura en el panel). Las altas se hacen desde el panel admin de la app (`POST /admin/users`).
   - Si el registro debe seguir abierto: activar **CAPTCHA** (Authentication → Attack Protection → hCaptcha/Turnstile) — requiere además integrar el widget en `LoginPage`.
2. **Longitud mínima de contraseña = 8** y **Leaked password protection** (Authentication → Attack Protection / Passwords).
3. **Rate limits de Auth** (Authentication → Rate Limits): revisar inicio de sesión y registros por hora.
4. **JWT expiry** (Project Settings → JWT): 3600 s o menos. Tras revocar sesiones, el access token vigente sigue siendo válido hasta caducar.
5. Si la clave `service_role` se compartió alguna vez fuera de los secrets del proyecto: **rotarla** (Project Settings → API → JWT secret / API keys). En la revisión de 2026-10-20 **no** se encontró en el repo ni en su historial.

### Hosting del frontend (aún no definido)
Enviar también como **cabeceras HTTP** (la CSP en `<meta>` no admite `frame-ancestors`):
```
Content-Security-Policy: <la misma que genera el build en dist/index.html>; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```
y redirigir HTTP → HTTPS en el proveedor (Netlify/Vercel/Cloudflare lo hacen por defecto; en Nginx, `return 301 https://$host$request_uri;`). Activar HSTS solo cuando HTTPS funcione en todo el dominio.

### Backend Express en producción (`backend/.env`)
```
NODE_ENV=production
JWT_SECRET=<aleatorio, >= 32 caracteres>   # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
CORS_ORIGIN=https://<dominio-web>[,https://localhost]   # https://localhost = app Android
TRUST_PROXY=1            # si hay un proxy/balanceador delante
FORCE_HTTPS=true
ALLOW_SELF_REGISTRATION=false
```
TLS debe terminar en el proxy/balanceador (el servidor Node no gestiona certificados).

### Repositorio
- Activar el hook en cada clon: `git config core.hooksPath .githooks`.
- Recomendado en GitHub: *Secret scanning* y *Push protection* (Settings → Code security), y *Dependabot alerts*.

## Riesgos residuales conocidos

- **Tokens en almacenamiento accesible a JavaScript** (`localStorage`/`sessionStorage` y la sesión de Supabase). Mover a cookies `HttpOnly` exigiría cambiar el modelo de auth (Bearer) y complica la app Android; se mitiga con CSP estricta sin `unsafe-inline`. Al usar Bearer y no cookies, la API no es vulnerable a CSRF.
- **Rate limiting de Express en memoria**: válido con una sola instancia. Con varias, mover a Redis o al proxy.
- **Dependencias de desarrollo** con avisos sin parche en su versión mayor: cadena de Tailwind 3 (`braces`, `micromatch`, `postcss-selector-parser`; DoS con patrones/CSS propios, no controlados por usuarios) y `@capacitor/cli` → `xcode`/`uuid` (tooling iOS, no usado). No llegan al bundle. Migrar a Tailwind 4 cuando se rediseñe el CSS.
- **Fotos subidas directamente a Supabase Storage** desde el cliente: el tipo se limita por MIME en el bucket, pero no se re-codifican ni se elimina el EXIF (en Express sí). Para hacerlo, subir vía Edge Function o re-codificar en el cliente.
- **Google Fonts**: la web carga Open Sans desde Google (permitido en la CSP). Alojar la fuente localmente evitaría esa petición a un tercero.
- El backend Express y Supabase son dos implementaciones del mismo backend: cada control debe mantenerse en ambas.
