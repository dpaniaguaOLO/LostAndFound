import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { allowSelfRegister, useSupabase } from '../lib/config';
import { getErrorMessage } from '../lib/errors';

export function LoginPage() {
  const { user, login, register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Iniciar sesión · Lost & Found OLO';
  }, []);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setLoginError(null);
    try {
      if (mode === 'login') {
        await login({ employeeId, password }, remember);
      } else {
        await register({ name, employeeId, password }, remember);
      }
      notify('Sesión iniciada', 'success');
      navigate('/');
    } catch (err) {
      // Persistente y anunciado junto al formulario (WCAG 3.3.1), no solo un toast efímero.
      setLoginError(getErrorMessage(err, 'No se pudo completar la operación'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Fondo: manchas de color de marca difuminadas */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-olo-300/30 blur-3xl dark:bg-olo-500/15" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-olo-200/40 blur-3xl dark:bg-olo-700/20" />
      </div>
      <div className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))]">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md animate-fade-up rounded-3xl border border-white/60 bg-white/80 p-6 shadow-elevated backdrop-blur-xl dark:border-olo-dark-800 dark:bg-olo-dark-900/80 sm:p-8">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-card ring-1 ring-slate-200/80 dark:bg-olo-dark-850 dark:ring-olo-dark-800">
            <Logo showWordmark={false} markClassName="h-7 w-auto" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink dark:text-slate-50">Lost &amp; Found</h1>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-olo-700 dark:text-olo-400">
              Overseas Logistics Operations
            </p>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {mode === 'login'
              ? 'Ingresa con tu número de colaborador'
              : 'Crea tu cuenta de colaborador'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'register' && (
            <div>
              <label className="label" htmlFor="name">
                Nombre
              </label>
              <input
                id="name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor="employeeId">
              Número de colaborador
            </label>
            <input
              id="employeeId"
              className="input"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
              inputMode="numeric"
              autoComplete="username"
              placeholder="Ej. 1001"
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="input pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 8 : undefined}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-olo-700 dark:text-slate-400 dark:hover:text-olo-400"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  // Ojo tachado
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.3 9.3 0 0 1 12 5c5 0 9 4.5 10 7a12.9 12.9 0 0 1-2.2 3.2M6.1 6.1C3.8 7.6 2.3 9.9 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 3.9-.8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  // Ojo
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {mode === 'login' && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-5 w-5 rounded-md border-slate-300 accent-olo-600 dark:border-slate-600 dark:bg-slate-800"
              />
              Recordar este dispositivo
            </label>
          )}

          {loginError && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {loginError}
            </p>
          )}

          <button className="btn-primary mt-1 w-full py-3 text-base sm:text-sm" type="submit" disabled={submitting}>
            {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
            {submitting ? 'Procesando…' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        {allowSelfRegister ? (
          <div className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
            {mode === 'login' ? (
              <button className="text-olo-700 hover:underline dark:text-olo-400" onClick={() => setMode('register')}>
                ¿No tienes cuenta? Regístrate
              </button>
            ) : (
              <button className="text-olo-700 hover:underline dark:text-olo-400" onClick={() => setMode('login')}>
                ¿Ya tienes cuenta? Inicia sesión
              </button>
            )}
          </div>
        ) : (
          <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
            ¿Sin acceso? Pide a un administrador que cree tu cuenta.
          </p>
        )}

        {/* Credenciales demo solo en desarrollo y solo con el backend local (Express):
            en modo Supabase apuntarían a cuentas reales. */}
        {import.meta.env.DEV && !useSupabase && (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-3 text-center text-xs text-slate-500 dark:border-olo-dark-700 dark:bg-olo-dark-850 dark:text-slate-400">
            Cuentas de prueba: colaborador <strong>1001</strong> (admin) /{' '}
            <strong>2002</strong> (colaborador) — contraseña <strong>password123</strong>
          </div>
        )}
      </div>
    </main>
  );
}
