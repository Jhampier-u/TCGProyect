import { describe, it, expect } from 'vitest';
import {
  CatalogQueryRepository, SIN_MARCA, encodeCursor, type CardQuery,
} from './catalog-query-repository.js';
import type { Database } from './connection.js';

/**
 * T-092 - los filtros de faceta, comprobados por el SQL que producen.
 *
 * NO HACE FALTA BASE DE DATOS: lo que hay que verificar es que cada filtro
 * anade la condicion correcta con el parametro correcto, y que ninguno toca el
 * orden ni convierte la paginacion en `OFFSET`. Un doble de `Database` que
 * captura la consulta basta y corre en milisegundos, que es lo que hace que
 * esto se ejecute en cada `npm test` y no solo cuando alguien se acuerda.
 */
function repoEspia() {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    select: async (sql: string, params: unknown[] = []) => {
      consultas.push({ sql, params });
      return [];
    },
  } as unknown as Database;
  return { repo: new CatalogQueryRepository(db), consultas };
}

async function sqlDe(query: CardQuery): Promise<{ sql: string; params: unknown[] }> {
  const { repo, consultas } = repoEspia();
  await repo.searchCards(query);
  return consultas[0]!;
}

describe('filtros de faceta en la busqueda (T-092)', () => {
  it('filtra por tipo elemental usando la columna generada, no el JSON', async () => {
    // Si esto acabara mirando `game_data`, el indice de la 0027 no serviria de
    // nada y volveriamos al escaneo de 34.200 filas que midio T-091.
    const { sql, params } = await sqlDe({ game: 'PTCG', type: 'Grass' });
    expect(sql).toContain('c.elem_type = ?');
    expect(sql).not.toContain('$.types');
    expect(params).toContain('Grass');
  });

  it('filtra por categoria y por marca', async () => {
    const { sql, params } = await sqlDe({ game: 'PTCG', supertype: 'Trainer', mark: 'I' });
    expect(sql).toContain('c.supertype = ?');
    expect(sql).toContain('c.reg_mark = ?');
    expect(params).toEqual(expect.arrayContaining(['Trainer', 'I']));
  });

  it('pedir las SIN marca es `IS NULL`, no un valor', async () => {
    // Las 12.250 cartas anteriores a 2019 no tienen marca y nunca la tendran.
    // Sin este caso no habria forma de pedirlas: omitir el filtro devuelve
    // todas, y `mark=''` no es lo mismo que "las que no tienen".
    const { sql, params } = await sqlDe({ game: 'PTCG', mark: SIN_MARCA });
    expect(sql).toContain('c.reg_mark IS NULL');
    expect(params).not.toContain(SIN_MARCA);
  });

  it('los filtros se ACUMULAN, no se pisan', async () => {
    const { sql } = await sqlDe({ game: 'PTCG', set: 'BLK', rarity: 'common', type: 'Fire' });
    for (const cond of ['c.game_id = ?', 's.external_id = ?', 'r.code = ?', 'c.elem_type = ?']) {
      expect(sql).toContain(cond);
    }
  });

  it('ningun filtro rompe la paginacion keyset', async () => {
    // La comprobacion que de verdad protege algo. `OFFSET` sobre 117.152
    // impresiones degrada hasta ser inusable, y el desempate por
    // `card_prints.id` es lo que impide que desaparezcan filas en silencio
    // cuando dos impresiones comparten carta (P-013).
    const { sql } = await sqlDe({ game: 'PTCG', type: 'Water' });
    expect(sql).toContain('ORDER BY c.name ASC, p.id ASC');
    expect(sql).not.toContain('OFFSET');
  });

  it('el cursor sigue desempatando por la IMPRESION con filtros puestos', async () => {
    const { repo, consultas } = repoEspia();
    await repo.searchCards({ game: 'PTCG', type: 'Water' });
    // Se usa la funcion REAL de la paginacion, no una copia del formato: un
    // cursor inventado a mano probaria mi suposicion, no el codigo.
    const cursor = encodeCursor('Pikachu', 42);
    await repo.searchCards({ game: 'PTCG', type: 'Water', cursor });
    const conCursor = consultas[1]!;
    expect(conCursor.sql).toContain('c.name = ? AND p.id > ?');
    expect(conCursor.params).toContain(42);
  });

  it('sin faceta pedida no se anade ninguna condicion de faceta', async () => {
    // El contraste que hace que lo anterior signifique algo.
    // Se mira la CONDICION, no el SQL entero: las tres columnas salen siempre
    // en el SELECT porque la rejilla las pinta. Lo que no debe aparecer sin
    // pedirlo es el filtro.
    const { sql } = await sqlDe({ game: 'PTCG' });
    expect(sql).not.toContain('c.elem_type = ?');
    expect(sql).not.toContain('c.supertype = ?');
    expect(sql).not.toContain('c.reg_mark = ?');
    expect(sql).not.toContain('c.reg_mark IS NULL');
  });
});

describe('recuentos por faceta para el rail (T-092)', () => {
  it('cuenta dentro del set cuando se pide uno', async () => {
    // Los recuentos son del contexto que se mira. Enseniar "Agua 2436" mientras
    // se navega un set que tiene cuatro seria mentir con un numero.
    const { repo, consultas } = repoEspia();
    await repo.listFacets('PTCG', 'BLK');
    expect(consultas).toHaveLength(4);
    for (const c of consultas) {
      expect(c.sql).toContain('s.external_id = ?');
      expect(c.params).toContain('BLK');
    }
  });

  it('sin set, cuenta el juego entero', async () => {
    const { repo, consultas } = repoEspia();
    await repo.listFacets('PTCG');
    for (const c of consultas) expect(c.sql).not.toContain('s.external_id');
  });

  it('excluye las impresiones retiradas', async () => {
    // Una carta que el origen dejo de listar no debe inflar un recuento (T-083).
    const { repo, consultas } = repoEspia();
    await repo.listFacets('PTCG');
    for (const c of consultas) expect(c.sql).toContain('p.withdrawn_at IS NULL');
  });
});

describe('las dos consultas que alimentan `toSummary` (T-092)', () => {
  /*
   * ESTA PRUEBA NACE DE UN 500 EN PRODUCCION LOCAL.
   *
   * `searchCards` y `findCard` construyen su resultado con el MISMO
   * `toSummary`, pero cada una tiene su propio SELECT. Al declarar las facetas
   * en el esquema compartido se anadieron a la primera y no a la segunda: la
   * ficha devolvia `Number(undefined)` = NaN, el serializador lo rechazaba y
   * `GET /api/cards/:id` respondia 500. La prueba P-024 no lo vio porque
   * compara `toSummary` con el esquema, y `toSummary` estaba bien; lo que no
   * cuadraba era la consulta que lo alimenta.
   *
   * Lo cazó la suite E2E, al no poder anadir una carta a un mazo.
   */
  const COLUMNAS = ['c.hp', 'c.supertype', 'c.elem_type', 'c.reg_mark'];

  it('la busqueda selecciona todas las facetas', async () => {
    const { sql } = await sqlDe({ game: 'PTCG' });
    for (const col of COLUMNAS) expect(sql).toContain(col);
  });

  it('la ficha selecciona EXACTAMENTE las mismas', async () => {
    const { repo, consultas } = repoEspia();
    await repo.findCard(42);
    for (const col of COLUMNAS) expect(consultas[0]!.sql).toContain(col);
  });
});
