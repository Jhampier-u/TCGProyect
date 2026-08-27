import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clasificarSet, lineaDeProducto, CARTAS_POR_SOBRE } from './openable.js';
import { GAME_IDS, type GameCode } from '@tcg/shared';

/** Nombres reales del catalogo, no inventados. */
const SOBRES_DE_VERDAD = [
  'Ignition Assault',
  'Tactical Evolution',
  'Ancient Sanctuary',
  'Toon Chaos',
  'Hidden Arsenal',
  'Legend of Blue Eyes White Dragon',
  'Breakers of Shadow',
  "Pharaoh's Servant (25th Anniversary Edition)",
  'GX Next Generation',
  'War of the Giants Reinforcements',
];

/** Fecha fija: un test que depende del reloj falla solo algun dia. */
const HOY = '2026-08-26';

const NO_SON_SOBRES = [
  'Legendary Arc-V Decks',
  'Structure Deck: Shaddoll Showdown',
  'Starter Deck: Yugi',
  'Yu-Gi-Oh! ARC-V Volume 2 promotional card',
  'Mattel Action Figure promotional cards: Series 3',
  'Shonen Jump Championship 2004 Prize Card',
  'Duelist League Series 1 participation cards',
  'Demo Deck 2015',
  "Yugi's Collector Box",
  'Duelist Revolution Sneak Peek Participation Card',
  'Speed Duel Starter Decks: Twisted Nightmares',
  // Pokemon: subconjuntos de galeria, no productos (medido: 30, 30 y 70
  // impresiones y ni una comun entre los tres).
  'Lost Origin Trainer Gallery',
  'Silver Tempest Trainer Gallery',
  'Crown Zenith Galarian Gallery',
  'Hidden Fates Shiny Vault',
  'Shining Fates Shiny Vault',
  // Bolsas de promocionales. `Scarlet & Violet Black Star Promos` son 200
  // impresiones de rareza `promo`; `Magic Online Promos`, 3094 cartas.
  'Scarlet & Violet Black Star Promos',
  'Magic Online Promos',
  'War of the Spark Promos',
];

