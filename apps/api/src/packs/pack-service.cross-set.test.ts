import { describe, it, expect } from 'vitest';
import type { GameCode, IngestWarning } from '@tcg/shared';
import { PackService } from './pack-service.js';
import type {
  PackRepository,
  PersistOpeningInput,
  SetPool,
  TemplateConfig,
} from './types.js';

/**
 * T-085 - las dos cosas que el pool `(set_id, rarity_id)` no sabia expresar, y
 * que eran los puntos 1 y 2 de P-008:
 *
 *  1. Una carta que viene de OTRO set. The List de Magic aparece en el septimo
 *     carton de uno de cada ocho Play Booster, y no esta en el pool del set que
 *     se abre.
 *  2. Un slot que exige un TIPO de carta. Las tierras basicas son rareza
 *     `common`, asi que el slot de tierra entregaba cualquier comun.
 *
 * La invariante que ninguna de las dos puede romper esta comprobada aparte: tres
 * valores del PRNG por slot, pase lo que pase. Si una entrada de otro set
 * consumiera un valor de mas, la MISMA semilla daria cartas distintas segun si
 * salio The List o no, y RN-01 dejaria de significar nada.
 */

function pool(counts: Record<string, number>, basicasEn?: Record<string, number>): SetPool {
  const p: SetPool = new Map();
  let id = 1;
  for (const [rareza, n] of Object.entries(counts)) {
    p.set(rareza, Array.from({ length: n }, () => ({ printId: id, cardId: id++, basicLand: false })));
  }
  for (const [rareza, n] of Object.entries(basicasEn ?? {})) {
    const lista = p.get(rareza) ?? [];
    for (let i = 0; i < Math.min(n, lista.length); i += 1) lista[i]!.basicLand = true;
  }
  return p;
}

class FakeRepo implements PackRepository {
  persistidas: PersistOpeningInput[] = [];
  ajenos = new Map<string, SetPool>();
  pedidos: string[] = [];

  constructor(
    private readonly template: TemplateConfig,
    private readonly propio: SetPool,
  ) {}

  async findTemplate(): Promise<TemplateConfig | null> {
    return this.template;
  }
  async loadPool(): Promise<SetPool> {
    return this.propio;
  }
  async loadPoolByCode(_g: GameCode, code: string): Promise<SetPool | null> {
    this.pedidos.push(code);
    return this.ajenos.get(code) ?? null;
  }
  async rarityTiers(): Promise<Map<string, number>> {
    return new Map([['common', 1], ['uncommon', 2], ['rare', 3], ['mythic', 4]]);
  }
  async ownedQuantities(): Promise<Map<string, number>> {
    return new Map();
  }
  async persistOpening(input: PersistOpeningInput): Promise<number> {
    this.persistidas.push(input);
    return this.persistidas.length;
  }
  async findOpening(): Promise<null> {
    return null;
  }
}

/** Un solo slot, para que lo medido sea el slot y no el resto del sobre. */
function unSlot(distribution: TemplateConfig['slots'][number]['distribution'], filtro?: 'basic_land'): TemplateConfig {
  return {
    templateId: 1,
    game: 'MTG',
    setId: 10,
    name: 'Prueba',
    cardCount: 1,
    slots: [{ slotIndex: 0, distribution, foilChance: 0, ...(filtro ? { cardFilter: filtro } : {}) }],
  };
}

