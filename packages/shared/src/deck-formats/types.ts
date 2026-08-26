import type { DeckZone } from '../deck-rules/types.js';
import type { GameData } from '../game-data.js';

/**
 * Una linea de una lista de mazo, ya interpretada.
 *
 * Lleva `name` o `externalId`, o los dos: el `.ydk` de Yu-Gi-Oh! solo trae
 * passcodes y ningun nombre, y el formato de Magic solo trae nombres.
 */
export interface DeckLine {
  quantity: number;
  zone: DeckZone;
  name?: string;
  /** Passcode en Yu-Gi-Oh!, `set-numero` en Pokemon. Es nuestro `oracle_key`. */
  externalId?: string;
  setCode?: string;
  collectorNumber?: string;
}

export interface FormatWarning {
  /** 1-indexado, como lo cuenta un editor de texto. */
  line: number;
  text: string;
  reason: 'unparsable' | 'zero_quantity';
}

export interface ParsedDeck {
  lines: DeckLine[];
  warnings: FormatWarning[];
}

/** Lo minimo que hace falta para escribir una lista. */
export interface DeckExportEntry {
  name: string;
  /** Passcode en Yu-Gi-Oh!, `set-numero` en Pokemon. */
  oracleKey: string;
  setCode: string;
  collectorNumber: string;
  zone: DeckZone;
  quantity: number;
  /** Solo lo usa Pokemon, para agrupar en secciones por supertipo. */
  gameData?: GameData;
}

export interface DeckCodec {
  parse(texto: string): ParsedDeck;
  serialize(entries: readonly DeckExportEntry[]): string;
}
