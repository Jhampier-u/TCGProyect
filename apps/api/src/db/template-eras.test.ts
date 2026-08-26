import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * T-034 - dos formas de romper las plantillas de epoca sin que falle nada.
 *
 * 1. VENTANAS SOLAPADAS. Si dos epocas cubren la misma fecha, la plantilla que
 *    se elige depende del orden en que MySQL devuelva las filas. Funcionaria, y
 *    un dia dejaria de funcionar sin que nadie hubiera tocado nada.
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

const dir = (n: string) => fileURLToPath(new URL(`../../../../db/migrations/${n}`, import.meta.url));

const ERAS = readFileSync(dir('0010_ygo_era_templates.up.sql'), 'utf8');
const MODERNA = readFileSync(dir('0011_ygo_modern_gaps.up.sql'), 'utf8');
const BASE_MODERNA = readFileSync(dir('0006_ygo_modern_booster.up.sql'), 'utf8');
const SEED = readFileSync(dir('0002_seed_games_rarities.sql'), 'utf8');

interface Ventana { desde: string | null; hasta: string | null; nombre: string }

/** Filas del INSERT INTO pack_templates de la 0010. */
function ventanas(): Ventana[] {
  const bloque = /INSERT INTO pack_templates \([^)]*\) VALUES([\s\S]*?);/.exec(ERAS);
  if (!bloque?.[1]) throw new Error('No se encontro el INSERT INTO pack_templates en la 0010');

  const fila = /\(\s*2,\s*NULL,\s*(NULL|'[\d-]+'),\s*(NULL|'[\d-]+'),\s*'([^']+)'/g;
  const salida: Ventana[] = [];
  for (const m of bloque[1].matchAll(fila)) {
    const val = (s: string) => (s === 'NULL' ? null : s.slice(1, -1));
    salida.push({ desde: val(m[1]!), hasta: val(m[2]!), nombre: m[3]! });
  }
  return salida;
}

/**
 * Codigos de rareza de Yu-Gi-Oh! sembrados por una migracion.
 *
 * Solo `game_id = 2`: las plantillas que este test vigila son todas de
 * Yu-Gi-Oh!, y colar aqui las rarezas de los otros dos juegos haria que una
 * errata que casara con una rareza de Magic pasara desapercibida.
 */
function rarezasSembradas(): Set<string> {
  const codigos = new Set<string>();
  for (const sql of [SEED, MODERNA]) {
    for (const m of sql.matchAll(/\(\s*2,\s*'([a-z_]+)',\s*'[^']*',\s*\d+\s*\)/g)) {
      codigos.add(m[1]!);
    }
  }
  return codigos;
}

/** Rarezas nombradas en cualquier `distribution` de las migraciones de YGO. */
function rarezasDeLasPlantillas(): Set<string> {
  const codigos = new Set<string>();
  for (const sql of [ERAS, MODERNA, BASE_MODERNA]) {
    for (const m of sql.matchAll(/"rarity":"([a-z_]+)"/g)) codigos.add(m[1]!);
  }
  return codigos;
}

describe('las ventanas de epoca', () => {
  it('son las tres esperadas', () => {
    expect(ventanas()).toHaveLength(3);
  });

  it('no se solapan entre si', () => {
    const dia = (s: string | null, porDefecto: string) => Date.parse(s ?? porDefecto);
    const rangos = ventanas()
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
    for (const v of ventanas()) {
      if (v.desde && v.hasta) expect(Date.parse(v.desde) <= Date.parse(v.hasta)).toBe(true);
    }
  });
});

describe('las rarezas que las plantillas nombran', () => {
  it('existen todas en el seed', () => {
    const sembradas = rarezasSembradas();
    const huerfanas = [...rarezasDeLasPlantillas()].filter((r) => !sembradas.has(r)).sort();
    expect(huerfanas).toEqual([]);
  });
});
