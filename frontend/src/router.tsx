import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminPage } from './pages/AdminPage';
import { ClaimsPage } from './pages/ClaimsPage';
import { FoundItemDetailPage } from './pages/FoundItemDetailPage';
import { LoginPage } from './pages/LoginPage';
import { LostReportDetailPage } from './pages/LostReportDetailPage';
import { MyThingsPage } from './pages/MyThingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PublishPage } from './pages/PublishPage';
import { WallPage } from './pages/WallPage';

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
      { path: 'objetos/:id', element: <FoundItemDetailPage /> },
      { path: 'perdidos/:id', element: <LostReportDetailPage /> },
      { path: 'publicar', element: <PublishPage /> },
      { path: 'mis-objetos', element: <MyThingsPage /> },
      { path: 'reclamaciones', element: <ClaimsPage /> },
      { path: 'notificaciones', element: <NotificationsPage /> },
      {
        path: 'admin',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminPage />
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
