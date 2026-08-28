import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * T-034 y T-068 - dos formas de romper las plantillas de epoca sin que falle
 * nada.
 *
 * 1. VENTANAS SOLAPADAS. Si dos epocas del MISMO juego cubren la misma fecha, la
 *    plantilla que se elige depende del orden en que MySQL devuelva las filas.
 *    Funcionaria, y un dia dejaria de funcionar sin que nadie hubiera tocado
 *    nada. Entre juegos distintos no importa: `findTemplate` filtra por
 *    `game_id`, asi que la comprobacion se hace por juego.
 *
 * 2. UNA RAREZA QUE NO EXISTE. `pack_slots.distribution` es JSON libre: un
 *    `super_rar` en vez de `super_rare` deja esa entrada MUERTA -- el pool nunca
 *    tendra esa clave -- y el motor se limita a repartir el peso entre las
 *    demas. Sin error, sin aviso, con la fidelidad del sobre alterada.
 *
 * Los dos se comprueban leyendo los ficheros de migracion, que son INMUTABLES
 * una vez publicados. Mismo patron que `seed-drift.test.ts` (T-016): no hace
 * falta base de datos, asi que la comprobacion corre en cada `npm test` y no
 * solo cuando alguien se acuerda de mirar.
 */

const leer = (n: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../db/migrations/${n}`, import.meta.url)), 'utf8');

const SEED = leer('0002_seed_games_rarities.sql');
const YGO_MODERNA_BASE = leer('0006_ygo_modern_booster.up.sql');
const YGO_ERAS = leer('0010_ygo_era_templates.up.sql');
const YGO_MODERNA = leer('0011_ygo_modern_gaps.up.sql');
const PTCG_ERAS = leer('0012_ptcg_era_templates.up.sql');
const PTCG_SWSH = leer('0014_ptcg_swsh_y_huecos.up.sql');
const PTCG_HIST = leer('0018_ptcg_eras_historicas.up.sql');
const MTG_INSERTOS = leer('0016_mtg_special_y_bonus.up.sql');
const MTG_ERAS = leer('0025_mtg_epocas_de_sobre.up.sql');

interface Juego {
  id: number;
  nombre: string;
  /** Migraciones que insertan plantillas con ventana. */
  ventanasEn: string[];
  /** Migraciones cuyas `distribution` hay que revisar. */
  plantillasEn: string[];
  /** Migraciones que siembran rarezas de este juego. */
  siembrasEn: string[];
  ventanasEsperadas: number;
}

const JUEGOS: Juego[] = [
  {
    // Magic no estuvo aqui hasta S029, y no por descuido: no TENIA ventanas.
    // Una sola plantilla cubria de 1993 a 2026, asi que no habia solape posible
    // ni epoca que comprobar. En cuanto la 0025 le dio sus tres epocas, la
    // comprobacion pasa a hacer falta -- que es exactamente cuando se anade.
    id: 1,
    nombre: 'Magic',
    ventanasEn: [MTG_ERAS],
    // La 0003 NO entra, igual que no entra para los otros dos juegos: siembra
    // las plantillas de los tres a la vez y el lector de `distribution` no sabe
    // de quien es cada una, asi que meterla haria que las rarezas de Pokemon
    // contaran como huerfanas de Magic.
    plantillasEn: [MTG_ERAS, MTG_INSERTOS],
    siembrasEn: [SEED],
    ventanasEsperadas: 3,
  },
  {
    id: 2,
    nombre: 'Yu-Gi-Oh!',
    ventanasEn: [YGO_ERAS],
    plantillasEn: [YGO_ERAS, YGO_MODERNA, YGO_MODERNA_BASE],
    siembrasEn: [SEED, YGO_MODERNA],
    ventanasEsperadas: 3,
  },
  {
    id: 3,
    nombre: 'Pokemon',
    ventanasEn: [PTCG_ERAS, PTCG_SWSH, PTCG_HIST],
    plantillasEn: [PTCG_ERAS, PTCG_SWSH, PTCG_HIST],
    siembrasEn: [SEED],
    ventanasEsperadas: 9,
  },
];

interface Ventana { desde: string | null; hasta: string | null; nombre: string }

/**
 * Las ventanas de un juego, tal como quedan tras aplicar sus migraciones.
 *
 * NO BASTA CON LEER LOS `INSERT`. Una migracion posterior puede CORREGIR la
 * ventana de una anterior, y entonces el fichero que la declaro deja de
 * describir la realidad: la 0018 le puso su inicio real a `Booster Sword &
 * Shield`, que la 0014 habia dejado abierto. Leyendo solo los INSERT, este test
 * veia un solape que en la base no existe -- y fallo, que es justo lo que
 * tenia que hacer: aviso de que el modelo se le habia quedado corto.
 */
function ventanas(juego: Juego): Ventana[] {
  const salida: Ventana[] = [];

  for (const sql of juego.ventanasEn) {
    const bloque = /INSERT INTO pack_templates \([^)]*\) VALUES([\s\S]*?);/.exec(sql);
    if (!bloque?.[1]) throw new Error(`No se encontro el INSERT INTO pack_templates de ${juego.nombre}`);

    const fila = new RegExp(
      String.raw`\(\s*${juego.id},\s*NULL,\s*(NULL|'[\d-]+'),\s*(NULL|'[\d-]+'),\s*'([^']+)'`,
      'g',
    );
    for (const m of bloque[1].matchAll(fila)) {
      const val = (s: string) => (s === 'NULL' ? null : s.slice(1, -1));
      salida.push({ desde: val(m[1]!), hasta: val(m[2]!), nombre: m[3]! });
    }
  }

  // Y despues las correcciones, en el orden en que se aplicarian.
  const correccion = new RegExp(
    String.raw`UPDATE pack_templates\s+SET valid_from = '([\d-]+)'\s+WHERE game_id = ${juego.id} AND valid_to = '([\d-]+)'`,
    'g',
  );
  for (const sql of juego.ventanasEn) {
    for (const m of sql.matchAll(correccion)) {
      const objetivo = salida.find((v) => v.hasta === m[2]);
      if (objetivo) objetivo.desde = m[1]!;
    }
  }

  return salida;
}

