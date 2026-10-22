import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import './index.css';
import { configError } from './lib/config';
import { initNative } from './lib/native';
import { router } from './router';

// Inicializa plugins nativos (Capacitor) si corremos como app Android.
// En web es un no-op, así que no afecta al navegador.
void initNative();

const root = ReactDOM.createRoot(document.getElementById('root')!);

// Configuración inválida: se muestra el problema en vez de arrancar contra el
// backend equivocado (en build ya falla la compilación; esto cubre `vite dev`).
if (configError) {
  root.render(
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '40rem', margin: '0 auto' }}>
      <h1>Configuración incorrecta</h1>
      <p role="alert">{configError}</p>
      <p>Revisa el archivo .env del frontend (ver frontend/.env.example).</p>
    </main>,
  );
} else {
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}
