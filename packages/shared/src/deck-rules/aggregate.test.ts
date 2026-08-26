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
    expect(byCard.get('Blue-Eyes')?.perZone.main).toBe(4);
  });

  it('no colapsa Nidoran macho y hembra, que NO se llaman igual (P-013)', () => {
    // La fixture anterior daba a las dos cartas el nombre "Nidoran" a secas, que
    // no existe en ningun catalogo. P-013 registro que se llaman Nidoran seguido
    // del signo de macho y del de hembra, y colapsarlas fue justo el bug. El
    // fuente se mantiene en ASCII puro, asi que los signos se construyen.
    const MACHO = `Nidoran${String.fromCharCode(0x2642)}`;
    const HEMBRA = `Nidoran${String.fromCharCode(0x2640)}`;
    const { byCard } = aggregate([
      entry({ oracleKey: 'nidoran-m', name: MACHO }),
      entry({ oracleKey: 'nidoran-f', name: HEMBRA }),
    ]);
    expect(byCard.size).toBe(2);
  });

  it('P-027: la MISMA carta con oracle_key distinto cuenta como una sola', () => {
    // En Pokemon `oracle_key` es `set-numero`, o sea uno por IMPRESION: la misma
    // carta en cuatro sets son cuatro claves. Agrupar por ahi dejaba pasar 16
    // copias. RN-04 cuenta por NOMBRE.
    const { byCard } = aggregate([
      entry({ oracleKey: 'me2pt5-180', name: "Acerola's Mischief", quantity: 4 }),
      entry({ oracleKey: 'me1-113', name: "Acerola's Mischief", quantity: 4 }),
      entry({ oracleKey: 'me1-165', name: "Acerola's Mischief", quantity: 4 }),
    ]);
    expect(byCard.size).toBe(1);
    expect(byCard.get("Acerola's Mischief")?.perZone.main).toBe(12);
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
