import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { services } from '../services';
import { Assistant } from './Assistant';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

// Navegación principal: Muro (todo lo de los colaboradores), Mis objetos
// (lo mío), Publicar (encontrado o perdido) y Reclamaciones.
const navItems = [
  { to: '/', label: 'Muro', end: true },
  { to: '/mis-objetos', label: 'Mis objetos' },
  { to: '/publicar', label: 'Publicar' },
  { to: '/reclamaciones', label: 'Reclamaciones' },
];

export function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false); // menú móvil
  const [userMenu, setUserMenu] = useState(false); // menú de usuario (escritorio)
  const [unread, setUnread] = useState(0);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    services.notifications
      .list()
      .then((list) => active && setUnread(list.filter((n) => !n.read).length))
      .catch(() => void 0);
    return () => {
      active = false;
    };
  }, []);

  // Cierra el menú de usuario al hacer clic fuera.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenu(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    'flex items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium leading-none transition ' +
    (isActive
      ? 'bg-olo-50 text-olo-700 dark:bg-olo-500/15 dark:text-olo-300'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-olo-dark-800');

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-olo-dark-800 dark:bg-olo-dark-900/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex shrink-0 items-center" aria-label="Lost and Found — OLO">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink to="/admin" className={linkClass}>
                Admin
              </NavLink>
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <Link
              to="/notificaciones"
              className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-olo-dark-800"
              aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 3a6 6 0 0 0-6 6v3l-1.5 3h15L18 12V9a6 6 0 0 0-6-6Zm0 18a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3Z"
                  fill="currentColor"
                />
              </svg>
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>

            {/* Menú de usuario (escritorio): nombre + acceso a "Mis publicaciones" y salir */}
            <div ref={userMenuRef} className="relative hidden md:block">
              <button
                onClick={() => setUserMenu((v) => !v)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-olo-dark-800"
                aria-haspopup="menu"
                aria-expanded={userMenu}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-olo-600 text-xs font-semibold text-white">
                  {user?.name?.slice(0, 1).toUpperCase() ?? '?'}
                </span>
                <span className="max-w-[9rem] truncate">{user?.name}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              {userMenu && (
                <div
                  role="menu"
                  className="card absolute right-0 mt-2 w-52 overflow-hidden p-1 shadow-lg"
                >
                  <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                    {user?.name} · N° {user?.employeeId}
                  </div>
                  <Link
                    to="/mis-objetos"
                    onClick={() => setUserMenu(false)}
                    className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-olo-dark-800"
                    role="menuitem"
                  >
                    Mis objetos
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    role="menuitem"
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>

            {/* Botón de menú móvil */}
            <button
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-olo-dark-800 md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Abrir menú"
              aria-expanded={open}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Menú móvil desplegable */}
        {open && (
          <nav className="flex flex-col gap-1 border-t border-slate-200 px-4 py-3 dark:border-olo-dark-800 md:hidden">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={linkClass}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink to="/admin" className={linkClass} onClick={() => setOpen(false)}>
                Admin
              </NavLink>
            )}
            <button className="btn-secondary mt-2" onClick={handleLogout}>
              Cerrar sesión ({user?.name})
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      {/* Asistente de búsqueda flotante (disponible en toda la app) */}
      <Assistant />
    </div>
  );
}
