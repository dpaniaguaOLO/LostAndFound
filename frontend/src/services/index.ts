/**
 * Punto de entrada de la capa de datos.
 * Selecciona la implementación (REST o Supabase) según la configuración.
 * La UI debe importar `services` desde aquí, no las implementaciones concretas.
 */
import { useSupabase } from '../lib/config';
import { restServices } from './rest';
import { supabaseServices } from './supabase';
import type { DataServices } from './types';

export const services: DataServices = useSupabase ? supabaseServices : restServices;

export type { DataServices } from './types';
