/**
 * Limitador de intentos en memoria (ventana fija). Pensado para frenar fuerza
 * bruta en el login sin añadir dependencias. Al ser en memoria, se reinicia con
 * el proceso y no se comparte entre instancias: si se escala horizontalmente,
 * sustituir por un almacén compartido (Redis) o por el rate limiting del proxy.
 */
export class AttemptLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  /** Segundos que faltan para poder reintentar, o 0 si la clave no está bloqueada. */
  retryAfter(key: string, now = Date.now()): number {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) return 0;
    return entry.count >= this.maxAttempts ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  }

  /** Registra un intento fallido. */
  fail(key: string, now = Date.now()): void {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
    } else {
      entry.count++;
    }
  }

  /** Olvida la clave (p. ej. tras un login correcto). */
  reset(key: string): void {
    this.hits.delete(key);
  }

  // Evita que el mapa crezca sin límite con claves caducadas.
  private prune(now: number) {
    if (this.hits.size < 1000) return;
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
