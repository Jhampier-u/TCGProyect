import { describe, it, expect } from 'vitest';
import type { DomainPrint, DomainSet, IngestWarning } from '@tcg/shared';
import { YgoprodeckAdapter, buildPrintExternalId, collectorNumberFrom } from './ygoprodeck-adapter.js';
import { HttpError } from '../../http/errors.js';
import type { JsonFetcher, RawCard, RawSet } from './types.js';

/**
 * Las fixtures NO son inventadas: reproducen respuestas reales de YGOPRODeck
 * capturadas el 2026-08-25, incluidos sus defectos.
 */

function stubClient(responder: (url: string) => unknown): JsonFetcher {
  return { json: async <T>(url: string) => responder(url) as T };
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of it) out.push(item);
  return out;
}

const SET: DomainSet = {
  game: 'YGO',
  externalId: 'Supreme Darkness',
  code: 'SUDA',
  name: 'Supreme Darkness',
  releasedAt: '2025-01-16',
  cardCount: 101,
  iconUrl: null,
};

/** Caso real: A Bao A Qu sale en Supreme Darkness en DOS rarezas con el MISMO set_code. */
const CARTA_DOBLE_RAREZA: RawCard = {
  id: 4731783,
  name: 'A Bao A Qu, the Lightless Shadow',
  type: 'Link Monster',
  humanReadableCardType: 'Link Effect Monster',
  frameType: 'link',
  desc: '2+ monstruos...',
  race: 'Fiend',
  attribute: 'DARK',
  atk: 2800,
  def: null, // los monstruos Link no tienen DEF
  level: null,
  linkval: 4,
  linkmarkers: ['Left', 'Right', 'Bottom-Left', 'Bottom-Right'],
  card_sets: [
    // Impresion de OTRO set: debe ignorarse al ingestar Supreme Darkness.
    { set_name: 'Magnificent Monsters', set_code: 'MAMO-EN038', set_rarity: 'Secret Rare' },
    { set_name: 'Supreme Darkness', set_code: 'SUDA-EN049', set_rarity: 'Quarter Century Secret Rare' },
    { set_name: 'Supreme Darkness', set_code: 'SUDA-EN049', set_rarity: 'Secret Rare' },
  ],
  card_images: [{ id: 4731783, image_url: 'https://images.ygoprodeck.com/images/cards/4731783.jpg' }],
};

/** Caso real: ATK y DEF variables ("?"), el que abortaba el INSERT. */
const SLIFER: RawCard = {
  id: 10000020,
  name: 'Slifer the Sky Dragon',
  type: 'Effect Monster',
  desc: 'ATK/DEF variable.',
  race: 'Divine-Beast',
  attribute: 'DIVINE',
  atk: '?',
  def: '?',
  level: 10,
  banlist_info: { ban_tcg: 'Limited' },
  card_sets: [{ set_name: 'Supreme Darkness', set_code: 'SUDA-EN001', set_rarity: 'Ultra Rare' }],
  card_images: [{ id: 10000020, image_url: 'https://images.ygoprodeck.com/images/cards/10000020.jpg' }],
};

/** Casos reales de rareza sucia, procedentes de otros sets del catalogo. */
const CARTA_SUCIA: RawCard = {
  id: 9999901,
  name: 'Carta con rareza corrupta',
  type: 'Normal Monster',
  atk: 1000,
  def: 1000,
  level: 4,
  card_sets: [
    { set_name: 'Supreme Darkness', set_code: 'SUDA-EN100', set_rarity: 'PLatinum Secret Rare' },
    { set_name: 'Supreme Darkness', set_code: 'SUDA-EN101', set_rarity: '2' },
  ],
  card_images: [{ id: 9999901, image_url: 'https://images.ygoprodeck.com/images/cards/9999901.jpg' }],
};

function makeAdapter(cards: RawCard[], warnings: IngestWarning[] = []) {
  const client = stubClient(() => ({ data: cards }));
  return new YgoprodeckAdapter(client, { onWarning: (w) => warnings.push(w) });
}

