import { describe, it, expect } from 'vitest';
import type { DomainSet, IngestWarning } from '@tcg/shared';
import { PokemonTcgAdapter, buildTypeLine, normalizeDate } from './pokemontcg-adapter.js';
import type { PokemonHttp, RawCard, RawPaged, RawSet } from './types.js';

/**
 * Copia de un objeto SIN esas claves -- ausentes de verdad, no puestas a
 * `undefined`.
 *
 * Con `exactOptionalPropertyTypes`, `{...x, campo: undefined}` NO es lo mismo
 * que un objeto sin `campo`, y la diferencia es justo lo que estas pruebas
 * quieren ejercitar: el origen OMITE el campo. Escribirlo como `undefined`
 * probaba un caso que el tipo dice que no puede darse (T-086).
 */
function sin<T extends object, K extends keyof T>(obj: T, ...claves: K[]): Omit<T, K> {
  const copia = { ...obj };
  for (const k of claves) delete copia[k];
  return copia;
}

/** Fixtures copiadas de respuestas reales de la API (2026-08-25). */

const SET_SV1: DomainSet = {
  game: 'PTCG',
  externalId: 'sv1',
  code: 'SVI',
  name: 'Scarlet & Violet',
  releasedAt: '2023-03-31',
  cardCount: 258,
  iconUrl: null,
};

/** Caso real: hp llega como CADENA. */
const SCATTERBUG: RawCard = {
  id: 'sv1-8',
  name: 'Scatterbug',
  supertype: 'Pokemon',
  subtypes: ['Basic'],
  hp: '30',
  types: ['Grass'],
  retreatCost: ['Colorless'],
  convertedRetreatCost: 1,
  rarity: 'Common',
  number: '8',
  regulationMark: 'G',
  set: { id: 'sv1' },
  attacks: [{ cost: ['Grass', 'Colorless'], name: 'Tackle', damage: '20', text: '', convertedEnergyCost: 2 }],
  images: { small: 'https://images.pokemontcg.io/sv1/8.png', large: 'https://images.pokemontcg.io/sv1/8_hires.png' },
};

/** Caso real: dos Tarountula del MISMO set con datos DISTINTOS (P-015). */
const TAROUNTULA_16: RawCard = {
  id: 'sv1-16',
  name: 'Tarountula',
  supertype: 'Pokemon',
  subtypes: ['Basic'],
  hp: '40',
  types: ['Grass'],
  rarity: 'Common',
  number: '16',
  set: { id: 'sv1' },
  attacks: [{ name: 'String Haul', convertedEnergyCost: 1 }],
  images: { large: 'https://images.pokemontcg.io/sv1/16_hires.png' },
};
const TAROUNTULA_18: RawCard = {
  id: 'sv1-18',
  name: 'Tarountula',
  supertype: 'Pokemon',
  subtypes: ['Basic'],
  hp: '60',
  types: ['Grass'],
  rarity: 'Common',
  number: '18',
  set: { id: 'sv1' },
  attacks: [{ name: 'Surprise Attack', convertedEnergyCost: 2 }],
  images: { large: 'https://images.pokemontcg.io/sv1/18_hires.png' },
};

/** Caso real: entrenador. Sin hp, sin types, sin attacks (43 de 250 en sv1). */
const ENTRENADOR: RawCard = {
  id: 'sv1-189',
  name: "Professor's Research",
  supertype: 'Trainer',
  subtypes: ['Supporter'],
  rarity: 'Rare',
  number: '189',
  set: { id: 'sv1' },
  rules: ['Discard your hand and draw 7 cards.'],
  images: { large: 'https://images.pokemontcg.io/sv1/189_hires.png' },
};

function pagedHttp(pages: Array<RawPaged<unknown>>, capturas?: string[]): PokemonHttp {
  let i = 0;
  return {
    json: async <T>(url: string, init?: { headers?: Record<string, string> }) => {
      capturas?.push(JSON.stringify(init?.headers ?? {}));
      return (pages[Math.min(i++, pages.length - 1)] ?? { data: [], page: 1, pageSize: 250, count: 0, totalCount: 0 }) as T;
    },
  };
}

