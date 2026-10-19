import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="text-4xl font-bold text-slate-800">404</h1>
      <p className="text-slate-500">La página que buscas no existe.</p>
      <Link to="/" className="btn-primary">
        Volver al muro
      </Link>
    </div>
  );
}
