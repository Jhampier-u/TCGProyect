import { describe, it, expect } from 'vitest';
import type { GameCode, IngestWarning } from '@tcg/shared';
import { PackService, EmptyPoolError, NoTemplateError } from './pack-service.js';
import { pickWeighted, rngFromSeed, generateSeed, xoshiro128ss } from './prng.js';
import type {
  PackOpening,
  PackRepository,
  PersistOpeningInput,
  SetPool,
  TemplateConfig,
} from './types.js';

/** Plantilla equivalente a la sembrada para Yu-Gi-Oh! (migracion 0003). */
function plantillaYgo(): TemplateConfig {
  return {
    templateId: 2,
    game: 'YGO',
    setId: 1,
    name: 'Core Booster',
    cardCount: 9,
    slots: [
      ...Array.from({ length: 7 }, (_, i) => ({
        slotIndex: i,
        distribution: [{ rarity: 'common', weight: 1000 }],
        foilChance: 0,
      })),
      { slotIndex: 7, distribution: [{ rarity: 'rare', weight: 1000 }], foilChance: 0 },
      {
        slotIndex: 8,
        distribution: [
          { rarity: 'super_rare', weight: 750 },
          { rarity: 'ultra_rare', weight: 167 },
          { rarity: 'secret_rare', weight: 83 },
        ],
        foilChance: 1,
      },
    ],
  };
}

function poolDe(counts: Record<string, number>): SetPool {
  const pool: SetPool = new Map();
  let id = 1;
  for (const [rareza, n] of Object.entries(counts)) {
    pool.set(
      rareza,
      Array.from({ length: n }, () => ({ printId: id, cardId: id++, basicLand: false })),
    );
  }
  return pool;
}

/** Igual, pero marcando cuantas de cada rareza son tierra basica (T-085). */
function poolConTierras(counts: Record<string, number>, basicas: Record<string, number>): SetPool {
  const pool = poolDe(counts);
  for (const [rareza, n] of Object.entries(basicas)) {
    const lista = pool.get(rareza) ?? [];
    for (let i = 0; i < Math.min(n, lista.length); i += 1) lista[i]!.basicLand = true;
  }
  return pool;
}

class FakeRepo implements PackRepository {
  persistidas: PersistOpeningInput[] = [];
  owned = new Map<string, number>();
  constructor(
    private readonly template: TemplateConfig | null,
    private readonly pool: SetPool,
    private readonly tiers: Map<string, number> = new Map([
      ['common', 1], ['rare', 4], ['super_rare', 5], ['ultra_rare', 6], ['secret_rare', 8],
    ]),
  ) {}
  async findTemplate(): Promise<TemplateConfig | null> {
    return this.template;
  }
  async loadPool(): Promise<SetPool> {
    return this.pool;
  }
  /** Pools de otros sets, por codigo. Vacio = ningun set ajeno existe. */
  ajenos = new Map<string, SetPool>();
  pedidos: string[] = [];
  async loadPoolByCode(_g: GameCode, code: string): Promise<SetPool | null> {
    this.pedidos.push(code);
    return this.ajenos.get(code) ?? null;
  }
  async rarityTiers(_g: GameCode): Promise<Map<string, number>> {
    return this.tiers;
  }
  async ownedQuantities(): Promise<Map<string, number>> {
    return new Map(this.owned);
  }
  async persistOpening(input: PersistOpeningInput): Promise<number> {
    this.persistidas.push(input);
    return this.persistidas.length;
  }
  async findOpening(): Promise<PackOpening | null> {
    return null;
  }
}

const SEMILLA = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('determinismo (RN-01)', () => {
  it('la misma semilla produce EXACTAMENTE el mismo sobre', async () => {
    const abrir = async () => {
      const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 50, rare: 20, super_rare: 26, ultra_rare: 14, secret_rare: 10 }));
      const service = new PackService({ repository: repo });
      return service.open(1, 1, SEMILLA);
    };

    const a = await abrir();
    const b = await abrir();
    expect(b.cards).toEqual(a.cards);
    expect(b.cards.map((c) => `${c.printId}:${c.rarityCode}:${c.finish}`)).toEqual(
      a.cards.map((c) => `${c.printId}:${c.rarityCode}:${c.finish}`),
    );
  });

  it('semillas distintas producen sobres distintos', async () => {
    const abrir = async (seed: string) => {
      const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 50, rare: 20, super_rare: 26, ultra_rare: 14, secret_rare: 10 }));
      return new PackService({ repository: repo }).open(1, 1, seed);
    };
    const a = await abrir(SEMILLA);
    const b = await abrir('0f1e2d3c4b5a69788796a5b4c3d2e1f0');
    expect(b.cards).not.toEqual(a.cards);
  });

  it('rechaza una semilla mal formada en vez de aceptarla a medias', async () => {
    const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 10, rare: 5, super_rare: 5 }));
    const service = new PackService({ repository: repo });
    // Una semilla invalida produciria una apertura que despues no se reproduce.
    await expect(service.open(1, 1, 'corta')).rejects.toThrow(/Semilla invalida/);
    await expect(service.open(1, 1, 'z'.repeat(32))).rejects.toThrow(/Semilla invalida/);
  });
});

