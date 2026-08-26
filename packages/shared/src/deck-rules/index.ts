import type { GameCode } from '../game.js';
import { mtgValidator } from './mtg.js';
import { ptcgValidator } from './ptcg.js';
import { ygoValidator } from './ygo.js';
import type { DeckEntry, DeckValidation, DeckValidator } from './types.js';

/**
 * Registro de estrategias por juego (RN-04).
 *
 * Mismo patron que `GameAdapter` (ADR-003): anadir un cuarto juego es escribir
 * un fichero y anadir una linea aqui, no tocar un `switch` repartido.
 */
export const DECK_VALIDATORS = {
  MTG: mtgValidator,
  YGO: ygoValidator,
  PTCG: ptcgValidator,
} as const;

/** Valida un mazo contra las reglas de su juego. Funcion pura: no consulta nada. */
export function validateDeck<G extends GameCode>(
  game: G,
  entries: readonly DeckEntry<G>[],
): DeckValidation {
  const validator = DECK_VALIDATORS[game] as unknown as DeckValidator<G>;
  return validator.validate(entries);
}

export { aggregate, emptyCounts, sumZones, DECK_ZONES } from './aggregate.js';
export type { CardTally, DeckAggregate } from './aggregate.js';
export {
  typesOf,
  isMtgBasicLand,
  isYgoExtraDeckCard,
  ygoCopyLimit,
  isPtcgBasicEnergy,
  YGO_DEFAULT_COPY_LIMIT,
} from './predicates.js';
export { mtgValidator, MTG_MIN_MAIN, MTG_MAX_SIDE, MTG_MAX_COPIES } from './mtg.js';
export { ygoValidator, YGO_MIN_MAIN, YGO_MAX_MAIN, YGO_MAX_EXTRA, YGO_MAX_SIDE } from './ygo.js';
export { ptcgValidator, PTCG_DECK_SIZE, PTCG_MAX_COPIES } from './ptcg.js';
export type {
  DeckZone,
  DeckEntry,
  DeckIssue,
  DeckIssueCode,
  DeckValidation,
  DeckValidator,
} from './types.js';
