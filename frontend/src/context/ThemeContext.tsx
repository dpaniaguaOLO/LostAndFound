import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'laf.theme';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Aplica/quita la clase `dark` en <html> y ajusta color-scheme nativo. */
function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

/** Tema actual según el DOM (lo fija el script anti-FOUC de index.html). */
function currentDomTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // El estado inicial se toma del DOM, que ya refleja la preferencia guardada o del sistema.
  const [theme, setThemeState] = useState<Theme>(currentDomTheme);

  // Aplica la clase cuando cambia el estado. No escribe en localStorage aquí:
  // solo se persiste cuando el usuario elige explícitamente (setTheme/toggle).
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  // Si el usuario no ha elegido manualmente, sigue los cambios del sistema.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) setThemeState(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    applyThemeClass(t); // aplica de inmediato, sin esperar al re-render
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      applyThemeClass(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
