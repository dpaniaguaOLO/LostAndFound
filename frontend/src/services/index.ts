/**
 * Punto de entrada de la capa de datos.
 * Selecciona la implementación (REST o Supabase) según la configuración.
 * La UI debe importar `services` desde aquí, no las implementaciones concretas.
 */
import { useSupabase } from '../lib/config';
import { trackPoints } from './game';
import { restServices } from './rest';
import { supabaseServices } from './supabase';
import type { DataServices } from './types';

const base: DataServices = useSupabase ? supabaseServices : restServices;

// Publicar y devolver pueden dar puntos: se envuelven para mostrar la recompensa
// ("+N puntos", insignias nuevas) venga de la pantalla que venga.
export const services: DataServices = {
  ...base,
  foundItems: {
    ...base.foundItems,
    create: (form) => trackPoints('published', () => base.foundItems.create(form)),
    markReturned: (id) => trackPoints('returned', () => base.foundItems.markReturned(id)),
  },
};

export type { DataServices } from './types';
