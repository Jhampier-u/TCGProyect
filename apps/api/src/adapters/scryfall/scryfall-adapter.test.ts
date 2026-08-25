import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import type { DomainSet, IngestWarning } from '@tcg/shared';
import { ScryfallAdapter, imageOf, oracleKeyOf, rulesTextOf } from './scryfall-adapter.js';
import { HttpError } from '../../http/errors.js';
import type { RawCard, ScryfallHttp } from './types.js';

/** Fixtures copiadas de respuestas reales de Scryfall (2026-08-25). */

const BOSQUE: RawCard = {
  id: '0000419b-0bba-4488-8f7a-6194544ce91e',
  oracle_id: 'b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6',
  name: 'Forest',
  set: 'blb',
  collector_number: '280',
  rarity: 'common',
  layout: 'normal',
  booster: true,
  finishes: ['nonfoil', 'foil'],
  cmc: 0,
  colors: [], // incolora: el array llega vacio
  color_identity: ['G'],
  mana_cost: '', // sin coste: cadena vacia, no ausente
  type_line: 'Basic Land - Forest',
  oracle_text: '({T}: Add {G}.)',
  keywords: [],
  legalities: { standard: 'legal', modern: 'legal' },
  image_uris: { normal: 'https://cards.scryfall.io/normal/front/0/0/0000419b.jpg' },
};

/** Doble cara: los campos viven en card_faces, no arriba. */
const TRANSFORM: RawCard = {
  id: 'aaaa1111-2222-3333-4444-555566667777',
  oracle_id: 'oracle-transform',
  name: 'Balamb Garden, SeeD Academy // Balamb Garden, Airborne',
  set: 'fin',
  collector_number: '270',
  rarity: 'rare',
  layout: 'transform',
  booster: true,
  finishes: ['nonfoil', 'foil'],
  cmc: 0,
  type_line: 'Land // Legendary Creature',
  card_faces: [
    {
      name: 'Balamb Garden, SeeD Academy',
      mana_cost: '',
      type_line: 'Land',
      oracle_text: 'Cara frontal.',
      colors: [],
      image_uris: { normal: 'https://cards.scryfall.io/normal/front/a/a/aaaa1111.jpg' },
    },
    {
      name: 'Balamb Garden, Airborne',
      mana_cost: '',
      type_line: 'Legendary Creature',
      oracle_text: 'Cara trasera.',
      colors: ['W'],
      power: '4',
      toughness: '4',
      image_uris: { normal: 'https://cards.scryfall.io/normal/back/a/a/aaaa1111.jpg' },
    },
  ],
};

/** reversible_card: NO trae oracle_id de nivel superior. Caso real. */
const REVERSIBLE: RawCard = {
  id: 'rev-0001',
  name: "Jinnie Fay, Jetmir's Second // Jinnie Fay, Jetmir's Second",
  set: 'snc',
  collector_number: '1',
  rarity: 'rare',
  layout: 'reversible_card',
  finishes: ['foil'],
  card_faces: [
    {
      name: "Jinnie Fay, Jetmir's Second",
      oracle_id: '61fbaaf2-4286-4e9a-b9cb-aa31262b596a',
      mana_cost: '{1}{R}{G}',
      colors: ['R', 'G'],
      image_uris: { normal: 'https://cards.scryfall.io/normal/front/r/e/rev.jpg' },
    },
  ],
};

function http(handlers: {
  json?: (url: string) => unknown;
  stream?: () => AsyncIterable<Uint8Array>;
}): ScryfallHttp {
  return {
    json: async <T>(url: string) => {
      if (!handlers.json) throw new Error('json no esperado');
      return handlers.json(url) as T;
    },
    stream: async () => {
      if (!handlers.stream) throw new Error('stream no esperado');
      return handlers.stream();
    },
  };
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

function gzStream(objs: unknown[]): AsyncIterable<Uint8Array> {
  const gz = new Uint8Array(gzipSync(Buffer.from(objs.map((o) => JSON.stringify(o)).join('\n'), 'utf8')));
  return {
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < gz.length; i += 512) yield gz.subarray(i, i + 512);
    },
  };
}

const SET_BLB: DomainSet = {
  game: 'MTG',
  externalId: 'blb',
  code: 'blb',
  name: 'Bloomburrow',
  releasedAt: '2024-08-02',
  cardCount: 398,
  iconUrl: null,
};

