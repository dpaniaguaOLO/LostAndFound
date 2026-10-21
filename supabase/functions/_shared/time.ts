// Fechas en la zona horaria de la empresa.
//
// Las Edge Functions corren en UTC, así que "hoy" calculado con setHours(0)
// empezaría a las 18:00 de la tarde anterior en Costa Rica (UTC-6). Estas
// utilidades resuelven el inicio del día en APP_TIMEZONE (secret opcional).

const DEFAULT_TZ = 'America/Costa_Rica';

function appTz(): string {
  return Deno.env.get('APP_TIMEZONE') || DEFAULT_TZ;
}

/** Desfase (ms) entre la hora local de `tz` y UTC en el instante `date`. */
function tzOffsetMs(date: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Inicio del día de hoy (00:00 en la zona de la app), como instante UTC. */
export function startOfTodayInAppTz(): Date {
  const now = new Date();
  const offset = tzOffsetMs(now, appTz());
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

/** Fecha de hoy (YYYY-MM-DD) en la zona de la app. */
export function todayInAppTz(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: appTz() }).format(new Date());
}