describe('clasificarSet (T-069)', () => {
  it('deja abribles los sets de sobres de verdad', () => {
    for (const name of SOBRES_DE_VERDAD) {
      const r = clasificarSet({ game: 'YGO', name, code: 'XX', cardCount: 100, releasedAt: '2020-01-01' }, HOY);
      expect(r.abrible, `"${name}" deberia seguir siendo abrible: ${r.motivo ?? ''}`).toBe(true);
    }
  });

  it('descarta los productos que no son de sobres', () => {
    for (const name of NO_SON_SOBRES) {
      const r = clasificarSet({ game: 'YGO', name, code: 'XX', cardCount: 100, releasedAt: '2020-01-01' }, HOY);
      expect(r.abrible, `"${name}" no es un producto de sobres`).toBe(false);
      expect(r.motivo).toBeTruthy();
    }
  });

  it('descarta lo que no da ni para un sobre, sin mirar el nombre', () => {
    // Aritmetica, no heuristica: un sobre de Yu-Gi-Oh! son 9 cartas. 520 sets
    // del catalogo declaran menos, y 417 en Magic sobre 14.
    expect(clasificarSet({ game: 'YGO', name: 'Un Set Cualquiera', code: 'XX', cardCount: 8, releasedAt: '2020-01-01' }, HOY).abrible).toBe(false);
    expect(clasificarSet({ game: 'YGO', name: 'Un Set Cualquiera', code: 'XX', cardCount: 9, releasedAt: '2020-01-01' }, HOY).abrible).toBe(true);
    expect(clasificarSet({ game: 'MTG', name: 'Stardates', code: 'XX', cardCount: 1, releasedAt: '2020-01-01' }, HOY).abrible).toBe(false);
    expect(clasificarSet({ game: 'PTCG', name: 'Un Set Cualquiera', code: 'XX', cardCount: 10, releasedAt: '2020-01-01' }, HOY).abrible).toBe(true);
  });

  it('el motivo dice cual de las dos reglas ha sido', () => {
    expect(clasificarSet({ game: 'YGO', name: 'Starter Deck: Kaiba', code: 'XX', cardCount: 50, releasedAt: '2020-01-01' }, HOY).motivo)
      .toContain('Starter Deck');
    expect(clasificarSet({ game: 'YGO', name: 'Un Set Cualquiera', code: 'XX', cardCount: 3, releasedAt: '2020-01-01' }, HOY).motivo)
      .toContain('9');
  });

  it('NO descarta el set padre de una galeria', () => {
    // `Crown Zenith` es un booster de verdad; `Crown Zenith Galarian Gallery`
    // es su subconjunto. Un patron que se llevara los dos por delante quitaria
    // del catalogo un set de 160 cartas.
    expect(
      clasificarSet({ game: 'PTCG', name: 'Crown Zenith', code: 'XX', cardCount: 160, releasedAt: '2023-01-20' }, HOY)
        .abrible,
    ).toBe(true);
    expect(
      clasificarSet({ game: 'PTCG', name: 'Lost Origin', code: 'XX', cardCount: 196, releasedAt: '2022-09-09' }, HOY)
        .abrible,
    ).toBe(true);
    // `Hidden Fates` es un booster; `Hidden Fates Shiny Vault`, su boveda.
    expect(
      clasificarSet({ game: 'PTCG', name: 'Hidden Fates', code: 'XX', cardCount: 69, releasedAt: '2019-08-23' }, HOY)
        .abrible,
    ).toBe(true);
  });

  it('descarta lo que todavia NO HA SALIDO (T-067)', () => {
    // Medido: `Magnificent Maestros` sale dentro de 78 dias, el origen declara
    // 24 cartas y el catalogo tiene 66 impresiones -- 24 ultra, 24 starlight y
    // 18 grand master. No es un producto raro: es un set a medio revelar, del
    // que solo se han anunciado los tratamientos premium. Sus comunes llegaran.
    //
    // Abrirlo hoy entrega 8,98 ultra rare por sobre, medido sobre 200 sobres.
    expect(
      clasificarSet({ game: 'YGO', name: 'Magnificent Maestros', code: 'XX', cardCount: 24, releasedAt: '2026-11-12' }, HOY)
        .abrible,
    ).toBe(false);
    expect(
      clasificarSet({ game: 'YGO', name: 'Eternity Code', code: 'XX', cardCount: 105, releasedAt: '2020-04-30' }, HOY)
        .abrible,
    ).toBe(true);
  });

  it('el dia de salida YA cuenta como salido', () => {
    // Un `<` en vez de un `<=` esconderia el set justo el dia que sale.
    expect(
      clasificarSet({ game: 'YGO', name: 'Un Set', code: 'XX', cardCount: 100, releasedAt: HOY }, HOY).abrible,
    ).toBe(true);
  });

  it('un set sin fecha de salida NO se descarta', () => {
    // Muchos promocionales antiguos no la traen. Ante la duda, abrible: los
    // otros dos filtros siguen aplicandose.
    expect(
      clasificarSet({ game: 'YGO', name: 'Un Set', code: 'XX', cardCount: 100, releasedAt: null }, HOY).abrible,
    ).toBe(true);
  });

  it('un cardCount desconocido no descarta el set', () => {
    // La API puede no declararlo. Ante la duda, abrible: equivocarse hacia "no
    // abrible" hace desaparecer contenido real sin que nadie se entere.
    expect(clasificarSet({ game: 'YGO', name: 'Un Set Cualquiera', code: 'XX', cardCount: 0, releasedAt: '2020-01-01' }, HOY).abrible).toBe(true);
  });
});

