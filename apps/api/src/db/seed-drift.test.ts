import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAME_CODES, GAME_IDS, GAME_NAMES, GAME_SOURCE_API } from '@tcg/shared';

/**
 * T-016 — nada verificaba que `GAME_IDS` y el seed SQL dijeran lo mismo.
 *
 * La correspondencia 1=MTG, 2=YGO, 3=PTCG vive en DOS sitios: `packages/shared`
 * y `db/migrations/0002_seed_games_rarities.sql`. Los ids no son
 * autoincrementales, son constantes del dominio, y todo el SQL del proyecto los
 * usa via `GAME_IDS[game]`.
 *
 * Si alguien cambiara uno sin el otro, no fallaria nada al arrancar: las
 * consultas seguirian ejecutandose contra el game_id equivocado y devolverian
 * las cartas de otro juego. Es la familia de fallos que este proyecto ya conoce
 * — algo que no cuadra y no lo dice nadie.
 *
 * El test lee el fichero de migracion, que es INMUTABLE una vez publicado, y lo
 * compara con las constantes.
 */

const SEED = fileURLToPath(
  new URL('../../../../db/migrations/0002_seed_games_rarities.sql', import.meta.url),
);

interface FilaSeed {
  id: number;
  code: string;
  name: string;
  sourceApi: string;
}

/** Filas del `INSERT INTO games`, tal como estan escritas en el SQL. */
function leerSeedDeGames(): FilaSeed[] {
  const sql = readFileSync(SEED, 'utf8');
  const bloque = /INSERT INTO games \([^)]*\) VALUES([\s\S]*?);/.exec(sql);
  if (!bloque) throw new Error('No se encontro el INSERT INTO games en el seed');

  const filas: FilaSeed[] = [];
  const linea = /\(\s*(\d+)\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = linea.exec(bloque[1]!)) !== null) {
    filas.push({ id: Number(m[1]), code: m[2]!, name: m[3]!, sourceApi: m[4]! });
  }
  return filas;
}

describe('T-016: GAME_IDS y el seed SQL no pueden divergir', () => {
  const seed = leerSeedDeGames();

  it('el seed tiene exactamente los tres juegos', () => {
    expect(seed).toHaveLength(GAME_CODES.length);
    expect(seed.map((f) => f.code).sort()).toEqual([...GAME_CODES].sort());
  });

  it('cada codigo tiene el MISMO id en los dos sitios', () => {
    for (const fila of seed) {
      expect(GAME_IDS[fila.code as keyof typeof GAME_IDS], `id de ${fila.code}`).toBe(fila.id);
    }
  });

  it('los nombres y las APIs de origen tambien coinciden', () => {
    for (const fila of seed) {
      const code = fila.code as keyof typeof GAME_IDS;
      expect(GAME_NAMES[code], `nombre de ${fila.code}`).toBe(fila.name);
      expect(GAME_SOURCE_API[code], `origen de ${fila.code}`).toBe(fila.sourceApi);
    }
  });

  it('el test lee el seed de verdad, no una cadena vacia', () => {
    // Sin esto, un fichero movido de sitio o una regex que deja de casar harian
    // que los tres tests de arriba pasaran sobre una lista vacia. Es la leccion
    // de P-022: un test que no ejercita el caso da confianza falsa.
    expect(seed.length).toBeGreaterThan(0);
    expect(seed.find((f) => f.code === 'MTG')?.id).toBe(1);
  });
});
