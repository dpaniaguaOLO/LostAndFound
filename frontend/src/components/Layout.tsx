import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { onUnreadChanged } from '../lib/unread';
import { services } from '../services';
import { Assistant } from './Assistant';
import { Avatar } from './game';
import { Logo } from './Logo';
import { Onboarding } from './Onboarding';
import { ThemeToggle } from './ThemeToggle';
import { Modal } from './ui';

// --- Iconos de navegación (trazo 1.8, 24px) ---
const icons: Record<string, ReactNode> = {
  wall: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4Zm9 0A1.5 1.5 0 0 1 14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5v-4Zm-9 9A1.5 1.5 0 0 1 5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4Zm9 0a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4Z" />,
  mine: <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Zm0 0 8 4.5m0 0 8-4.5M12 13v7" />,
  claims: <path d="M8 4h8l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2Zm0 8 2.5 2.5L16 9" />,
  admin: <path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Zm-3 9 2 2 4-4" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />,
  bell: <path d="M12 4a5.5 5.5 0 0 0-5.5 5.5v3L5 15.5h14L17.5 12.5v-3A5.5 5.5 0 0 0 12 4Zm-2.5 14a2.5 2.5 0 0 0 5 0" />,
  logout: <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4m-4 4h10" />,
  help: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6m0 3h.01" />,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H5a3 3 0 0 0 3 4m8-4h3a3 3 0 0 1-3 4m-4 3v4m-3.5 3h7l-.5-3h-6l-.5 3Z" />,
};

function Icon({ name, className = 'h-[22px] w-[22px]' }: { name: keyof typeof icons; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {icons[name]}
    </svg>
  );
}

/** Título legible de cada ruta (pestaña del navegador y anuncio accesible). */
function pageTitle(pathname: string): string {
  if (pathname === '/') return 'Muro';
  if (pathname.endsWith('/editar')) return 'Editar publicación';
  if (pathname.startsWith('/objetos/')) return 'Objeto encontrado';
  if (pathname.startsWith('/perdidos/')) return 'Objeto perdido';
  if (pathname.startsWith('/perfil/')) return 'Perfil';
  const map: Record<string, string> = {
    '/publicar': 'Publicar',
    '/mis-objetos': 'Mis objetos',
    '/perfil': 'Mi perfil',
    '/ranking': 'Ranking',
    '/reclamaciones': 'Reclamaciones',
    '/notificaciones': 'Notificaciones',
    '/admin': 'Administración',
  };
  return map[pathname] ?? 'Página no encontrada';
}

// Navegación principal: Muro (todo lo de los colaboradores), Mis objetos
// (lo mío), Publicar (encontrado o perdido) y Reclamaciones.
const navItems = [
  { to: '/', label: 'Muro', icon: 'wall', end: true },
  { to: '/mis-objetos', label: 'Mis objetos', icon: 'mine' },
  { to: '/publicar', label: 'Publicar', icon: 'plus' },
  { to: '/reclamaciones', label: 'Reclamaciones', icon: 'claims' },
] as const;

