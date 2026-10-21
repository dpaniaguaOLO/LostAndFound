/** @type {import('tailwindcss').Config} */

// Tokens de marca OLO (Overseas Logistics Operations).
// Verde primario verificado en el logo oficial: #00a785 (olo-500).
// Documentado en docs/OLO_BRAND_RESEARCH.md.
const olo = {
  50: '#e6f7f2',
  100: '#c0ebe0',
  200: '#8fd9c7',
  300: '#4ab397', // variante verde verificada en el sitio
  400: '#1cb692',
  500: '#00a785', // VERDE DE MARCA (verificado en logo-olo.svg)
  600: '#008f72',
  700: '#00745d',
  800: '#005a48',
  900: '#00392e',
  950: '#00241d',
};

// Superficies del modo oscuro: gris oscuro / negro neutro (sobrio y legible).
// El verde de marca OLO se mantiene solo como color de acento, no de fondo.
const oloDark = {
  950: '#0b0e12', // fondo de la app (casi negro)
  900: '#151a21', // tarjetas / superficies
  850: '#1c222b', // superficies elevadas (hover, inputs)
  800: '#272e38', // bordes y separadores
  700: '#363f4b', // bordes con mÃ¡s contraste
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        olo,
        'olo-dark': oloDark,
        // Alias de marca -> OLO. Los componentes usan `brand-*` y heredan el verde oficial.
        brand: olo,
        // Tinta del texto, tomada del wordmark oficial.
        ink: '#251e1f',
      },
      fontFamily: {
        // Open Sans es la tipografÃ­a del sitio oficial de OLO (Google Fonts).
        sans: ['"Open Sans"', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      // Sombras en capas con tinte de la tinta de marca: mÃ¡s suaves y naturales que
      // las grises por defecto. `glow` = halo verde para acciones principales.
      boxShadow: {
        card: '0 1px 2px 0 rgb(37 30 31 / 0.04), 0 1px 3px 0 rgb(37 30 31 / 0.06)',
        'card-hover':
          '0 2px 4px -1px rgb(37 30 31 / 0.06), 0 12px 24px -6px rgb(37 30 31 / 0.12)',
        elevated:
          '0 4px 6px -2px rgb(37 30 31 / 0.05), 0 20px 40px -8px rgb(37 30 31 / 0.18)',
        nav: '0 -1px 0 0 rgb(37 30 31 / 0.06), 0 -8px 24px -12px rgb(37 30 31 / 0.18)',
        glow: '0 6px 20px -6px rgb(0 167 133 / 0.55)',
        'glow-lg': '0 10px 32px -8px rgb(0 167 133 / 0.6)',
        'inner-soft': 'inset 0 1px 2px 0 rgb(37 30 31 / 0.06)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'none' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'none' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'soft-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.55' },
          '50%': { transform: 'scale(1.18)', opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        'typing-dot': {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'fade-up': 'fade-up 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        // Entrada de página: sin fill final para no dejar un transform que rompa position:fixed.
        'page-in': 'fade-up 320ms cubic-bezier(0.16, 1, 0.3, 1) backwards',
        'scale-in': 'scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up': 'slide-up 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-down': 'slide-down 180ms ease-out both',
        'toast-in': 'toast-in 260ms cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        // Solo 3 pulsos: llama la atención al cargar sin distraer después.
        'soft-pulse': 'soft-pulse 2.4s ease-out 3',
        'typing-dot': 'typing-dot 1.2s ease-in-out infinite',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
