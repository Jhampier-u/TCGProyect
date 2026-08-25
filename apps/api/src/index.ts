import { GAME_CODES, GAME_NAMES, gameIdOf } from '@tcg/shared';

/**
 * Esqueleto de la API. Todavia no expone HTTP: el framework se elegira al
 * abordar H3, y T-009/T-010 no lo necesitan.
 *
 * Este fichero existe para una sola cosa util: demostrar que el paquete
 * @tcg/shared se resuelve y tipa correctamente desde el backend.
 */
export function describeGames(): string[] {
  return GAME_CODES.map((game) => `${gameIdOf(game)} ${game} - ${GAME_NAMES[game]}`);
}

if (process.argv[1]?.endsWith('index.js')) {
  for (const line of describeGames()) console.log(line);
}