describe('una entrada que saca la carta de otro set (T-085, P-008.1)', () => {
  it('entrega impresiones del set ajeno, no del propio', async () => {
    const repo = new FakeRepo(unSlot([{ set: 'plst', weight: 1000 }]), pool({ common: 5 }));
    repo.ajenos.set('plst', pool({ rare: 3 }));
    // El pool ajeno se construye aparte, asi que sus printId arrancan otra vez
    // en 1; lo que distingue una carta de la otra aqui es la RAREZA, que el set
    // propio no tiene.
    const service = new PackService({ repository: repo });

    const ap = await service.open(1, 10);

    expect(ap.cards).toHaveLength(1);
    expect(ap.cards[0]!.rarityCode).toBe('rare');
    expect(repo.pedidos).toEqual(['plst']);
  });

  it('NO pide el pool ajeno cuando la tirada no lo elige', async () => {
    // Es la razon de que la carga sea perezosa: The List son 4654 filas de sobre
    // y solo hacen falta una de cada ocho veces.
    const repo = new FakeRepo(
      unSlot([{ rarity: 'common', weight: 1000 }, { set: 'plst', weight: 0 }]),
      pool({ common: 5 }),
    );
    const service = new PackService({ repository: repo });

    await service.open(1, 10);

    expect(repo.pedidos).toEqual([]);
  });

  it('reparte segun el peso, no a partes iguales', async () => {
    const repo = new FakeRepo(
      unSlot([{ rarity: 'common', weight: 875 }, { set: 'plst', weight: 125 }]),
      pool({ common: 5 }),
    );
    repo.ajenos.set('plst', pool({ mythic: 3 }));
    const service = new PackService({ repository: repo });

    let deOtroSet = 0;
    for (let i = 0; i < 2000; i += 1) {
      const ap = await service.open(1, 10);
      if (ap.cards[0]!.rarityCode === 'mythic') deOtroSet += 1;
    }

    // 12,5% de 2000 = 250. Margen amplio: esto comprueba el reparto, no el PRNG,
    // que tiene sus propias pruebas.
    expect(deOtroSet).toBeGreaterThan(190);
    expect(deOtroSet).toBeLessThan(320);
  });

  it('reparte UNIFORME sobre las impresiones del set ajeno, no sobre sus rarezas', async () => {
    // The List tiene miles de comunes y 4 `special`. Repartir a partes iguales
    // entre rarezas convertiria esas 4 cartas en el 20% del set, que es una
    // escasez inventada.
    const repo = new FakeRepo(unSlot([{ set: 'plst', weight: 1000 }]), pool({ common: 1 }));
    repo.ajenos.set('plst', pool({ common: 90, special: 10 }));
    const service = new PackService({ repository: repo });

    let especiales = 0;
    for (let i = 0; i < 2000; i += 1) {
      const ap = await service.open(1, 10);
      if (ap.cards[0]!.rarityCode === 'special') especiales += 1;
    }

    // 10 de 100 impresiones -> ~10%. Si el reparto fuera por rareza seria ~50%.
    expect(especiales).toBeGreaterThan(140);
    expect(especiales).toBeLessThan(260);
  });

  it('si el set ajeno no existe, entrega del propio y avisa', async () => {
    const avisos: IngestWarning[] = [];
    const repo = new FakeRepo(
      unSlot([{ rarity: 'common', weight: 1 }, { set: 'noexiste', weight: 1000 }]),
      pool({ common: 5 }),
    );
    const service = new PackService({ repository: repo, onWarning: (w) => avisos.push(w) });

    const ap = await service.open(1, 10);

    expect(ap.cards[0]!.rarityCode).toBe('common');
    expect(avisos.some((a) => a.message.includes("'noexiste'"))).toBe(true);
  });
});

