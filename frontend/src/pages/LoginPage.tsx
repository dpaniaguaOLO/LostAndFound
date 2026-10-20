import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { allowSelfRegister } from '../lib/config';
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

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login({ employeeId, password }, remember);
      } else {
        await register({ name, employeeId, password }, remember);
      }
      notify('Sesión iniciada', 'success');
      navigate('/');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo completar la operación'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-olo-50 to-slate-100 px-4 py-8 dark:from-slate-900 dark:to-slate-950">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo showWordmark={false} markClassName="h-11 w-auto" />
          <div>
            <h1 className="text-xl font-semibold text-ink dark:text-slate-100">Lost &amp; Found</h1>
            <p className="text-xs uppercase tracking-wide text-olo-700 dark:text-olo-400">
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
                className="h-4 w-4 rounded border-slate-300 text-olo-600 focus:ring-olo-500 dark:border-slate-600 dark:bg-slate-800"
              />
              Recordar este dispositivo
            </label>
          )}

          <button className="btn-primary w-full" type="submit" disabled={submitting}>
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
          <p className="mt-5 text-center text-xs text-slate-400 dark:text-slate-500">
            ¿Sin acceso? Pide a un administrador que cree tu cuenta.
          </p>
        )}

        <div className="mt-6 rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Cuentas de prueba: colaborador <strong>1001</strong> (admin) /{' '}
          <strong>2002</strong> (colaborador) — contraseña <strong>password123</strong>
        </div>
      </div>
    </div>
  );
}
