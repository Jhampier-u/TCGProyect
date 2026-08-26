import type { GameCode } from '../game.js';
import type { GameDataByGame } from '../game-data.js';

/**
 * Zonas de un mazo. Coincide con el ENUM de `deck_cards.zone` en la migracion
 * 0001: cambiar una sin la otra rompe la escritura en silencio.
 */
export type DeckZone = 'main' | 'extra' | 'side' | 'commander';

/**
 * Una carta del mazo, con lo justo que las reglas necesitan.
 *
 * El validador NO consulta nada: recibe el mazo ya resuelto. Por eso aqui no
 * hay `printId` ni nada de la impresion — dos impresiones distintas de la misma
 * carta comparten `oracleKey` y cuentan como UNA a efectos de RN-04.
 */
export interface DeckEntry<G extends GameCode = GameCode> {
  oracleKey: string;
  name: string;
  typeLine: string | null;
  gameData: GameDataByGame[G];
  zone: DeckZone;
  quantity: number;
}

/**
 * Codigo estable de problema. Es un codigo y no un texto porque la interfaz
 * tendra que agrupar y traducir: comparar cadenas en espanol seria fragil.
 */
export type DeckIssueCode =
  | 'main_too_small'
  | 'main_too_large'
  | 'extra_too_large'
  | 'side_too_large'
  | 'too_many_copies'
  | 'banned_card'
  | 'wrong_zone'
  | 'unsupported_zone';

export interface DeckIssue {
  code: DeckIssueCode;
  message: string;
  /** Carta implicada. Los problemas de tamano no la llevan. */
  oracleKey?: string;
  cardName?: string;
  zone?: DeckZone;
  /** Cuantas hay y cuantas se permiten. */
  actual?: number;
  allowed?: number;
}

export interface DeckValidation {
  valid: boolean;
  counts: Record<DeckZone, number>;
  issues: DeckIssue[];
}

/** Estrategia por juego (RN-04). Mismo patron que `GameAdapter` (ADR-003). */
export interface DeckValidator<G extends GameCode> {
  readonly game: G;
  validate(entries: readonly DeckEntry<G>[]): DeckValidation;
}