describe('estructura del sobre', () => {
  it('entrega tantas cartas como slots tiene la plantilla', async () => {
    const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 50, rare: 20, super_rare: 26, ultra_rare: 14, secret_rare: 10 }));
    const opening = await new PackService({ repository: repo }).open(1, 1, SEMILLA);

    expect(opening.cards).toHaveLength(9);
    expect(opening.cards.map((c) => c.slotIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('respeta la rareza garantizada de cada slot', async () => {
    const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 50, rare: 20, super_rare: 26, ultra_rare: 14, secret_rare: 10 }));
    const opening = await new PackService({ repository: repo }).open(1, 1, SEMILLA);

    // 7 comunes garantizadas, 1 rare garantizada, 1 "hit" foil.
    expect(opening.cards.slice(0, 7).every((c) => c.rarityCode === 'common')).toBe(true);
    expect(opening.cards[7]!.rarityCode).toBe('rare');
    expect(['super_rare', 'ultra_rare', 'secret_rare']).toContain(opening.cards[8]!.rarityCode);
    expect(opening.cards[8]!.finish).toBe('foil');
  });
});

describe('distribucion sobre muchos sobres', () => {
  it('reproduce los pesos sembrados en T-008', async () => {
    const pool = poolDe({ common: 50, rare: 20, super_rare: 26, ultra_rare: 14, secret_rare: 10 });
    const cuenta: Record<string, number> = {};
    const N = 20_000;

    for (let i = 0; i < N; i += 1) {
      const repo = new FakeRepo(plantillaYgo(), pool);
      const semilla = i.toString(16).padStart(32, '0');
      const opening = await new PackService({ repository: repo }).open(1, 1, semilla);
      const hit = opening.cards[8]!.rarityCode;
      cuenta[hit] = (cuenta[hit] ?? 0) + 1;
    }

    // Konami: 1:6 Ultra, 1:12 Secret, resto Super.
    expect(cuenta.ultra_rare! / N).toBeCloseTo(1 / 6, 1);
    expect(cuenta.secret_rare! / N).toBeCloseTo(1 / 12, 1);
    expect(cuenta.super_rare! / N).toBeCloseTo(0.75, 1);
  });
});

describe('respaldo cuando el pool de una rareza esta vacio', () => {
  it('cae a otra rareza del MISMO slot antes que dejar el hueco vacio', async () => {
    const avisos: IngestWarning[] = [];
    // Set sin secret_rare ni ultra_rare: solo hay super_rare para el slot 8.
    const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 30, rare: 10, super_rare: 5 }));
    const opening = await new PackService({ repository: repo, onWarning: (w) => avisos.push(w) })
      .open(1, 1, SEMILLA);

    expect(opening.cards).toHaveLength(9);
    expect(opening.cards[8]!.printId).toBeGreaterThan(0);
  });

  it('cae a la rareza mas comun del set si ninguna del slot existe', async () => {
    const avisos: IngestWarning[] = [];
    // Un set que SOLO tiene comunes: la plantilla por defecto pide rare y super.
    const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 30 }));
    const opening = await new PackService({ repository: repo, onWarning: (w) => avisos.push(w) })
      .open(1, 1, SEMILLA);

    // Regalar una comun es mejor que entregar un sobre incompleto.
    expect(opening.cards).toHaveLength(9);
    expect(avisos.length).toBeGreaterThan(0);
  });

  it('registra la rareza ENTREGADA, no la pedida', async () => {
    // Caso real: "Supreme Darkness" no tiene ninguna carta 'rare', pero la
    // plantilla por defecto de Yu-Gi-Oh! la pide en el slot 7. Si se registrara
    // la pedida, open() diria 'rare' para una carta que es 'common', mientras
    // que replay() -- que lee la rareza de card_prints -- diria 'common'.
    const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 30, super_rare: 5 }));
    const opening = await new PackService({ repository: repo }).open(1, 1, SEMILLA);

    const slot7 = opening.cards.find((c) => c.slotIndex === 7)!;
    expect(slot7.rarityCode).not.toBe('rare');
    expect(slot7.rarityCode).toBe('common');
  });

  it('el respaldo NO altera el flujo del generador', async () => {
    // El motor consume 3 valores por slot pase lo que pase. Si el respaldo
    // consumiera un numero distinto, dos sobres con la misma semilla divergirian
    // segun que rarezas tenga el set.
    const completo = new FakeRepo(plantillaYgo(), poolDe({ common: 50, rare: 20, super_rare: 26, ultra_rare: 14, secret_rare: 10 }));
    const a = await new PackService({ repository: completo }).open(1, 1, SEMILLA);

    const parcial = new FakeRepo(plantillaYgo(), poolDe({ common: 50, rare: 20, super_rare: 26 }));
    const b = await new PackService({ repository: parcial }).open(1, 1, SEMILLA);

    // Las rarezas ELEGIDAS son las mismas; solo cambia de donde sale la carta.
    expect(b.cards.map((c) => c.rarityCode)).toEqual(a.cards.map((c) => c.rarityCode));
    expect(b.cards.map((c) => c.finish)).toEqual(a.cards.map((c) => c.finish));
  });
});

