import { describe, it, expect } from 'vitest';
import {
  addCard,
  fromDeckDetail,
  moveZone,
  setQuantity,
  toDeckEntries,
  toPayload,
  zoneFor,
  MAX_QUANTITY,
  type Draft,
  type DraftCard,
} from './deck-draft.js';

function carta(over: Partial<DraftCard> = {}): DraftCard {
  return {
    printId: 1,
    cardId: 100,
    oracleKey: '89631139',
    name: 'Carta',
    typeLine: 'Effect Monster',
    gameData: {},
    setCode: 'TST',
    collectorNumber: '001',
    rarity: 'common',
    imagePath: null,
    owned: 0,
    ...over,
  };
}

describe('zoneFor', () => {
  it('manda al Extra Deck lo que le corresponde en Yu-Gi-Oh!', () => {
    // La grafia real del catalogo es "Xyz", no "XYZ" (ver el spec de H7, 3.3).
    expect(zoneFor('YGO', 'Xyz Effect Monster')).toBe('extra');
    expect(zoneFor('YGO', 'Fusion Effect Monster')).toBe('extra');
    expect(zoneFor('YGO', 'Synchro Effect Monster')).toBe('extra');
    expect(zoneFor('YGO', 'Link Effect Monster')).toBe('extra');
  });

  it('deja en el Main lo demas, incluido el Ritual', () => {
    expect(zoneFor('YGO', 'Ritual Effect Monster')).toBe('main');
    expect(zoneFor('YGO', 'Effect Monster')).toBe('main');
    expect(zoneFor('YGO', 'Continuous Spell')).toBe('main');
    expect(zoneFor('YGO', null)).toBe('main');
  });

  it('Magic y Pokemon no tienen Extra Deck', () => {
    expect(zoneFor('MTG', 'Creature')).toBe('main');
    // Aunque el texto contenga una palabra de las de Yu-Gi-Oh!.
    expect(zoneFor('MTG', 'Artifact Creature')).toBe('main');
    expect(zoneFor('PTCG', 'Pokemon - Basic')).toBe('main');
  });
});

describe('addCard', () => {
  it('anade una copia y elige la zona por la regla', () => {
    const draft = addCard([], carta({ typeLine: 'Xyz Effect Monster' }), 'YGO');
    expect(draft).toHaveLength(1);
    expect(draft[0]?.zone).toBe('extra');
    expect(draft[0]?.quantity).toBe(1);
  });

  it('incrementa en vez de duplicar la fila', () => {
    let draft: Draft = [];
    draft = addCard(draft, carta(), 'YGO');
    draft = addCard(draft, carta(), 'YGO');
    expect(draft).toHaveLength(1);
    expect(draft[0]?.quantity).toBe(2);
  });

  it('no muta el borrador anterior', () => {
    const antes: Draft = addCard([], carta(), 'YGO');
    const despues = addCard(antes, carta(), 'YGO');
    expect(antes[0]?.quantity).toBe(1);
    expect(despues[0]?.quantity).toBe(2);
  });

  it('dos impresiones distintas son dos filas', () => {
    let draft: Draft = addCard([], carta({ printId: 1 }), 'YGO');
    draft = addCard(draft, carta({ printId: 2 }), 'YGO');
    expect(draft).toHaveLength(2);
  });
});

describe('setQuantity', () => {
  it('cambia la cantidad', () => {
    const draft = setQuantity(addCard([], carta(), 'YGO'), 1, 'main', 3);
    expect(draft[0]?.quantity).toBe(3);
  });

  it('cero o menos elimina la fila', () => {
    const inicial = addCard([], carta(), 'YGO');
    expect(setQuantity(inicial, 1, 'main', 0)).toHaveLength(0);
    expect(setQuantity(inicial, 1, 'main', -4)).toHaveLength(0);
  });

  it('topa en 99, que es el CHECK de deck_cards', () => {
    const draft = setQuantity(addCard([], carta(), 'YGO'), 1, 'main', 200);
    expect(draft[0]?.quantity).toBe(MAX_QUANTITY);
    expect(MAX_QUANTITY).toBe(99);
  });
});

