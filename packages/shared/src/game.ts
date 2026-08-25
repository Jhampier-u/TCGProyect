/**
 * Identidad de los tres juegos soportados.
 *
 * Los IDs numericos NO son autoincrementales en la base de datos: son constantes
 * del dominio sembradas por la migracion 0002. Vivir aqui y alli a la vez es
 * deliberado — este fichero y el seed deben concordar siempre.
 *
 * Ver 00Master/04_Diccionario_Datos.md y db/migrations/0002_seed_games_rarities.sql
 */
export const GAME_IDS = {
  MTG: 1,
  YGO: 2,
  PTCG: 3,
} as const;

/** Codigo de juego. Es la clave del dominio; los IDs numericos solo se usan en SQL. */
export type GameCode = keyof typeof GAME_IDS;

/** ID numerico tal como se persiste en `games.id`. */
export type GameId = (typeof GAME_IDS)[GameCode];

/** Los tres codigos, en orden estable. Util para iterar y para tests exhaustivos. */
export const GAME_CODES = Object.keys(GAME_IDS) as readonly GameCode[];

/** API de origen de cada juego. Coincide con `games.source_api`. */
export const GAME_SOURCE_API: Readonly<Record<GameCode, string>> = {
  MTG: 'scryfall',
  YGO: 'ygoprodeck',
  PTCG: 'pokemontcg',
} as const;

/** Nombre mostrable. */
export const GAME_NAMES: Readonly<Record<GameCode, string>> = {
  MTG: 'Magic: The Gathering',
  YGO: 'Yu-Gi-Oh!',
  PTCG: 'Pokemon TCG',
} as const;

export function gameIdOf(game: GameCode): GameId {
  return GAME_IDS[game];
}

export function isGameCode(value: unknown): value is GameCode {
  return typeof value === 'string' && value in GAME_IDS;
}