describe('CARTAS_POR_SOBRE no puede desviarse del seed', () => {
  it('coincide con el `card_count` de las plantillas por defecto de la 0003', () => {
    // Misma familia que el test de deriva de T-016. Si alguien cambia el tamano
    // de un sobre en la migracion y no aqui, sets legitimos empezarian a
    // desaparecer del catalogo -- o al reves -- sin un solo error.
    const sql = readFileSync(
      fileURLToPath(new URL('../../../../db/migrations/0003_seed_pack_templates.sql', import.meta.url)),
      'utf8',
    );

    const delSeed = new Map<number, number>();
    for (const m of sql.matchAll(/\(\s*\d+,\s*(\d+),\s*NULL,\s*'[^']*',\s*(\d+),\s*1\s*\)/g)) {
      delSeed.set(Number(m[1]), Number(m[2]));
    }

    expect(delSeed.size).toBe(3);
    for (const [game, cartas] of Object.entries(CARTAS_POR_SOBRE)) {
      expect(delSeed.get(GAME_IDS[game as GameCode]), `${game} no coincide con el seed`).toBe(cartas);
    }
  });
});

describe('lineaDeProducto (T-080)', () => {
  it('reconoce las seis lineas por nombres reales del catalogo', () => {
    const casos: Array<[string, string]> = [
      ['Duel Terminal 5a', 'duel_terminal'],
      ['Hidden Arsenal: Chapter 1', 'duel_terminal'],
      ['Gold Series 4: Pyramids Edition', 'gold_series'],
      ['Premium Gold: Return of the Bling', 'gold_series'],
      ['Maximum Gold: El Dorado', 'gold_series'],
      ['Battle Pack 2: War of the Giants', 'battle_pack'],
      ['Star Pack ARC-V', 'battle_pack'],
      ['War of the Giants: Round 2', 'battle_pack'],
      ['2014 Mega-Tin Mega Pack', 'mega_pack'],
      ['2025 Mega-Pack Tin', 'mega_pack'],
      ['25th Anniversary Rarity Collection II', 'rarity_collection'],
      ['Quarter Century Bonanza', 'rarity_collection'],
      ['Legendary Duelists: Rage of Ra', 'legendary_duelists'],
      ['Legendary Duelists', 'legendary_duelists'],
    ];
    for (const [nombre, linea] of casos) {
      expect(lineaDeProducto('YGO', nombre), nombre).toBe(linea);
    }
  });

  it('NO se lleva por delante los Core Booster que se le parecen', () => {
    // Los tres los cazaba un prefijo de codigo, y son sets de sobres normales.
    // Por eso la clasificacion es por NOMBRE: medido, no supuesto.
    for (const nombre of [
      'Burst Protocol',            // BPRO, lo cazaba /^BP/
      'Legacy of Destruction',     // LEDE, lo cazaba /^LED/
      'Legendary Dragon Decks',    // LEDD, idem
      "McDonald's Promotional Cards", // MP1, lo cazaba /^MP1/
      'Battles of Legend: Crystal Revenge',
      'Maze of Millennia',
    ]) {
      expect(lineaDeProducto('YGO', nombre), nombre).toBeNull();
    }
  });

  it('el codigo desempata donde el nombre no puede (T-082)', () => {
    // `2019 Gold Sarcophagus Tin` es la LATA (14 cartas promocionales) y
    // `2019 Gold Sarcophagus Tin Mega Pack` el sobre que lleva dentro (270).
    // Por nombre no se separan; por codigo si.
    expect(
      clasificarSet({ game: 'YGO', name: '2019 Gold Sarcophagus Tin', code: 'TN19', cardCount: 14, releasedAt: '2019-08-29' }, HOY)
        .abrible,
    ).toBe(false);
    expect(
      clasificarSet({ game: 'YGO', name: '2019 Gold Sarcophagus Tin Mega Pack', code: 'MP19', cardCount: 270, releasedAt: '2019-08-29' }, HOY)
        .abrible,
    ).toBe(true);
    // Y los Mega Pack que no llevan "Mega Pack" en el nombre se reconocen igual.
    expect(lineaDeProducto('YGO', '2021 Tin of Ancient Battles', 'MP21')).toBe('mega_pack');
    expect(lineaDeProducto('YGO', '25th Anniversary Tin: Dueling Mirrors', 'MP24')).toBe('mega_pack');
    // `MP1` son las promocionales de McDonald's de 2002: DOS digitos, no uno.
    expect(lineaDeProducto('YGO', "McDonald's Promotional Cards", 'MP1')).toBeNull();
  });

  it('solo aplica a Yu-Gi-Oh!', () => {
    // Magic y Pokemon cambian de estructura por EPOCA, y eso ya lo cubre la
    // ventana de fechas. Buscar lineas ahi seria inventarse un problema.
    expect(lineaDeProducto('MTG', 'Battle Pack: Epic Dawn')).toBeNull();
    expect(lineaDeProducto('PTCG', 'Gold Series')).toBeNull();
  });
});
