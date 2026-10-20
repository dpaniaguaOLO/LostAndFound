// Edge Function: admin-reset-password
//
// Permite que un ADMIN restablezca la contraseña de otro colaborador.
// Con la opción de login por email sintético (sin correo real), no hay
// recuperación de contraseña por email, así que esta función la hace un admin.
//
// Seguridad (clave):
//  - Verifica el JWT del llamador y comprueba en `profiles` que es ADMIN.
//  - Solo entonces usa la SERVICE_ROLE (secreta, solo en el servidor) para
//    cambiar la contraseña del usuario destino vía la Auth Admin API.
//  - Revoca las sesiones abiertas del usuario destino (revoke_user_sessions):
//    quien tuviera su contraseña anterior pierde la sesión al caducar el token.
//  - Rate limiting por admin y registro en audit_logs.
//
// La SERVICE_ROLE_KEY NUNCA se expone al cliente: vive solo en los secrets de
// la Edge Function (Supabase la inyecta automáticamente).
//
// Despliegue:  supabase functions deploy admin-reset-password

import { adminClient, cors, getCaller, json, rateLimit } from '../_shared/http.ts';

// bcrypt (usado por Supabase Auth) solo considera los primeros 72 bytes.
const MAX_PASSWORD_BYTES = 72;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido' }, 405);

  // 1) Identificar al llamador y exigir rol ADMIN.
  const caller = await getCaller(req.headers.get('Authorization'));
  if (!caller) return json({ error: 'UNAUTHORIZED', message: 'Sesión requerida' }, 401);
  if (caller.role !== 'ADMIN') {
    return json({ error: 'FORBIDDEN', message: 'Solo un administrador puede hacer esto' }, 403);
  }

  const admin = adminClient();
  const limited = await rateLimit(admin, `reset-password:${caller.id}`, 10, 600);
  if (limited) return limited;

  // 2) Validar el cuerpo.
  let payload: { employeeId?: unknown; newPassword?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'BAD_REQUEST', message: 'JSON inválido' }, 400);
  }
  const employeeId = typeof payload.employeeId === 'string' ? payload.employeeId.trim() : '';
  const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';
  if (!/^[A-Za-z0-9._-]{1,50}$/.test(employeeId)) {
    return json({ error: 'BAD_REQUEST', message: 'Número de colaborador inválido' }, 400);
  }
  if (newPassword.length < 8 || new TextEncoder().encode(newPassword).length > MAX_PASSWORD_BYTES) {
    return json(
      { error: 'BAD_REQUEST', message: `La contraseña debe tener al menos 8 caracteres y como máximo ${MAX_PASSWORD_BYTES} bytes` },
      400,
    );
  }

  try {
    // 3) Localizar al usuario destino por su número de colaborador.
    const { data: target } = await admin
      .from('profiles')
      .select('id, name')
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (!target) return json({ error: 'NOT_FOUND', message: 'Colaborador no encontrado' }, 404);

    // 4) Cambiar la contraseña con la Auth Admin API.
    const { error: updErr } = await admin.auth.admin.updateUserById(target.id, { password: newPassword });
    if (updErr) {
      // Supabase rechaza contraseñas débiles/filtradas según la política del proyecto.
      if (updErr.status === 422) return json({ error: 'BAD_REQUEST', message: updErr.message }, 400);
      throw updErr;
    }

    // 5) Cerrar las sesiones abiertas del usuario (best-effort, se registra si falla).
    const { error: revokeErr } = await admin.rpc('revoke_user_sessions', { p_user_id: target.id });
    if (revokeErr) console.error('[revoke-sessions]', revokeErr.message);

    // 6) Auditoría (sin incluir la contraseña).
    await admin.from('audit_logs').insert({
      actor_id: caller.id,
      action: 'USER_PASSWORD_RESET',
      entity_type: 'User',
      entity_id: target.id,
      summary: `${caller.name} restableció la contraseña de ${target.name} (N° ${employeeId})`,
    });

    return json({ ok: true });
  } catch (e) {
    console.error('[admin-reset-password]', e instanceof Error ? e.message : e);
    return json({ error: 'INTERNAL', message: 'Error interno del servidor' }, 500);
  }
});