describe('fetchSets', () => {
  it('usa set_name como externalId, NO set_code', async () => {
    // set_code se repite en 142 casos reales: "JUMP" lo comparten 70 sets.
    // Usarlo como clave natural colapsaria esos 70 en una sola fila.
    const raw: RawSet[] = [
      { set_name: 'Limited Edition 1', set_code: 'JUMP', num_of_cards: 5, tcg_date: '2002-11-01' },
      { set_name: 'Shonen Jump 2007 subscription bonus', set_code: 'JUMP', num_of_cards: 1, tcg_date: '2007-01-01' },
    ];
    const adapter = new YgoprodeckAdapter(stubClient(() => raw));
    const sets = await collect(adapter.fetchSets());

    expect(sets.map((s) => s.externalId)).toEqual([
      'Limited Edition 1',
      'Shonen Jump 2007 subscription bonus',
    ]);
    // Los dos comparten codigo pero son sets distintos.
    expect(new Set(sets.map((s) => s.code)).size).toBe(1);
    expect(new Set(sets.map((s) => s.externalId)).size).toBe(2);
  });

  it('tolera sets sin tcg_date (hay 2 reales)', async () => {
    const raw: RawSet[] = [{ set_name: 'Nike collaboration cards', set_code: 'NIKE', num_of_cards: 1 }];
    const adapter = new YgoprodeckAdapter(stubClient(() => raw));
    const [set] = await collect(adapter.fetchSets());
    expect(set!.releasedAt).toBeNull();
  });
});

describe('fetchPrints — filtrado por set', () => {
  it('IGNORA las impresiones de otros sets que vienen en la misma respuesta', async () => {
    const prints = await collect(makeAdapter([CARTA_DOBLE_RAREZA]).fetchPrints(SET));
    // La impresion de "Magnificent Monsters" no debe colarse.
    expect(prints.every((p) => p.setExternalId === 'Supreme Darkness')).toBe(true);
    expect(prints.some((p) => p.externalId.startsWith('MAMO'))).toBe(false);
    expect(prints).toHaveLength(2);
  });
});

describe('fetchPrints — set_code duplicado (el bug que habria perdido cartas)', () => {
  it('genera externalId distintos para la misma carta en dos rarezas', async () => {
    const prints = await collect(makeAdapter([CARTA_DOBLE_RAREZA]).fetchPrints(SET));

    expect(prints).toHaveLength(2);
    expect(prints[0]!.externalId).not.toBe(prints[1]!.externalId);
    expect(prints.map((p) => p.externalId).sort()).toEqual([
      'SUDA-EN049::quarter_century_secret_rare',
      'SUDA-EN049::secret_rare',
    ]);
    // Ambas conservan el mismo numero de coleccionista, que es correcto.
    expect(prints.every((p) => p.collectorNumber === '049')).toBe(true);
  });

  it('las dos impresiones apuntan a la MISMA carta conceptual', async () => {
    const prints = await collect(makeAdapter([CARTA_DOBLE_RAREZA]).fetchPrints(SET));
    expect(prints[0]!.card.oracleKey).toBe(prints[1]!.card.oracleKey);
    expect(prints[0]!.card.oracleKey).toBe('4731783');
  });
});

describe('fetchPrints — normalizacion de game_data', () => {
  it('OMITE atk y def cuando la API devuelve "?" (Slifer)', async () => {
    const [print] = await collect(makeAdapter([SLIFER]).fetchPrints(SET));
    const gd = print!.card.gameData;
    expect('atk' in gd).toBe(false);
    expect('def' in gd).toBe(false);
    expect(gd.level).toBe(10);
    expect(gd.banlist_info).toEqual({ ban_tcg: 'Limited' });
  });

  it('OMITE def cuando es null (monstruos Link) pero conserva link_val y marcadores', async () => {
    const [print] = await collect(makeAdapter([CARTA_DOBLE_RAREZA]).fetchPrints(SET));
    const gd = print!.card.gameData;
    expect('def' in gd).toBe(false);
    expect('level' in gd).toBe(false);
    expect(gd.atk).toBe(2800);
    expect(gd.link_val).toBe(4);
    expect(gd.link_markers).toEqual(['Left', 'Right', 'Bottom-Left', 'Bottom-Right']);
  });

  it('no escribe banlist_info vacio', async () => {
    const [print] = await collect(makeAdapter([CARTA_DOBLE_RAREZA]).fetchPrints(SET));
    expect('banlist_info' in print!.card.gameData).toBe(false);
  });
});

