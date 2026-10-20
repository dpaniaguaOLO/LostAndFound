// Edge Function: admin-reset-password
//
// Permite que un ADMIN restablezca la contraseña de otro colaborador.
// Con la opción de login por email sintético (sin correo real), no hay
// recuperación de contraseña por email, así que esta función la hace un admin.
//
// Seguridad (clave):
//  - Verifica el JWT del llamador con un cliente "anon" + su token.
//  - Comprueba en `profiles` que el llamador tiene role = 'ADMIN'.
//  - Solo entonces usa la SERVICE_ROLE (secreta, solo en el servidor) para
//    cambiar la contraseña del usuario destino vía la Auth Admin API.
//  - Registra la acción en audit_logs.
//
// La SERVICE_ROLE_KEY NUNCA se expone al cliente: vive solo en los secrets de
// la Edge Function (supabase secrets set / variables del proyecto).
//
// Despliegue:  supabase functions deploy admin-reset-password
// Secrets:     SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY se inyectan por defecto
//              en las Edge Functions del proyecto; no hace falta configurarlos.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'SERVER_MISCONFIGURED' }, 500);
  }

  // 1) Identificar al llamador a partir de su token (Authorization: Bearer ...).
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'UNAUTHORIZED' }, 401);

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'UNAUTHORIZED' }, 401);
  const callerId = userData.user.id;

  // 2) Verificar que el llamador es ADMIN (consulta su propio perfil bajo RLS).
  const { data: callerProfile } = await caller
    .from('profiles')
    .select('role, name')
    .eq('id', callerId)
    .single();
  if (!callerProfile || callerProfile.role !== 'ADMIN') {
    return json({ error: 'FORBIDDEN', message: 'Solo un administrador puede hacer esto' }, 403);
  }

  // 3) Leer el cuerpo: a quién y la nueva contraseña.
  let payload: { employeeId?: string; newPassword?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'BAD_REQUEST', message: 'JSON inválido' }, 400);
  }
  const employeeId = (payload.employeeId ?? '').trim();
  const newPassword = payload.newPassword ?? '';
  if (!employeeId || newPassword.length < 8) {
    return json(
      { error: 'BAD_REQUEST', message: 'employeeId y newPassword (mín. 8) son obligatorios' },
      400,
    );
  }

  // 4) Cliente con SERVICE_ROLE para operaciones privilegiadas.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Localizar al usuario destino por su número de colaborador.
  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, name')
    .eq('employee_id', employeeId)
    .single();
  if (targetErr || !target) {
    return json({ error: 'NOT_FOUND', message: 'Colaborador no encontrado' }, 404);
  }

  // 5) Cambiar la contraseña con la Auth Admin API.
  const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
    password: newPassword,
  });
  if (updErr) {
    return json({ error: 'UPDATE_FAILED', message: updErr.message }, 500);
  }

  // 6) Registrar en el historial de auditoría (best-effort).
  await admin.from('audit_logs').insert({
    actor_id: callerId,
    action: 'USER_PASSWORD_RESET',
    entity_type: 'User',
    entity_id: target.id,
    summary: `${callerProfile.name} restableció la contraseña de ${target.name} (N° ${employeeId})`,
  });

  return json({ ok: true });
});
