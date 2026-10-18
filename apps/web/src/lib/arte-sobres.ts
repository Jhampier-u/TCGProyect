import type { GameCode } from '@tcg/shared';

/**
 * Las ilustraciones de epoca que existen de verdad en `public/sobres/` (H9e-2).
 *
 * Una lista y no un `fetch` a ciegas: pedir una imagen que no esta es un 404
 * por sobre abierto y un hueco en blanco hasta que falla. Cuando llegue una
 * ilustracion nueva, se anade su clave aqui; `tools/arte-sobres.test.ts` comprueba
 * que lista y disco coinciden y que cada fichero es WebP ligero.
 */
const DISPONIBLES: Record<GameCode, readonly string[]> = {
  PTCG: [
    'booster-clasico-hasta-la-era-ex',
    'booster-diamond-pearl-platinum',
    'booster-heartgold-soulsilver',
    'booster-black-white-xy',
    'booster-sun-moon',
    'booster-sword-shield',
    'booster-paldean-fates',
    'booster-black-bolt-white-flare',
    'booster-scarlet-violet',
    'booster-mega-evolution-en-adelante',
  ],
  MTG: ['booster-clasico-sin-foil', 'booster-con-foil-sin-mitica', 'draft-booster', 'play-booster'],
  YGO: [
    'core-booster-hasta-light-of-destruction',
    'core-booster-duelist-genesis-dimension-of-chaos',
    'core-booster-breakers-of-shadow-ignition-assault',
    'core-booster-eternity-code-en-adelante',
    'duel-terminal',
    'gold-series',
    'battle-pack',
    'mega-pack',
    'rarity-collection',
    'legendary-duelists',
    'movie-pack',
  ],
};

/** Ruta del arte de una epoca, o null si todavia no existe (degradado de reserva). */
export function rutaDeArte(juego: GameCode, artKey: string | null): string | null {
  if (!artKey || !DISPONIBLES[juego].includes(artKey)) return null;
  return `/sobres/${juego.toLowerCase()}/${artKey}.webp`;
}