describe('fetchPrints — rarezas sucias (P-007)', () => {
  it('RECUPERA la errata "PLatinum Secret Rare" sin crear una rareza fantasma', async () => {
    const warnings: IngestWarning[] = [];
    const prints = await collect(makeAdapter([CARTA_SUCIA], warnings).fetchPrints(SET));
    const platinum = prints.find((p) => p.rarityLabel === 'PLatinum Secret Rare');

    expect(platinum!.rarityCode).toBe('platinum_secret_rare');
    // Se recupera sin avisar: no hubo perdida de informacion.
    expect(warnings.some((w) => w.subject.includes('SUDA-EN100'))).toBe(false);
  });

  it('NO PIERDE la carta con rareza "2": cae a common y avisa', async () => {
    const warnings: IngestWarning[] = [];
    const prints = await collect(makeAdapter([CARTA_SUCIA], warnings).fetchPrints(SET));
    const basura = prints.find((p) => p.rarityLabel === '2');

    expect(basura).toBeDefined();
    expect(basura!.rarityCode).toBe('common');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.code).toBe('invalid_rarity');
    expect(warnings[0]!.message).toContain('"2"');
  });

  it('conserva SIEMPRE la cadena literal en rarityLabel para poder auditar', async () => {
    const prints = await collect(makeAdapter([CARTA_SUCIA]).fetchPrints(SET));
    expect(prints.map((p) => p.rarityLabel)).toEqual(['PLatinum Secret Rare', '2']);
  });
});

describe('fetchPrints — acabado derivado de la rareza', () => {
  it('marca foil las rarezas Secret/Ultra y nonfoil las Common/Rare', async () => {
    const comun: RawCard = {
      ...SLIFER,
      id: 1,
      card_sets: [
        { set_name: 'Supreme Darkness', set_code: 'SUDA-EN010', set_rarity: 'Common' },
        { set_name: 'Supreme Darkness', set_code: 'SUDA-EN011', set_rarity: 'Rare' },
        { set_name: 'Supreme Darkness', set_code: 'SUDA-EN012', set_rarity: 'Ultra Rare' },
      ],
    };
    const prints = await collect(makeAdapter([comun]).fetchPrints(SET));
    expect(prints.map((p) => p.finishes[0])).toEqual(['nonfoil', 'nonfoil', 'foil']);
  });
});

describe('fetchPrints — errores', () => {
  it('trata el 400 de "set sin cartas" como aviso, no como fallo', async () => {
    const warnings: IngestWarning[] = [];
    const client: JsonFetcher = {
      json: async () => {
        throw new HttpError(400, 'https://db.ygoprodeck.com/api/v7/cardinfo.php');
      },
    };
    const adapter = new YgoprodeckAdapter(client, { onWarning: (w) => warnings.push(w) });

    const prints = await collect(adapter.fetchPrints(SET));
    expect(prints).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('HTTP 400');
  });

  it('propaga cualquier otro error: un 500 SI es una averia', async () => {
    const client: JsonFetcher = {
      json: async () => {
        throw new HttpError(500, 'https://db.ygoprodeck.com/api/v7/cardinfo.php');
      },
    };
    const adapter = new YgoprodeckAdapter(client);
    await expect(collect(adapter.fetchPrints(SET))).rejects.toBeInstanceOf(HttpError);
  });

  it('avisa si una carta no trae imagen, pero la ingesta continua', async () => {
    const warnings: IngestWarning[] = [];
    const sinImagen: RawCard = { ...SLIFER, card_images: [] };
    const prints = await collect(makeAdapter([sinImagen], warnings).fetchPrints(SET));

    expect(prints).toHaveLength(1);
    expect(prints[0]!.imageSourceUrl).toBeNull();
    expect(warnings[0]!.code).toBe('missing_image');
  });
});

describe('utilidades', () => {
  it('collectorNumberFrom extrae el numero final', () => {
    expect(collectorNumberFrom('SUDA-EN049')).toBe('049');
    expect(collectorNumberFrom('LOB-001')).toBe('001');
    expect(collectorNumberFrom('JUMP-EN1')).toBe('1');
    expect(collectorNumberFrom('SIN-NUMERO')).toBe('SIN-NUMERO');
  });

  it('buildPrintExternalId respeta el VARCHAR(64) de la columna', () => {
    const largo = buildPrintExternalId('X'.repeat(60), 'quarter_century_secret_rare');
    expect(largo.length).toBeLessThanOrEqual(64);
  });
});

describe('contrato del dominio', () => {
  it('ninguna impresion expone conceptos crudos de YGOPRODeck', async () => {
    const prints: DomainPrint<'YGO'>[] = await collect(makeAdapter([SLIFER]).fetchPrints(SET));
    const print = prints[0]!;
    // La forma es la del dominio, no la de la API.
    expect(Object.keys(print).sort()).toEqual([
      'card',
      'collectorNumber',
      'externalId',
      'finishes',
      'imageSourceUrl',
      'rarityCode',
      'rarityLabel',
      'setExternalId',
    ]);
    expect(print.card.game).toBe('YGO');
  });
});
