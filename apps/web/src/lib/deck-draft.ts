import type { DeckEntry, DeckZone, GameCode, GameData } from '@tcg/shared';
import { isYgoExtraDeckCard } from '@tcg/shared';

/**
 * El mazo en edicion.
 *
 * Este modulo NO importa React a proposito. Los tests de este frontend son de
 * logica pura —no hay entorno DOM configurado en Vitest—, asi que la logica
 * metida dentro de un componente seria logica sin probar. Todas las operaciones
 * devuelven un borrador NUEVO: nada muta en el sitio.
 */

/** Tope de copias por fila. Es el CHECK de `deck_cards`, no una preferencia. */
export const MAX_QUANTITY = 99;

export interface DraftCard {
  printId: number;
  cardId: number;
  name: string;
  typeLine: string | null;
  gameData: GameData;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  imagePath: string | null;
  /** Copias que el usuario posee. Informativo, nunca un impedimento (RN-03). */
  owned: number;
}

export interface DraftEntry extends DraftCard {
  zone: DeckZone;
  quantity: number;
}

export type Draft = readonly DraftEntry[];

/**
 * Zona que le corresponde a una carta.
 *
 * En Yu-Gi-Oh! no es una preferencia del usuario: un Xyz DEBE ir al Extra Deck.
 * Magic y Pokemon no usan Extra Deck en v1, asi que todo cae en `main`.
 */
export function zoneFor(game: GameCode, typeLine: string | null): DeckZone {
  if (game === 'YGO' && isYgoExtraDeckCard(typeLine)) return 'extra';
  return 'main';
}

function acotar(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_QUANTITY, Math.trunc(n)));
}

function misma(entry: DraftEntry, printId: number, zone: DeckZone): boolean {
  return entry.printId === printId && entry.zone === zone;
}

export function addCard(draft: Draft, card: DraftCard, game: GameCode): Draft {
  const zone = zoneFor(game, card.typeLine);
  const existe = draft.some((e) => misma(e, card.printId, zone));
  if (!existe) return [...draft, { ...card, zone, quantity: 1 }];
  return draft.map((e) =>
    misma(e, card.printId, zone) ? { ...e, quantity: acotar(e.quantity + 1) } : e,
  );
}

export function setQuantity(draft: Draft, printId: number, zone: DeckZone, n: number): Draft {
  const cantidad = acotar(n);
  if (cantidad === 0) return draft.filter((e) => !misma(e, printId, zone));
  return draft.map((e) => (misma(e, printId, zone) ? { ...e, quantity: cantidad } : e));
}

/**
 * Mueve una fila de zona, FUSIONANDO si la destino ya tenia esa impresion.
 *
 * Sin la fusion, el borrador podria producir dos filas con la misma
 * `(impresion, zona)` y el guardado violaria `uq_deck_card_zone`.
 */
export function moveZone(draft: Draft, printId: number, from: DeckZone, to: DeckZone): Draft {
  if (from === to) return draft;
  const origen = draft.find((e) => misma(e, printId, from));
  if (!origen) return draft;

  const sinOrigen = draft.filter((e) => !misma(e, printId, from));
  const destino = sinOrigen.find((e) => misma(e, printId, to));
  if (!destino) return [...sinOrigen, { ...origen, zone: to }];

  return sinOrigen.map((e) =>
    misma(e, printId, to) ? { ...e, quantity: acotar(e.quantity + origen.quantity) } : e,
  );
}

/**
 * Entrada del motor de reglas.
 *
 * `oracleKey` sale de `cardId`: dos impresiones distintas de la misma carta lo
 * comparten, que es exactamente la identidad que pide RN-04. Solo esta
 * disponible en el cliente desde que se corrigio P-024.
 */
export function toDeckEntries(draft: Draft): DeckEntry[] {
  return draft.map((e) => ({
    oracleKey: String(e.cardId),
    name: e.name,
    typeLine: e.typeLine,
    gameData: e.gameData,
    zone: e.zone,
    quantity: e.quantity,
  }));
}

export interface DeckCardPayload {
  printId: number;
  zone: DeckZone;
  quantity: number;
}

export function toPayload(draft: Draft): DeckCardPayload[] {
  return draft
    .filter((e) => e.quantity >= 1)
    .map((e) => ({ printId: e.printId, zone: e.zone, quantity: acotar(e.quantity) }));
}

/** Borrador a partir de lo que devuelve `GET /api/decks/:id`. */
export function fromDeckDetail(cards: readonly DraftEntry[]): Draft {
  return cards.map((c) => ({
    printId: c.printId,
    cardId: c.cardId,
    name: c.name,
    typeLine: c.typeLine,
    gameData: c.gameData,
    setCode: c.setCode,
    collectorNumber: c.collectorNumber,
    rarity: c.rarity,
    imagePath: c.imagePath,
    owned: c.owned,
    zone: c.zone,
    quantity: acotar(c.quantity),
  }));
}

/**
 * Firma canonica del contenido, para saber si hay cambios sin guardar.
 *
 * Se ordena a proposito: el orden de las filas no es un cambio, y comparar el
 * array tal cual marcaria el mazo como sucio por reordenar una carta.
 */
export function firmaDe(draft: Draft): string {
  return toPayload(draft)
    .map((e) => `${e.printId}:${e.zone}:${e.quantity}`)
    .sort()
    .join('|');
}