function onePage<T>(items: T[]): RawPaged<T> {
  return { data: items, page: 1, pageSize: 250, count: items.length, totalCount: items.length };
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe('fetchSets', () => {
  it('usa el id del set y convierte la fecha al formato de MySQL', async () => {
    const sets: RawSet[] = [
      { id: 'base1', name: 'Base', ptcgoCode: 'BS', releaseDate: '1999/01/09', printedTotal: 102, total: 102 },
    ];
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage(sets)]));
    const [set] = await collect(adapter.fetchSets());

    expect(set!.externalId).toBe('base1');
    expect(set!.code).toBe('BS');
    // La API devuelve "1999/01/09" con barras; MySQL DATE exige guiones.
    expect(set!.releasedAt).toBe('1999-01-09');
  });

  it('prefiere total sobre printedTotal (incluye las secretas)', async () => {
    const sets: RawSet[] = [{ id: 'sv1', name: 'Scarlet & Violet', printedTotal: 198, total: 258 }];
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage(sets)]));
    const [set] = await collect(adapter.fetchSets());
    expect(set!.cardCount).toBe(258);
  });
});

describe('nombre vs identidad (P-015)', () => {
  it('NO fusiona dos cartas homonimas del mismo set', async () => {
    // El diccionario planteaba oracleKey = nombre normalizado. En sv1 hay 250
    // cartas y 173 nombres: con clave por nombre, sv1-18 habria sobrescrito a
    // sv1-16 y su ataque y sus PS se habrian perdido.
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage([TAROUNTULA_16, TAROUNTULA_18])]));
    const prints = await collect(adapter.fetchPrints(SET_SV1));

    expect(prints).toHaveLength(2);
    expect(prints[0]!.card.oracleKey).toBe('sv1-16');
    expect(prints[1]!.card.oracleKey).toBe('sv1-18');
    expect(prints[0]!.card.oracleKey).not.toBe(prints[1]!.card.oracleKey);

    // Y cada una conserva SUS datos.
    expect(prints[0]!.card.gameData.hp).toBe(40);
    expect(prints[1]!.card.gameData.hp).toBe(60);
    expect(prints[0]!.card.gameData.attacks?.[0]?.name).toBe('String Haul');
    expect(prints[1]!.card.gameData.attacks?.[0]?.name).toBe('Surprise Attack');
  });

  it('conserva el nombre, que es lo que usa la regla de mazo (RN-04)', async () => {
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage([TAROUNTULA_16, TAROUNTULA_18])]));
    const prints = await collect(adapter.fetchPrints(SET_SV1));
    // "Maximo 4 copias por nombre" sigue siendo comprobable agrupando por name.
    expect(new Set(prints.map((p) => p.card.name)).size).toBe(1);
  });
});

describe('normalizacion de game_data', () => {
  it('convierte hp de CADENA a numero', async () => {
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage([SCATTERBUG])]));
    const [print] = await collect(adapter.fetchPrints(SET_SV1));

    expect(print!.card.gameData.hp).toBe(30);
    expect(typeof print!.card.gameData.hp).toBe('number');
  });

  it('mapea attacks a snake_case y descarta los campos vacios', async () => {
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage([SCATTERBUG])]));
    const [print] = await collect(adapter.fetchPrints(SET_SV1));
    const ataque = print!.card.gameData.attacks![0]!;

    expect(ataque.name).toBe('Tackle');
    expect(ataque.converted_energy_cost).toBe(2);
    expect(ataque.cost).toEqual(['Grass', 'Colorless']);
    // text venia como "" y no debe persistirse.
    expect('text' in ataque).toBe(false);
  });

  it('un entrenador sin hp, types ni attacks no rompe nada', async () => {
    // 43 de las 250 cartas de sv1 son asi.
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage([ENTRENADOR])]));
    const [print] = await collect(adapter.fetchPrints(SET_SV1));
    const gd = print!.card.gameData;

    expect('hp' in gd).toBe(false);
    expect('types' in gd).toBe(false);
    expect('attacks' in gd).toBe(false);
    expect(gd.supertype).toBe('Trainer');
    expect(print!.card.rulesText).toBe('Discard your hand and draw 7 cards.');
    expect(print!.card.typeLine).toBe('Trainer - Supporter');
  });
});