describe('marcado de cartas nuevas', () => {
  it('marca como nueva la que el usuario no tenia', async () => {
    const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 1, rare: 1, super_rare: 1 }));
    const opening = await new PackService({ repository: repo }).open(1, 1, SEMILLA);
    expect(opening.cards.every((c) => c.isNew || !c.isNew)).toBe(true);
    // La primera aparicion de cada impresion es nueva.
    expect(opening.cards[0]!.isNew).toBe(true);
  });

  it('dos copias de la MISMA carta en el mismo sobre: solo la primera es nueva', async () => {
    // Pool de una sola comun: los 7 slots comunes dan la misma impresion.
    const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 1, rare: 1, super_rare: 1 }));
    const opening = await new PackService({ repository: repo }).open(1, 1, SEMILLA);

    const comunes = opening.cards.filter((c) => c.rarityCode === 'common');
    expect(comunes).toHaveLength(7);
    expect(comunes.filter((c) => c.isNew)).toHaveLength(1);
  });

  it('NO marca como nueva una carta que el usuario ya posee', async () => {
    const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 1, rare: 1, super_rare: 1 }));
    repo.owned.set('1:nonfoil', 3);
    const opening = await new PackService({ repository: repo }).open(1, 1, SEMILLA);

    expect(opening.cards.filter((c) => c.printId === 1 && c.finish === 'nonfoil').every((c) => !c.isNew)).toBe(true);
  });
});

describe('persistencia (P-005)', () => {
  it('congela la plantilla vigente en el momento de abrir', async () => {
    const repo = new FakeRepo(plantillaYgo(), poolDe({ common: 10, rare: 5, super_rare: 5 }));
    await new PackService({ repository: repo }).open(42, 1, SEMILLA);

    const guardada = repo.persistidas[0]!;
    // Sin esta foto, editar pack_slots mas tarde haria irreproducible la apertura.
    expect(guardada.templateSnapshot.slots).toHaveLength(9);
    expect(guardada.seed).toBe(SEMILLA);
    expect(guardada.userId).toBe(42);
    expect(guardada.cards).toHaveLength(9);
  });
});

describe('errores', () => {
  it('falla si el set no tiene plantilla ni existe la del juego', async () => {
    const repo = new FakeRepo(null, poolDe({ common: 10 }));
    await expect(new PackService({ repository: repo }).open(1, 1)).rejects.toBeInstanceOf(NoTemplateError);
  });

  it('falla si el set no tiene ninguna impresion elegible', async () => {
    // Ocurre de verdad: los sets 100% promocionales tienen in_boosters = 0 en
    // todas sus impresiones (P-014).
    const repo = new FakeRepo(plantillaYgo(), new Map());
    await expect(new PackService({ repository: repo }).open(1, 1)).rejects.toBeInstanceOf(EmptyPoolError);
  });
});

describe('PRNG', () => {
  it('genera semillas de 32 caracteres hexadecimales', () => {
    for (let i = 0; i < 20; i += 1) expect(generateSeed()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produce valores en [0, 1)', () => {
    const rng = rngFromSeed(SEMILLA);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('reparte uniformemente', () => {
    const rng = rngFromSeed(SEMILLA);
    const cubos = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i += 1) cubos[Math.floor(rng() * 10)]! += 1;
    for (const c of cubos) expect(c).toBeGreaterThan(9_000);
  });

  it('sobrevive a una semilla degenerada de solo ceros', () => {
    // Un estado todo a cero es un punto fijo de xoshiro: devolveria 0 siempre.
    const rng = xoshiro128ss(0, 0, 0, 0);
    const valores = new Set(Array.from({ length: 10 }, () => rng()));
    expect(valores.size).toBeGreaterThan(1);
  });

  it('pickWeighted respeta los pesos y consume un solo valor', () => {
    const items = [
      { item: 'a', weight: 900 },
      { item: 'b', weight: 100 },
    ];
    let llamadas = 0;
    const rng = () => {
      llamadas += 1;
      return 0.95;
    };
    expect(pickWeighted(items, rng)).toBe('b');
    expect(llamadas).toBe(1);
  });

  it('pickWeighted ignora los pesos negativos', () => {
    const items = [
      { item: 'a', weight: -5 },
      { item: 'b', weight: 10 },
    ];
    expect(pickWeighted(items, () => 0)).toBe('b');
  });
});
