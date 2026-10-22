-- Usuarios demo para Lost and Found (opción 2: email sintético @lostandfound.olo).
--
-- NOTA: `auth.admin_create_user(...)` NO está disponible en todos los proyectos.
-- Si al usarla ves "function auth.admin_create_user does not exist", crea los
-- usuarios por una de estas dos vías y usa SOLO la sección de promoción/arreglo
-- de este archivo:
--
--   Opción A (CLI, recomendada) — Admin API con la service_role key:
--     POST https://<PROJECT>.supabase.co/auth/v1/admin/users
--     body: {"email":"1001@lostandfound.olo","password":"<CONTRASEÑA_ROBUSTA_ÚNICA>",
--            "email_confirm":true,
--            "user_metadata":{"name":"Admin OLO","employee_id":"1001"}}
--
--   Opción B (panel) — Authentication > Users > Add user (marca Auto Confirm)
--     y añade en User Metadata: { "name": "...", "employee_id": "..." }
--
-- Login en la app por NÚMERO DE COLABORADOR: 1001 (admin) y 2002 (empleado).
--
-- ⚠ SEGURIDAD: NUNCA uses en un proyecto alojado la contraseña demo del backend
-- local (la que aparece en backend/prisma/seed.ts): es pública. En la auditoría
-- del 2026-10-22 el admin de producción la seguía usando (hallazgo P0). Usa una
-- contraseña robusta y única por cuenta, y después de crear el primer admin da
-- de alta al resto desde el panel de la app (POST /admin/users).

-- ---------------------------------------------------------------------------
-- Arreglo de metadatos (usar solo si creaste por panel y el perfil quedó mal).
-- Rellena employee_id/name a partir del email, por si el trigger no los tomó.
-- ---------------------------------------------------------------------------
update public.profiles p
set employee_id = '1001', name = 'Admin OLO'
from auth.users u
where p.id = u.id and u.email = '1001@lostandfound.olo';

update public.profiles p
set employee_id = '2002', name = 'Colaborador Demo'
from auth.users u
where p.id = u.id and u.email = '2002@lostandfound.olo';

-- ---------------------------------------------------------------------------
-- Promover al 1001 a administrador (el trigger los crea como EMPLOYEE).
-- ---------------------------------------------------------------------------
update public.profiles set role = 'ADMIN' where employee_id = '1001';

-- Comprobación: deberías ver las dos filas con su rol.
select employee_id, name, role from public.profiles order by employee_id;
