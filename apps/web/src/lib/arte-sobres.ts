import type { GameCode } from '@tcg/shared';

/**
 * Las ilustraciones de epoca que existen de verdad en `public/sobres/` (H9e-2).
 *
 * Una lista y no un `fetch` a ciegas: pedir una imagen que no esta es un 404
 * por sobre abierto y un hueco en blanco hasta que falla. Cuando llegue una
 * ilustracion nueva, se anade su clave aqui y nada mas.
 */
const DISPONIBLES: Record<GameCode, readonly string[]> = {
  PTCG: [],
  MTG: [],
  YGO: [],
};

/** Ruta del arte de una epoca, o null si todavia no existe (degradado de reserva). */
export function rutaDeArte(juego: GameCode, artKey: string | null): string | null {
  if (!artKey || !DISPONIBLES[juego].includes(artKey)) return null;
  return `/sobres/${juego.toLowerCase()}/${artKey}.webp`;
}
