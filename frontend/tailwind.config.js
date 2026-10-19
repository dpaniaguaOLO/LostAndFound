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

// Superficies oscuras con una leve tinta verde de la marca, para que el modo
// oscuro siga sintiéndose "OLO" en lugar de un gris neutro genérico.
const oloDark = {
  950: '#071612', // fondo de la app
  900: '#0c201a', // tarjetas / superficies
  800: '#143028', // bordes y separadores
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
