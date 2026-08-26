import type { DeckEntry, DeckZone } from './types.js';

export const DECK_ZONES: readonly DeckZone[] = ['main', 'extra', 'side', 'commander'];

export interface CardTally {
  name: string;
  perZone: Record<DeckZone, number>;
}

export interface DeckAggregate {
  counts: Record<DeckZone, number>;
  /** oracleKey -> reparto por zona. La clave es la CARTA, no la impresion. */
  byCard: Map<string, CardTally>;
}

export function emptyCounts(): Record<DeckZone, number> {
  return { main: 0, extra: 0, side: 0, commander: 0 };
}

/**
 * Conteo por zona y por carta.
 *
 * Agrupa por `oracleKey` a proposito: `deck_cards` referencia IMPRESIONES, y
 * cuatro impresiones distintas de la misma carta son cuatro filas y una sola
 * carta a efectos del limite de copias (RN-04, D3 del spec).
 */
export function aggregate(entries: readonly DeckEntry[]): DeckAggregate {
  const counts = emptyCounts();
  const byCard = new Map<string, CardTally>();

  for (const entry of entries) {
    // Una cantidad no positiva se ignora; jamas resta. La columna tiene un
    // CHECK BETWEEN 1 AND 99, pero el motor no depende de la base de datos.
    const cantidad = Number.isFinite(entry.quantity) ? Math.trunc(entry.quantity) : 0;
    if (cantidad <= 0) continue;

    counts[entry.zone] += cantidad;

    let tally = byCard.get(entry.oracleKey);
    if (!tally) {
      tally = { name: entry.name, perZone: emptyCounts() };
      byCard.set(entry.oracleKey, tally);
    }
    tally.perZone[entry.zone] += cantidad;
  }

  return { counts, byCard };
}

export function sumZones(
  perZone: Record<DeckZone, number>,
  zones: readonly DeckZone[],
): number {
  return zones.reduce((total, zone) => total + perZone[zone], 0);
}
