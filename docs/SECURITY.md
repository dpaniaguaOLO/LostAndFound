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

## Acciones que requieren intervención (no automatizables desde el repo)

### Supabase (panel: Authentication / Project Settings)
1. **Desactivar el registro abierto** (Authentication → Sign In / Providers → *Allow new users to sign up* = off) y dar de alta a los colaboradores desde el panel o la Admin API (ver `supabase/seed_users.sql`). Hoy cualquiera con la URL de la app puede crearse una cuenta.
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
