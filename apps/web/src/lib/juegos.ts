import type { GameCode } from '@tcg/shared';

/** El segmento de ruta de cada juego, y su `data-juego` (T-090). */
export const SEGMENTO: Readonly<Record<GameCode, 'mtg' | 'ygo' | 'ptcg'>> = {
  MTG: 'mtg',
  YGO: 'ygo',
  PTCG: 'ptcg',
};

/** El juego de una ruta, por su primer segmento. `null` fuera de un juego. */
export function juegoDeRuta(ruta: string): GameCode | null {
  const m = /^\/(mtg|ygo|ptcg)(?:\/|$)/.exec(ruta);
  if (!m) return null;
  return (Object.keys(SEGMENTO) as GameCode[]).find((g) => SEGMENTO[g] === m[1]) ?? null;
}