describe('moveZone', () => {
  it('mueve la fila de zona', () => {
    const draft = moveZone(addCard([], carta(), 'YGO'), 1, 'main', 'side');
    expect(draft).toHaveLength(1);
    expect(draft[0]?.zone).toBe('side');
  });

  it('FUSIONA si la zona destino ya tenia esa impresion', () => {
    // Dos filas con la misma (impresion, zona) violarian uq_deck_card_zone al
    // guardar. El borrador no puede llegar a producirlas.
    let draft: Draft = addCard([], carta(), 'YGO');
    draft = setQuantity(draft, 1, 'main', 2);
    draft = [...draft, { ...carta(), zone: 'side', quantity: 1 }];
    const fusionado = moveZone(draft, 1, 'main', 'side');
    expect(fusionado).toHaveLength(1);
    expect(fusionado[0]?.quantity).toBe(3);
  });

  it('mover a la misma zona no cambia nada', () => {
    const inicial = addCard([], carta(), 'YGO');
    expect(moveZone(inicial, 1, 'main', 'main')).toEqual(inicial);
  });
});

describe('toDeckEntries', () => {
  it('manda el oracleKey REAL del catalogo, no uno fabricado', () => {
    // Antes se mandaba `String(cardId)`. Ahora viaja el de verdad, que en
    // Yu-Gi-Oh! es el passcode y es lo que necesita la exportacion a .ydk.
    let draft: Draft = addCard([], carta({ printId: 1, oracleKey: '89631139' }), 'YGO');
    draft = addCard(draft, carta({ printId: 2, oracleKey: '89631139' }), 'YGO');
    const entries = toDeckEntries(draft);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.oracleKey).toBe('89631139');
    expect(entries[1]?.oracleKey).toBe('89631139');
  });

  it('dos impresiones de la MISMA carta se agrupan por NOMBRE (P-027)', () => {
    // La clave de agrupacion del motor es el nombre, no el oracleKey: en
    // Pokemon ese campo es uno por impresion y agrupar por ahi dejaba pasar 16
    // copias. Aqui se comprueba que el nombre viaja identico en las dos filas.
    let draft: Draft = addCard([], carta({ printId: 1, oracleKey: 'me1-113' }), 'YGO');
    draft = addCard(draft, carta({ printId: 2, oracleKey: 'me1-165' }), 'YGO');
    const entries = toDeckEntries(draft);
    expect(entries[0]?.name).toBe(entries[1]?.name);
  });

  it('lleva lo que el motor necesita', () => {
    const draft = addCard([], carta({ typeLine: 'Effect Monster', gameData: { atk: 1200 } }), 'YGO');
    expect(toDeckEntries(draft)[0]).toEqual({
      oracleKey: '89631139',
      name: 'Carta',
      typeLine: 'Effect Monster',
      gameData: { atk: 1200 },
      zone: 'main',
      quantity: 1,
    });
  });
});

describe('toPayload', () => {
  it('produce lo que espera PUT /api/decks/:id/cards', () => {
    let draft: Draft = addCard([], carta({ printId: 7 }), 'YGO');
    draft = setQuantity(draft, 7, 'main', 3);
    expect(toPayload(draft)).toEqual([{ printId: 7, zone: 'main', quantity: 3 }]);
  });

  it('nunca emite dos filas con la misma (impresion, zona)', () => {
    let draft: Draft = addCard([], carta({ printId: 7 }), 'YGO');
    draft = addCard(draft, carta({ printId: 7 }), 'YGO');
    const claves = toPayload(draft).map((e) => `${e.printId}:${e.zone}`);
    expect(new Set(claves).size).toBe(claves.length);
  });
});

describe('fromDeckDetail', () => {
  it('ida y vuelta: lo que entra es lo que sale', () => {
    const cards = [
      { ...carta({ printId: 1 }), zone: 'main' as const, quantity: 3 },
      {
        ...carta({ printId: 2, typeLine: 'Xyz Effect Monster' }),
        zone: 'extra' as const,
        quantity: 1,
      },
    ];
    expect(toPayload(fromDeckDetail(cards))).toEqual([
      { printId: 1, zone: 'main', quantity: 3 },
      { printId: 2, zone: 'extra', quantity: 1 },
    ]);
  });

  it('el mazo vacio no lanza', () => {
    expect(fromDeckDetail([])).toEqual([]);
  });
});