describe('fetchSets', () => {
  it('usa el codigo del set como externalId y sigue la paginacion', async () => {
    const pagina1 = {
      data: [{ id: 'uuid-1', code: 'blb', name: 'Bloomburrow', released_at: '2024-08-02', card_count: 398 }],
      has_more: true,
      next_page: 'https://api.scryfall.com/sets?page=2',
    };
    const pagina2 = {
      data: [{ id: 'uuid-2', code: 'dsk', name: 'Duskmourn', released_at: '2024-09-27', card_count: 419 }],
      has_more: false,
    };
    let n = 0;
    const adapter = new ScryfallAdapter(http({ json: () => (n++ === 0 ? pagina1 : pagina2) }));

    const sets = await collect(adapter.fetchSets());
    expect(sets.map((s) => s.externalId)).toEqual(['blb', 'dsk']);
    expect(sets[0]!.name).toBe('Bloomburrow');
  });

  it('tolera un set sin released_at', async () => {
    const adapter = new ScryfallAdapter(
      http({ json: () => ({ data: [{ id: 'x', code: 'xxx', name: 'Sin fecha', card_count: 1 }], has_more: false }) }),
    );
    const [set] = await collect(adapter.fetchSets());
    expect(set!.releasedAt).toBeNull();
  });
});

describe('mapeo de carta normal', () => {
  it('traduce un Bosque a dominio', async () => {
    const adapter = new ScryfallAdapter(http({ json: () => ({ data: [BOSQUE], has_more: false }) }));
    const [print] = await collect(adapter.fetchPrints(SET_BLB));

    expect(print!.externalId).toBe(BOSQUE.id);
    expect(print!.setExternalId).toBe('blb');
    expect(print!.collectorNumber).toBe('280');
    expect(print!.rarityCode).toBe('common');
    expect(print!.finishes).toEqual(['nonfoil', 'foil']);
    expect(print!.card.oracleKey).toBe(BOSQUE.oracle_id);
    expect(print!.card.typeLine).toBe('Basic Land - Forest');
  });

  it('OMITE colors cuando la carta es incolora (contrato del indice multivaluado)', async () => {
    const adapter = new ScryfallAdapter(http({ json: () => ({ data: [BOSQUE], has_more: false }) }));
    const [print] = await collect(adapter.fetchPrints(SET_BLB));
    const gd = print!.card.gameData;

    // colors llega como [] y debe omitirse: una carta incolora no pertenece al
    // indice de colores. color_identity si tiene contenido y se conserva.
    expect('colors' in gd).toBe(false);
    expect(gd.color_identity).toEqual(['G']);
    // mana_cost "" tampoco se persiste como cadena vacia.
    expect('mana_cost' in gd).toBe(false);
    expect(gd.cmc).toBe(0);
  });
});

describe('cartas de doble cara', () => {
  it('recupera de card_faces lo que no esta arriba', async () => {
    const adapter = new ScryfallAdapter(http({ json: () => ({ data: [TRANSFORM], has_more: false }) }));
    const [print] = await collect(adapter.fetchPrints(SET_BLB));

    expect(print!.imageSourceUrl).toBe('https://cards.scryfall.io/normal/front/a/a/aaaa1111.jpg');
    expect(print!.card.rulesText).toContain('Cara frontal.');
    expect(print!.card.rulesText).toContain('Cara trasera.');
  });

  it('reversible_card: saca el oracleKey de la cara (no hay oracle_id arriba)', async () => {
    const adapter = new ScryfallAdapter(http({ json: () => ({ data: [REVERSIBLE], has_more: false }) }));
    const [print] = await collect(adapter.fetchPrints(SET_BLB));

    // Sin este respaldo la carta se quedaria sin clave conceptual y romperia el
    // NOT NULL de cards.oracle_key.
    expect(print!.card.oracleKey).toBe('61fbaaf2-4286-4e9a-b9cb-aa31262b596a');
    expect(print!.card.oracleKey).not.toBe(REVERSIBLE.id);
  });

  it('oracleKeyOf cae al id solo como ultimo recurso', () => {
    expect(oracleKeyOf({ ...BOSQUE, oracle_id: undefined, card_faces: undefined })).toBe(BOSQUE.id);
  });
});

