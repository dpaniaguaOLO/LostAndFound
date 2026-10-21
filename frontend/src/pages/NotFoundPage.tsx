import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex animate-fade-up flex-col items-center justify-center gap-4 px-4 py-20 text-center sm:py-28">
      <div className="relative">
        <span className="bg-gradient-to-br from-olo-400 to-olo-700 bg-clip-text text-7xl font-extrabold tracking-tight text-transparent sm:text-8xl">
          404
        </span>
      </div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Esta página se perdió</h1>
      <p className="max-w-sm text-slate-500 dark:text-slate-400">
        No encontramos lo que buscas. Quizá alguien la publique en el muro… 😉
      </p>
      <Link to="/" className="btn-primary mt-2">
        Volver al muro
      </Link>
    </div>
  );
}