export function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sheet, setSheet] = useState(false); // hoja de perfil (móvil)
  const [userMenu, setUserMenu] = useState(false); // menú de usuario (escritorio)
  const [unread, setUnread] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);

  // Contador de no leídas: se refresca al navegar, al marcarlas como leídas y al
  // volver a la app (en el móvil la app queda abierta en segundo plano).
  useEffect(() => {
    let active = true;
    const refresh = () =>
      services.notifications
        .unreadCount()
        .then((n) => active && setUnread(n))
        .catch(() => void 0); // la campana sin número no bloquea la navegación
    void refresh();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    const off = onUnreadChanged(() => void refresh());
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      off();
    };
  }, [pathname]);

  // Cierra menús, vuelve arriba y actualiza el título al cambiar de página. El
  // título también se anuncia a lectores de pantalla (en una SPA no hay recarga).
  const [announce, setAnnounce] = useState('');
  const firstRoute = useRef(true);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setUserMenu(false);
    setSheet(false);
    window.scrollTo({ top: 0 });
    const title = pageTitle(pathname);
    document.title = `${title} · Lost & Found OLO`;
    setAnnounce(title);
    // Tras navegar, el foco pasa al contenido nuevo (si no, se queda en el enlace
    // pulsado o en <body>). No en la carga inicial, para no robarlo al abrir.
    if (firstRoute.current) firstRoute.current = false;
    else mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  // Introducción para usuarios nuevos: solo la primera vez (por usuario y dispositivo).
  const onboardKey = `laf.onboarded.${user?.id ?? ''}`;
  const [onboarding, setOnboarding] = useState(() => {
    try {
      return !!user && !localStorage.getItem(onboardKey);
    } catch {
      return false;
    }
  });
  function finishOnboarding() {
    setOnboarding(false);
    try {
      localStorage.setItem(onboardKey, '1');
    } catch {
      /* sin almacenamiento: se volverá a mostrar, no es grave */
    }
  }

  // Aviso de conexión: en el móvil es fácil quedarse sin red y no saberlo.
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // Sombra en la cabecera solo cuando hay scroll.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Cierra el menú de usuario al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!userMenu) return;
    function onClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenu(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setUserMenu(false);
        userMenuButtonRef.current?.focus(); // devolver el foco al botón que lo abrió
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenu]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const desktopLink = ({ isActive }: { isActive: boolean }) =>
    'relative flex items-center whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition duration-200 ' +
    (isActive
      ? 'bg-olo-50 text-olo-700 dark:bg-olo-500/15 dark:text-olo-300'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-olo-dark-850 dark:hover:text-white');

  return (
    <div className="min-h-screen">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-elevated">
        Saltar al contenido
      </a>

      <header
        className={
          'sticky top-0 z-30 border-b backdrop-blur-xl backdrop-saturate-150 transition-[box-shadow,background-color,border-color] duration-300 ' +
          (scrolled
            ? 'border-slate-200/80 bg-white/80 shadow-card dark:border-olo-dark-800 dark:bg-olo-dark-950/80'
            : 'border-transparent bg-slate-50/60 dark:bg-olo-dark-950/60')
        }
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center rounded-lg" aria-label="Lost and Found — OLO, ir al muro">
            <Logo markClassName="h-6 w-auto sm:h-7" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : undefined} className={desktopLink}>
                {item.label}
              </NavLink>
            ))}
            <NavLink to="/ranking" className={desktopLink}>
              Ranking
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={desktopLink}>
                Admin
              </NavLink>
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <ThemeToggle />
            <Link
              to="/notificaciones"
              className="icon-btn relative"
              aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}
            >
              <Icon name="bell" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] animate-scale-in items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-olo-dark-950">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>

            {/* Menú de usuario (escritorio): patrón "disclosure" (botón + panel con
                enlaces), no role="menu", que exigiría navegación con flechas. */}
            <div ref={userMenuRef} className="relative hidden md:block">
              <button
                ref={userMenuButtonRef}
                onClick={() => setUserMenu((v) => !v)}
                className="ml-1 flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-olo-dark-850"
                aria-controls="user-menu"
                aria-expanded={userMenu}
              >
                <Avatar name={user?.name ?? ''} url={user?.avatarUrl} size="h-8 w-8 text-xs" className="shadow-glow" />
                <span className="max-w-[9rem] truncate">{user?.name}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className={'transition-transform duration-200 ' + (userMenu ? 'rotate-180' : '')}>
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              {userMenu && (
                <div id="user-menu" className="card absolute right-0 mt-2 w-60 origin-top-right animate-slide-down overflow-hidden p-1.5 shadow-elevated">
                  <div className="px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      N° {user?.employeeId} · {isAdmin ? 'Administrador' : 'Colaborador'}
                    </p>
                  </div>
                  <div className="my-1 h-px bg-slate-100 dark:bg-olo-dark-800" />
                  <Link
                    to="/perfil"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-olo-dark-850"
                  >
                    <Icon name="user" className="h-[18px] w-[18px]" />
                    Mi perfil
                  </Link>
                  <Link
                    to="/mis-objetos"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-olo-dark-850"
                  >
                    <Icon name="mine" className="h-[18px] w-[18px]" />
                    Mis objetos
                  </Link>
                  <button
                    onClick={() => {
                      setUserMenu(false);
                      setOnboarding(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-olo-dark-850"
                  >
                    <Icon name="help" className="h-[18px] w-[18px]" />
                    Cómo funciona
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                  >
                    <Icon name="logout" className="h-[18px] w-[18px]" />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {!online && (
        <div className="sticky top-14 z-20 animate-slide-down bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200 sm:top-16" role="status">
          Sin conexión a internet. Los cambios no se guardarán hasta que vuelva la red.
        </div>
      )}

      {/* Margen inferior en móvil para no quedar bajo la barra de navegación. */}
      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-32 pt-5 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:px-6 sm:pt-8 md:pb-16">
        <div key={pathname} className="animate-page-in">
          <Outlet />
        </div>
      </main>

      {/* Barra de navegación inferior (móvil): pulgar-friendly, Publicar destacado al centro */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 shadow-nav backdrop-blur-xl backdrop-saturate-150 safe-bottom dark:border-olo-dark-800 dark:bg-olo-dark-900/90 md:hidden"
        aria-label="Principal"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          {navItems.map((item) =>
            item.icon === 'plus' ? (
              <NavLink key={item.to} to={item.to} className="flex justify-center" aria-label="Publicar">
                {({ isActive }) => (
                  <span
                    className={
                      '-mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-olo-600 to-olo-700 text-white shadow-glow-lg ring-4 ring-slate-50 transition duration-200 active:scale-90 dark:from-olo-400 dark:to-olo-500 dark:text-slate-950 dark:ring-olo-dark-950 ' +
                      (isActive ? 'rotate-45' : '')
                    }
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </span>
                )}
              </NavLink>
            ) : (
              <BottomLink key={item.to} to={item.to} end={'end' in item ? item.end : undefined} label={item.label === 'Reclamaciones' ? 'Reclamos' : item.label} icon={item.icon} />
            ),
          )}
          <button
            onClick={() => setSheet(true)}
            className="group flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400"
            aria-label="Perfil y más opciones"
          >
            <Avatar name={user?.name ?? ''} url={user?.avatarUrl} size="h-7 w-7 text-[11px]" className="transition group-active:scale-90" />
            Perfil
          </button>
        </div>
      </nav>

      {/* Hoja de perfil (móvil) */}
      <Modal open={sheet} label="Perfil" onClose={() => setSheet(false)}>
        <Link to="/perfil" className="-mx-2 mb-5 flex items-center gap-3 rounded-2xl p-2 transition hover:bg-slate-100 active:bg-slate-100 dark:hover:bg-olo-dark-850">
          <Avatar name={user?.name ?? ''} url={user?.avatarUrl} size="md" className="shadow-glow" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{user?.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              N° {user?.employeeId} · {isAdmin ? 'Administrador' : 'Colaborador'}
            </p>
          </div>
          <span className="text-xs font-semibold text-olo-700 dark:text-olo-300">Ver perfil</span>
        </Link>
        <div className="flex flex-col gap-1">
          <SheetLink to="/ranking" icon="trophy" label="Ranking" />
          <SheetLink to="/notificaciones" icon="bell" label="Notificaciones" badge={unread} />
          <SheetLink to="/mis-objetos" icon="mine" label="Mis objetos" />
          {isAdmin && <SheetLink to="/admin" icon="admin" label="Panel de administración" />}
          <button
            onClick={() => {
              setSheet(false);
              setOnboarding(true);
            }}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium text-slate-700 transition hover:bg-slate-100 active:bg-slate-100 dark:text-slate-200 dark:hover:bg-olo-dark-850"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-olo-dark-850 dark:text-slate-300">
              <Icon name="help" className="h-5 w-5" />
            </span>
            <span className="flex-1">Cómo funciona</span>
          </button>
        </div>
        <button className="btn-secondary mt-5 w-full text-red-600 dark:text-red-400" onClick={handleLogout}>
          <Icon name="logout" className="h-[18px] w-[18px]" />
          Cerrar sesión
        </button>
      </Modal>

      {/* Olivia, la asistente (disponible en toda la app) */}
      <Assistant />

      <Onboarding open={onboarding} onClose={finishOnboarding} />
    </div>
  );
}

function BottomLink({ to, end, label, icon }: { to: string; end?: boolean; label: string; icon: keyof typeof icons }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        'group flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ' +
        (isActive ? 'text-olo-700 dark:text-olo-400' : 'text-slate-600 dark:text-slate-400')
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={
              'flex h-7 w-12 items-center justify-center rounded-full transition duration-300 ease-out-expo group-active:scale-90 ' +
              (isActive ? 'bg-olo-100 dark:bg-olo-500/15' : '')
            }
          >
            <Icon name={icon} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

function SheetLink({ to, icon, label, badge = 0 }: { to: string; icon: keyof typeof icons; label: string; badge?: number }) {
  return (
    <Link
      to={to}
      className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-slate-700 transition hover:bg-slate-100 active:bg-slate-100 dark:text-slate-200 dark:hover:bg-olo-dark-850"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-olo-dark-850 dark:text-slate-300">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{badge > 9 ? '9+' : badge}</span>
      )}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-slate-500">
        <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </Link>
  );
}