/**
 * Codigos de rareza sembrados para un juego.
 *
 * Se filtra por `game_id`: colar aqui las rarezas de los otros dos juegos haria
 * que una errata que casara con una rareza de Magic pasara desapercibida.
 */
function rarezasSembradas(juego: Juego): Set<string> {
  const codigos = new Set<string>();
  const fila = new RegExp(String.raw`\(\s*${juego.id},\s*'([a-z_]+)',\s*'[^']*',\s*\d+\s*\)`, 'g');
  for (const sql of juego.siembrasEn) {
    for (const m of sql.matchAll(fila)) codigos.add(m[1]!);
  }
  return codigos;
}

/** Rarezas nombradas en cualquier `distribution` de las migraciones del juego. */
function rarezasDeLasPlantillas(juego: Juego): Set<string> {
  const codigos = new Set<string>();
  for (const sql of juego.plantillasEn) {
    for (const m of sql.matchAll(/"rarity":"([a-z_]+)"/g)) codigos.add(m[1]!);
  }
  return codigos;
}

describe.each(JUEGOS)('las ventanas de epoca de $nombre', (juego) => {
  it('son las esperadas', () => {
    expect(ventanas(juego)).toHaveLength(juego.ventanasEsperadas);
  });

  it('no se solapan entre si', () => {
    const dia = (s: string | null, porDefecto: string) => Date.parse(s ?? porDefecto);
    const rangos = ventanas(juego)
      .map((v) => ({ ...v, d: dia(v.desde, '1900-01-01'), h: dia(v.hasta, '2999-12-31') }))
      .sort((a, b) => a.d - b.d);

    for (let i = 1; i < rangos.length; i += 1) {
      const previa = rangos[i - 1]!;
      const actual = rangos[i]!;
      expect(
        actual.d > previa.h,
        `"${actual.nombre}" empieza antes de que acabe "${previa.nombre}"`,
      ).toBe(true);
    }
  });

  it('ninguna deja la fecha de fin por delante de la de inicio', () => {
    // Una ventana de un solo dia SI es valida: `Booster Black Bolt / White
    // Flare` cubre dos sets gemelos publicados el mismo dia.
    for (const v of ventanas(juego)) {
      if (v.desde && v.hasta) expect(Date.parse(v.desde) <= Date.parse(v.hasta)).toBe(true);
    }
  });

  it('toda rareza que nombran existe en el seed', () => {
    const sembradas = rarezasSembradas(juego);
    const huerfanas = [...rarezasDeLasPlantillas(juego)].filter((r) => !sembradas.has(r)).sort();
    expect(huerfanas).toEqual([]);
  });
});