describe('un slot que exige un tipo de carta (T-085, P-008.2)', () => {
  it('entrega solo tierras basicas cuando el set las tiene', async () => {
    const repo = new FakeRepo(
      unSlot([{ rarity: 'common', weight: 1000 }], 'basic_land'),
      pool({ common: 10 }, { common: 3 }),
    );
    const service = new PackService({ repository: repo });

    const entregados = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      const ap = await service.open(1, 10);
      entregados.add(ap.cards[0]!.printId);
    }

    // Las tierras son las tres primeras impresiones que `pool` marco.
    expect([...entregados].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('sin filtro entrega cualquier comun', async () => {
    // El contraste que hace que la prueba anterior signifique algo: sin el
    // filtro, el mismo pool entrega las diez.
    const repo = new FakeRepo(
      unSlot([{ rarity: 'common', weight: 1000 }]),
      pool({ common: 10 }, { common: 3 }),
    );
    const service = new PackService({ repository: repo });

    const entregados = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      const ap = await service.open(1, 10);
      entregados.add(ap.cards[0]!.printId);
    }

    expect(entregados.size).toBeGreaterThan(3);
  });

  it('si el set no tiene tierras basicas, abre la mano y avisa', async () => {
    // 58 de los 135 sets de Magic con slot de tierra no traen tierras basicas en
    // el sobre. Dejar el slot vacio seria entregar un sobre con una carta menos.
    const avisos: IngestWarning[] = [];
    const repo = new FakeRepo(
      unSlot([{ rarity: 'common', weight: 1000 }], 'basic_land'),
      pool({ common: 10 }),
    );
    const service = new PackService({ repository: repo, onWarning: (w) => avisos.push(w) });

    const ap = await service.open(1, 10);

    expect(ap.cards).toHaveLength(1);
    expect(avisos.some((a) => a.message.includes('tierras basicas'))).toBe(true);
  });
});

describe('la invariante del PRNG (RN-01)', () => {
  it('una entrada de otro set consume los MISMOS valores que una normal', async () => {
    // La prueba que de verdad importa. Dos plantillas identicas salvo por lo que
    // el primer slot entrega: si la de The List consumiera un valor de mas, el
    // segundo slot -- que es identico en las dos -- daria cartas distintas con
    // la misma semilla.
    const conAjeno = new FakeRepo(
      {
        templateId: 1, game: 'MTG', setId: 10, name: 'A', cardCount: 2,
        slots: [
          { slotIndex: 0, distribution: [{ set: 'plst', weight: 1000 }], foilChance: 0 },
          { slotIndex: 1, distribution: [{ rarity: 'uncommon', weight: 1000 }], foilChance: 0 },
        ],
      },
      // El MISMO pool que la otra, ids incluidos: `pool` numera las impresiones
      // en secuencia, asi que un pool con menos rarezas daria otros printId y la
      // comparacion de abajo fallaria por la numeracion, no por el PRNG. Lo
      // aprendi haciendo fallar esta prueba.
      pool({ common: 3, uncommon: 40 }),
    );
    conAjeno.ajenos.set('plst', pool({ rare: 3 }));

    const sinAjeno = new FakeRepo(
      {
        templateId: 1, game: 'MTG', setId: 10, name: 'A', cardCount: 2,
        slots: [
          { slotIndex: 0, distribution: [{ rarity: 'common', weight: 1000 }], foilChance: 0 },
          { slotIndex: 1, distribution: [{ rarity: 'uncommon', weight: 1000 }], foilChance: 0 },
        ],
      },
      pool({ common: 3, uncommon: 40 }),
    );

    const semilla = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const a = await new PackService({ repository: conAjeno }).open(1, 10, semilla);
    const b = await new PackService({ repository: sinAjeno }).open(1, 10, semilla);

    // El primer slot entrega cosas distintas -- son pools distintos -- pero el
    // SEGUNDO tiene que coincidir, y solo coincide si el primero gasto lo mismo.
    expect(a.cards[1]!.printId).toBe(b.cards[1]!.printId);
    expect(a.cards[0]!.rarityCode).toBe('rare');
    expect(b.cards[0]!.rarityCode).toBe('common');
  });

  it('un filtro que no deja candidatos tampoco desalinea el flujo', async () => {
    const conFiltro = new FakeRepo(
      {
        templateId: 1, game: 'MTG', setId: 10, name: 'A', cardCount: 2,
        slots: [
          { slotIndex: 0, distribution: [{ rarity: 'common', weight: 1000 }], foilChance: 0, cardFilter: 'basic_land' },
          { slotIndex: 1, distribution: [{ rarity: 'uncommon', weight: 1000 }], foilChance: 0 },
        ],
      },
      pool({ common: 3, uncommon: 40 }),
    );
    const sinFiltro = new FakeRepo(
      {
        templateId: 1, game: 'MTG', setId: 10, name: 'A', cardCount: 2,
        slots: [
          { slotIndex: 0, distribution: [{ rarity: 'common', weight: 1000 }], foilChance: 0 },
          { slotIndex: 1, distribution: [{ rarity: 'uncommon', weight: 1000 }], foilChance: 0 },
        ],
      },
      pool({ common: 3, uncommon: 40 }),
    );

    const semilla = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
    const a = await new PackService({ repository: conFiltro }).open(1, 10, semilla);
    const b = await new PackService({ repository: sinFiltro }).open(1, 10, semilla);

    expect(a.cards[1]!.printId).toBe(b.cards[1]!.printId);
  });
});
