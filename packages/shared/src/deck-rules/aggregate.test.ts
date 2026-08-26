import { describe, it, expect } from 'vitest';
import { aggregate, emptyCounts, sumZones } from './aggregate.js';
import type { DeckEntry } from './types.js';

function entry(over: Partial<DeckEntry>): DeckEntry {
  return {
    oracleKey: 'x',
    name: 'X',
    typeLine: null,
    gameData: {},
    zone: 'main',
    quantity: 1,
    ...over,
  };
}

describe('aggregate', () => {
  it('cuenta por zona', () => {
    const { counts } = aggregate([
      entry({ zone: 'main', quantity: 40 }),
      entry({ oracleKey: 'y', zone: 'extra', quantity: 15 }),
      entry({ oracleKey: 'z', zone: 'side', quantity: 15 }),
    ]);
    expect(counts).toEqual({ main: 40, extra: 15, side: 15, commander: 0 });
  });

  it('SUMA las impresiones distintas de la misma carta (P-009 y familia)', () => {
    // Dos card_print_id, un oracle_key: es UNA carta a efectos de RN-04. Es el
    // error que ha costado cinco problemas en este proyecto.
    const { byCard } = aggregate([
      entry({ oracleKey: 'blue-eyes', name: 'Blue-Eyes', quantity: 2 }),
      entry({ oracleKey: 'blue-eyes', name: 'Blue-Eyes', quantity: 2 }),
    ]);
    expect(byCard.size).toBe(1);
    expect(byCard.get('blue-eyes')?.perZone.main).toBe(4);
  });

  it('no colapsa dos cartas con oracle_key distinto (Nidoran, P-013)', () => {
    const { byCard } = aggregate([
      entry({ oracleKey: 'nidoran-m', name: 'Nidoran' }),
      entry({ oracleKey: 'nidoran-f', name: 'Nidoran' }),
    ]);
    expect(byCard.size).toBe(2);
  });

  it('ignora cantidades no positivas en vez de restar', () => {
    const { counts } = aggregate([
      entry({ quantity: 3 }),
      entry({ oracleKey: 'y', quantity: 0 }),
      entry({ oracleKey: 'z', quantity: -5 }),
    ]);
    expect(counts.main).toBe(3);
  });

  it('el mazo vacio no lanza', () => {
    expect(aggregate([]).counts).toEqual(emptyCounts());
  });
});

describe('sumZones', () => {
  it('suma solo las zonas pedidas', () => {
    const perZone = { main: 3, extra: 2, side: 1, commander: 0 };
    expect(sumZones(perZone, ['main', 'side'])).toBe(4);
    expect(sumZones(perZone, ['main'])).toBe(3);
  });
});
