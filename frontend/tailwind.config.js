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
};

// Superficies del modo oscuro: gris oscuro / negro neutro (sobrio y legible).
// El verde de marca OLO se mantiene solo como color de acento, no de fondo.
const oloDark = {
  950: '#0b0e12', // fondo de la app (casi negro)
  900: '#151a21', // tarjetas / superficies
  800: '#272e38', // bordes y separadores
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
        // Open Sans es la tipografía del sitio oficial de OLO (Google Fonts).
        sans: ['"Open Sans"', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(37 30 31 / 0.04), 0 1px 3px 0 rgb(37 30 31 / 0.08)',
      },
    },
  },
  plugins: [],
};
