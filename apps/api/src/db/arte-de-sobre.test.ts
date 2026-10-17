import { describe, it, expect } from 'vitest';
import { CatalogQueryRepository } from './catalog-query-repository.js';
import { PackRepositoryMysql } from './pack-repository.js';
import { ORDEN_DE_PLANTILLA, PLANTILLA_DE_EPOCA_O_LINEA, artKeyDe } from './plantilla-sql.js';
import type { Database } from './connection.js';

function espia(filas: unknown[] = []) {
  const consultas: string[] = [];
  const db = {
    select: async (sql: string) => {
      consultas.push(sql);
      return filas;
    },
  } as unknown as Database;
  return { db, consultas };
}

describe('el arte del sobre sale de la MISMA eleccion de epoca que el motor (H9e)', () => {
  it('findTemplate y listSets usan el mismo fragmento SQL y el mismo orden', async () => {
    // Si las dos consultas tuvieran cada una su copia, un dia una cambiaria y
    // el sobre de un set ensenaria una epoca y traeria las cartas de otra.
    const motor = espia();
    await new PackRepositoryMysql(motor.db).findTemplate(1);
    expect(motor.consultas[0]).toContain(PLANTILLA_DE_EPOCA_O_LINEA('t', 's'));
    expect(motor.consultas[0]).toContain(ORDEN_DE_PLANTILLA('t', 's'));
    expect(motor.consultas[0]).toContain('ORDER BY');

    const catalogo = espia();
    await new CatalogQueryRepository(catalogo.db).listSets('PTCG');
    expect(catalogo.consultas[0]).toContain(PLANTILLA_DE_EPOCA_O_LINEA('t2', 's'));
    expect(catalogo.consultas[0]).toContain(ORDEN_DE_PLANTILLA('t2', 's'));
    expect(catalogo.consultas[0]).toContain('ORDER BY');
  });

  it('el artKey es el nombre de la plantilla, normalizado', () => {
    expect(artKeyDe('Booster Scarlet & Violet')).toBe('booster-scarlet-violet');
    expect(artKeyDe('Core Booster (hasta Light of Destruction)')).toBe('core-booster-hasta-light-of-destruction');
    expect(artKeyDe('Booster clasico (hasta la era EX)')).toBe('booster-clasico-hasta-la-era-ex');
  });

  it('listSets devuelve paleta y artKey, y null cuando no los hay', async () => {
    const fila = {
      id: 1, external_id: 'sv3pt5', code: 'MEW', name: '151', released_at: '2023-09-22',
      card_count: 207, is_openable: 1, icon_url: null, icon_local_path: null, pool_size: 165,
      palette: '{"primario":"#c0392b","secundario":"#ffd54a"}', plantilla: 'Booster Scarlet & Violet',
    };
    const { db } = espia([fila, { ...fila, id: 2, palette: null, plantilla: null }]);
    const [con, sin] = await new CatalogQueryRepository(db).listSets('PTCG');
    expect(con).toMatchObject({ palette: { primario: '#c0392b', secundario: '#ffd54a' }, artKey: 'booster-scarlet-violet' });
    expect(sin).toMatchObject({ palette: null, artKey: null });
  });
});
