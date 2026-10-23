/**
 * Aviso de recompensa del juego: cuando publicar o devolver un objeto suma puntos
 * o sube una insignia, la capa de datos emite un evento y el Layout muestra la
 * ventana "+N puntos". Mismo patrón que lib/unread.ts.
 */
import type { BadgeProgress, PlayerProfile } from '@laf/shared';

export type RewardKind = 'published' | 'returned';

export interface Reward {
  kind: RewardKind;
  before: PlayerProfile;
  after: PlayerProfile;
  /** Insignias nuevas o que subieron de nivel (con su nivel nuevo). */
  badges: BadgeProgress[];
}

type Listener = (r: Reward) => void;
const listeners = new Set<Listener>();

export function emitReward(r: Reward): void {
  listeners.forEach((l) => l(r));
}

export function onReward(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
