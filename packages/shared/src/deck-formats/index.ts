import type { GameCode } from '../game.js';
import { mtgCodec } from './mtg.js';
import { ptcgCodec } from './ptcg.js';
import { ygoCodec } from './ygo.js';
import type { DeckExportEntry, ParsedDeck } from './types.js';

/** Un codec por juego. Mismo patron que los validadores y los adaptadores. */
export const DECK_CODECS = {
  MTG: mtgCodec,
  YGO: ygoCodec,
  PTCG: ptcgCodec,
} as const;

/** Texto pegado -> lineas. Nunca lanza: la entrada llega sucia por definicion. */
export function parseDeck(game: GameCode, texto: string): ParsedDeck {
  return DECK_CODECS[game].parse(texto);
}

/** Mazo -> texto en el formato del juego. */
export function serializeDeck(game: GameCode, entries: readonly DeckExportEntry[]): string {
  return DECK_CODECS[game].serialize(entries);
}

export { mtgCodec } from './mtg.js';
export { ygoCodec } from './ygo.js';
export { ptcgCodec } from './ptcg.js';
export type { DeckLine, FormatWarning, ParsedDeck, DeckExportEntry, DeckCodec } from './types.js';
