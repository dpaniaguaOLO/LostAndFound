import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { WallPage } from './pages/WallPage';

// Login y muro van en el chunk inicial (son la entrada); el resto se carga bajo
// demanda para reducir el JS de arranque (importante en la app Android).
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}
const AdminPage = lazyPage(() => import('./pages/AdminPage'), 'AdminPage');
const ClaimsPage = lazyPage(() => import('./pages/ClaimsPage'), 'ClaimsPage');
const FoundItemDetailPage = lazyPage(() => import('./pages/FoundItemDetailPage'), 'FoundItemDetailPage');
const LostReportDetailPage = lazyPage(() => import('./pages/LostReportDetailPage'), 'LostReportDetailPage');
const MyThingsPage = lazyPage(() => import('./pages/MyThingsPage'), 'MyThingsPage');
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage'), 'NotFoundPage');
const NotificationsPage = lazyPage(() => import('./pages/NotificationsPage'), 'NotificationsPage');
const PublishPage = lazyPage(() => import('./pages/PublishPage'), 'PublishPage');

const page = (node: ReactNode) => <Suspense fallback={<Spinner />}>{node}</Suspense>;

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <WallPage /> },
      { path: 'objetos/:id', element: page(<FoundItemDetailPage />) },
      { path: 'perdidos/:id', element: page(<LostReportDetailPage />) },
      { path: 'publicar', element: page(<PublishPage />) },
      { path: 'mis-objetos', element: page(<MyThingsPage />) },
      { path: 'reclamaciones', element: page(<ClaimsPage />) },
      { path: 'notificaciones', element: page(<NotificationsPage />) },
      {
        path: 'admin',
        element: (
          <ProtectedRoute requireAdmin>
            {page(<AdminPage />)}
          </ProtectedRoute>
        ),
      },
      { path: '*', element: page(<NotFoundPage />) },
    ],
  },
]);