describe('rarezas y acabados', () => {
  it('normaliza al vocabulario sembrado en T-007', async () => {
    const cartas: RawCard[] = [
      { ...SCATTERBUG, id: 'a', rarity: 'Double Rare' },
      { ...SCATTERBUG, id: 'b', rarity: 'Special Illustration Rare' },
      { ...SCATTERBUG, id: 'c', rarity: 'Rare Holo LV.X' },
    ];
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage(cartas)]));
    const prints = await collect(adapter.fetchPrints(SET_SV1));

    expect(prints.map((p) => p.rarityCode)).toEqual([
      'double_rare',
      'special_illustration_rare',
      'rare_holo_lv_x',
    ]);
  });

  it('una carta SIN rareza cae a common y avisa, pero no se pierde', async () => {
    const avisos: IngestWarning[] = [];
    const sinRareza: RawCard = { ...sin(SCATTERBUG, 'rarity'), id: 'promo-1' };
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage([sinRareza])]), {
      onWarning: (w) => avisos.push(w),
    });

    const prints = await collect(adapter.fetchPrints(SET_SV1));
    expect(prints).toHaveLength(1);
    expect(prints[0]!.rarityCode).toBe('common');
    expect(prints[0]!.rarityLabel).toBe('');
    expect(avisos[0]!.code).toBe('unknown_rarity');
  });

  it('deriva el acabado de la rareza', async () => {
    const cartas: RawCard[] = [
      { ...SCATTERBUG, id: 'a', rarity: 'Common' },
      { ...SCATTERBUG, id: 'b', rarity: 'Hyper Rare' },
    ];
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage(cartas)]));
    const prints = await collect(adapter.fetchPrints(SET_SV1));

    expect(prints[0]!.finishes).toEqual(['normal', 'reverse']);
    expect(prints[1]!.finishes).toEqual(['holo']);
  });
});

describe('paginacion', () => {
  it('recorre todas las paginas guiandose por totalCount', async () => {
    const p1: RawPaged<RawCard> = { data: [SCATTERBUG, TAROUNTULA_16], page: 1, pageSize: 2, count: 2, totalCount: 3 };
    const p2: RawPaged<RawCard> = { data: [TAROUNTULA_18], page: 2, pageSize: 2, count: 1, totalCount: 3 };
    const adapter = new PokemonTcgAdapter(pagedHttp([p1, p2]));

    const prints = await collect(adapter.fetchPrints(SET_SV1));
    expect(prints.map((p) => p.externalId)).toEqual(['sv1-8', 'sv1-16', 'sv1-18']);
  });

  it('para si una pagina viene vacia, sin bucle infinito', async () => {
    const vacia: RawPaged<RawCard> = { data: [], page: 1, pageSize: 250, count: 0, totalCount: 999 };
    const adapter = new PokemonTcgAdapter(pagedHttp([vacia]));
    expect(await collect(adapter.fetchPrints(SET_SV1))).toEqual([]);
  });
});

describe('clave de API', () => {
  it('envia x-api-key cuando esta configurada', async () => {
    const capturas: string[] = [];
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage([SCATTERBUG])], capturas), {
      apiKey: 'secreta-123',
    });
    await collect(adapter.fetchPrints(SET_SV1));

    expect(capturas[0]).toContain('secreta-123');
    expect(adapter.hasApiKey()).toBe(true);
  });

  it('funciona sin clave, pero lo declara (cuota reducida, T-005)', async () => {
    const capturas: string[] = [];
    const adapter = new PokemonTcgAdapter(pagedHttp([onePage([SCATTERBUG])], capturas));
    await collect(adapter.fetchPrints(SET_SV1));

    expect(capturas[0]).toBe('{}');
    expect(adapter.hasApiKey()).toBe(false);
  });

  it('una clave en blanco cuenta como ausente', () => {
    expect(new PokemonTcgAdapter(pagedHttp([]), { apiKey: '   ' }).hasApiKey()).toBe(false);
  });
});

describe('utilidades', () => {
  it('normalizeDate acepta barras y guiones', () => {
    expect(normalizeDate('1999/01/09')).toBe('1999-01-09');
    expect(normalizeDate('2023-03-31')).toBe('2023-03-31');
    expect(normalizeDate(undefined)).toBeNull();
    expect(normalizeDate('proximamente')).toBeNull();
  });

  it('buildTypeLine compone supertype y subtypes', () => {
    expect(buildTypeLine(SCATTERBUG)).toBe('Pokemon - Basic');
    expect(buildTypeLine({ ...SCATTERBUG, subtypes: [] })).toBe('Pokemon');
    expect(buildTypeLine({ ...sin(SCATTERBUG, 'supertype'), subtypes: [] })).toBeNull();
  });
});
