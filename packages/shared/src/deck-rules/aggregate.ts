import type { DeckEntry, DeckZone } from './types.js';

export const DECK_ZONES: readonly DeckZone[] = ['main', 'extra', 'side', 'commander'];

export interface CardTally {
  name: string;
  /**
   * Primer `oracleKey` visto para esta carta. NO es la clave de agrupacion:
   * solo sirve para que la interfaz pueda referenciar la carta implicada.
   */
  oracleKey: string;
  perZone: Record<DeckZone, number>;
}

export interface DeckAggregate {
  counts: Record<DeckZone, number>;
  /** nombre -> reparto por zona. La clave es la CARTA, no la impresion. */
  byCard: Map<string, CardTally>;
}

export function emptyCounts(): Record<DeckZone, number> {
  return { main: 0, extra: 0, side: 0, commander: 0 };
}

/**
 * Conteo por zona y por carta.
 *
 * Agrupa por NOMBRE porque es lo que dice RN-04 para los tres juegos. Antes
 * agrupaba por `oracleKey`, y en Pokemon esa clave es `set-numero` —una por
 * IMPRESION—, asi que 16 copias de la misma carta repartidas en cuatro sets
 * pasaban como mazo legal (P-027).
 *
 * En Magic y Yu-Gi-Oh! el cambio es inocuo: sus claves son el `oracle_id` y el
 * passcode, estables entre impresiones. Medido sobre el catalogo ingestado:
 * 92/92 y 290/290 nombres unicos.
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

    let tally = byCard.get(entry.name);
    if (!tally) {
      tally = { name: entry.name, oracleKey: entry.oracleKey, perZone: emptyCounts() };
      byCard.set(entry.name, tally);
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
