import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiRequestError } from '../lib/api';

export function LoginPage() {
  const { user, login, register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ name, email, password });
      }
      notify('Sesión iniciada', 'success');
      navigate('/');
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : 'No se pudo completar la operación';
      notify(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            L&amp;F
          </span>
          <h1 className="text-xl font-semibold text-slate-800">Lost and Found</h1>
          <p className="text-sm text-slate-500">
            {mode === 'login'
              ? 'Inicia sesión para acceder al muro de objetos'
              : 'Crea tu cuenta de empleado'}
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
            <label className="label" htmlFor="email">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          <button className="btn-primary w-full" type="submit" disabled={submitting}>
            {submitting ? 'Procesando…' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-slate-500">
          {mode === 'login' ? (
            <button className="text-brand-700 hover:underline" onClick={() => setMode('register')}>
              ¿No tienes cuenta? Regístrate
            </button>
          ) : (
            <button className="text-brand-700 hover:underline" onClick={() => setMode('login')}>
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          )}
        </div>

        <div className="mt-6 rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500">
          Cuentas de prueba: <strong>admin@empresa.com</strong> /{' '}
          <strong>empleado@empresa.com</strong> — contraseña <strong>password123</strong>
        </div>
      </div>
    </div>
  );
}