describe('fetchAllPrints — volcado en streaming', () => {
  it('elige el volcado correcto y lo procesa entero', async () => {
    const catalogo = {
      data: [
        { type: 'oracle_cards', jsonl_download_uri: 'https://data.scryfall.io/oracle.jsonl.gz' },
        { type: 'default_cards', jsonl_download_uri: 'https://data.scryfall.io/default.jsonl.gz' },
      ],
    };
    const adapter = new ScryfallAdapter(
      http({ json: () => catalogo, stream: () => gzStream([BOSQUE, TRANSFORM, REVERSIBLE]) }),
    );

    const prints = await collect(adapter.fetchAllPrints());
    expect(prints).toHaveLength(3);
    expect(prints.map((p) => p.setExternalId)).toEqual(['blb', 'fin', 'snc']);
    expect(adapter.supportsBulk()).toBe(true);
  });

  it('falla con un mensaje util si el volcado pedido no existe', async () => {
    const adapter = new ScryfallAdapter(
      http({ json: () => ({ data: [{ type: 'oracle_cards', jsonl_download_uri: 'x' }] }) }),
      { bulkType: 'no_existe' },
    );
    await expect(collect(adapter.fetchAllPrints())).rejects.toThrow(/no_existe.*oracle_cards/s);
  });

  it('una linea corrupta del volcado no tumba la ingesta', async () => {
    const avisos: IngestWarning[] = [];
    const gz = new Uint8Array(
      gzipSync(Buffer.from([JSON.stringify(BOSQUE), '{roto', JSON.stringify(TRANSFORM)].join('\n'), 'utf8')),
    );
    const adapter = new ScryfallAdapter(
      http({
        json: () => ({ data: [{ type: 'default_cards', jsonl_download_uri: 'u' }] }),
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield gz;
          },
        }),
      }),
      { onWarning: (w) => avisos.push(w) },
    );

    const prints = await collect(adapter.fetchAllPrints());
    expect(prints).toHaveLength(2);
    expect(avisos.some((w) => w.message.includes('JSONL ilegible'))).toBe(true);
  });
});

describe('errores y avisos', () => {
  it('trata el 404 de "busqueda sin resultados" como aviso', async () => {
    const avisos: IngestWarning[] = [];
    const adapter = new ScryfallAdapter(
      http({
        json: () => {
          throw new HttpError(404, 'https://api.scryfall.com/cards/search');
        },
      }),
      { onWarning: (w) => avisos.push(w) },
    );

    expect(await collect(adapter.fetchPrints(SET_BLB))).toEqual([]);
    expect(avisos[0]!.message).toContain('HTTP 404');
  });

  it('propaga un 500: eso si es una averia', async () => {
    const adapter = new ScryfallAdapter(
      http({
        json: () => {
          throw new HttpError(500, 'https://api.scryfall.com/cards/search');
        },
      }),
    );
    await expect(collect(adapter.fetchPrints(SET_BLB))).rejects.toBeInstanceOf(HttpError);
  });

  it('avisa si falta la imagen pero no descarta la carta', async () => {
    const avisos: IngestWarning[] = [];
    const sinImagen: RawCard = { ...BOSQUE, image_uris: undefined };
    const adapter = new ScryfallAdapter(
      http({ json: () => ({ data: [sinImagen], has_more: false }) }),
      { onWarning: (w) => avisos.push(w) },
    );

    const prints = await collect(adapter.fetchPrints(SET_BLB));
    expect(prints).toHaveLength(1);
    expect(prints[0]!.imageSourceUrl).toBeNull();
    expect(avisos[0]!.code).toBe('missing_image');
  });
});

describe('utilidades', () => {
  it('rulesTextOf une las caras', () => {
    expect(rulesTextOf(TRANSFORM)).toBe('Cara frontal.\n//\nCara trasera.');
    expect(rulesTextOf({ ...BOSQUE, oracle_text: undefined, card_faces: undefined })).toBeNull();
  });

  it('imageOf prefiere la de nivel superior', () => {
    expect(imageOf(BOSQUE)).toContain('front/0/0');
    expect(imageOf(TRANSFORM)).toContain('front/a/a');
    expect(imageOf({ ...BOSQUE, image_uris: undefined, card_faces: undefined })).toBeNull();
  });
});
