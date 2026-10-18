import { describe, it, expect } from 'vitest';
import { SIN_VALOR } from '@tcg/shared';
import {
  CatalogQueryRepository, encodeCursor, toSummary, type CardQuery,
} from './catalog-query-repository.js';
import type { Database } from './connection.js';
import { ROW_FIELD_SQL } from './facetas-sql.js';

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
    const { sql, params } = await sqlDe({ game: 'PTCG', facetas: { type: 'Grass' } });
    expect(sql).toContain('c.elem_type = ?');
    expect(sql).not.toContain('$.types');
    expect(params).toContain('Grass');
  });

  it('filtra por categoria y por marca', async () => {
    const { sql, params } = await sqlDe({ game: 'PTCG', facetas: { supertype: 'Trainer', mark: 'I' } });
    expect(sql).toContain('c.supertype = ?');
    expect(sql).toContain('c.reg_mark = ?');
    expect(params).toEqual(expect.arrayContaining(['Trainer', 'I']));
  });

  it('pedir las SIN marca es `IS NULL`, no un valor', async () => {
    // Las 12.250 cartas anteriores a 2019 no tienen marca y nunca la tendran.
    // Sin este caso no habria forma de pedirlas: omitir el filtro devuelve
    // todas, y `mark=''` no es lo mismo que "las que no tienen".
    const { sql, params } = await sqlDe({ game: 'PTCG', facetas: { mark: SIN_VALOR } });
    expect(sql).toContain('c.reg_mark IS NULL');
    expect(params).not.toContain(SIN_VALOR);
  });

  it('los filtros se ACUMULAN, no se pisan', async () => {
    const { sql } = await sqlDe({ game: 'PTCG', set: 'BLK', rarity: 'common', facetas: { type: 'Fire' } });
    for (const cond of ['c.game_id = ?', 's.external_id = ?', 'r.code = ?', 'c.elem_type = ?']) {
      expect(sql).toContain(cond);
    }
  });

  it('ningun filtro rompe la paginacion keyset', async () => {
    // La comprobacion que de verdad protege algo. `OFFSET` sobre 117.152
    // impresiones degrada hasta ser inusable, y el desempate por
    // `card_prints.id` es lo que impide que desaparezcan filas en silencio
    // cuando dos impresiones comparten carta (P-013).
    const { sql } = await sqlDe({ game: 'PTCG', facetas: { type: 'Water' } });
    expect(sql).toContain('ORDER BY c.name ASC, p.id ASC');
    expect(sql).not.toContain('OFFSET');
  });

  it('el cursor sigue desempatando por la IMPRESION con filtros puestos', async () => {
    const { repo, consultas } = repoEspia();
    await repo.searchCards({ game: 'PTCG', facetas: { type: 'Water' } });
    // Se usa la funcion REAL de la paginacion, no una copia del formato: un
    // cursor inventado a mano probaria mi suposicion, no el codigo.
    const cursor = encodeCursor('Pikachu', 42);
    await repo.searchCards({ game: 'PTCG', facetas: { type: 'Water' }, cursor });
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
  // Desde H9f salen de una sola lista (`COLUMNAS_DE_FILA`); la prueba sigue
  // mirando las dos consultas, que es donde se rompio.
  const COLUMNAS = Object.values(ROW_FIELD_SQL);

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

describe('"las que me faltan" (T-093)', () => {
  /*
   * El criterio de aceptacion de T-093 es literal: alguien que no conoce el
   * proyecto tiene que poder pedir "las de Planta de este set que me faltan".
   * La busqueda sabia filtrar por Planta y por set; "me faltan" no existia en
   * ninguna capa. Es un filtro del SERVIDOR y no del navegador porque la
   * paginacion es keyset: filtrar en cliente una pagina de 40 deja paginas
   * medio vacias, o vacias del todo, sin que nadie sepa por que.
   */
  const TENENCIA =
    'FROM user_collection uc WHERE uc.user_id = ? AND uc.card_print_id = p.id AND uc.quantity > 0';

  it('las que faltan son NOT EXISTS sobre la coleccion del usuario', async () => {
    const { sql, params } = await sqlDe({ game: 'PTCG', set: 'sv1', owner: { userId: 7, owned: false } });
    expect(sql).toContain(`NOT EXISTS (SELECT 1 ${TENENCIA})`);
    expect(params).toContain(7);
  });

  it('las que tengo son EXISTS, sin el NOT', async () => {
    const { sql, params } = await sqlDe({ game: 'PTCG', owner: { userId: 7, owned: true } });
    expect(sql).toContain(`EXISTS (SELECT 1 ${TENENCIA})`);
    expect(sql).not.toContain('NOT EXISTS');
    expect(params).toContain(7);
  });

  it('sin usuario la busqueda no mira ninguna coleccion', async () => {
    const { sql } = await sqlDe({ game: 'PTCG', set: 'sv1' });
    expect(sql).not.toContain('user_collection');
  });

  it('con quien mira, cada fila dice si la tiene; el parametro va antes que los del WHERE', async () => {
    // El `?` de la columna esta en el SELECT, asi que su valor tiene que ser el
    // PRIMERO. Al reves, MySQL compararia `user_id` con el id del juego y cada
    // fila diria "no la tienes" sin un solo error.
    const { sql, params } = await sqlDe({ game: 'PTCG', viewerId: 7 });
    expect(sql).toContain(`EXISTS (SELECT 1 ${TENENCIA}) AS tengo`);
    expect(params[0]).toBe(7);
  });

  it('la tenencia de la fila se traduce a booleano, y a null si nadie mira', () => {
    const fila = {
      id: 1, oracle_key: 'sv1-1', game_id: 3, name: 'Sprigatito', type_line: null,
      set_code: 'SVI', set_name: 'Scarlet & Violet', print_id: 9, collector_number: '13',
      image_local_path: null, rarity: 'common', ff_type: 'Grass', ff_hp: 70, ff_mark: 'G',
    };
    expect(toSummary({ ...fila, tengo: 1 }).owned).toBe(true);
    expect(toSummary({ ...fila, tengo: 0 }).owned).toBe(false);
    // `findCard` no tiene usuario y no trae la columna: null, NO false. Un
    // `Number(undefined)` aqui es exactamente el 500 de T-092.
    expect(toSummary(fila).owned).toBeNull();
  });

  it('el filtro de tenencia no rompe la paginacion keyset', async () => {
    const { sql } = await sqlDe({ game: 'PTCG', owner: { userId: 7, owned: false } });
    expect(sql).toContain('ORDER BY c.name ASC, p.id ASC');
    expect(sql).not.toContain('OFFSET');
  });

  it('con usuario, cada recuento del rail dice tambien cuantas tiene', async () => {
    // "Planta 23" informa; "Planta 12/23" contesta ya la pregunta del criterio.
    const { repo, consultas } = repoEspia();
    await repo.listFacets('PTCG', 'sv1', 7);
    expect(consultas.length).toBeGreaterThan(0);
    for (const c of consultas) {
      expect(c.sql).toContain(`SUM(EXISTS (SELECT 1 ${TENENCIA}))`);
      expect(c.params[0]).toBe(7);
    }
  });

  it('sin usuario los recuentos no tocan la coleccion y la tenencia sale nula', async () => {
    const { repo, consultas } = repoEspia();
    const r = await repo.listFacets('PTCG', 'sv1');
    for (const c of consultas) expect(c.sql).not.toContain('user_collection');
    expect(r.ownedTotal).toBeNull();
  });

  it('el total del contexto sale de sumar las rarezas: es la unica particion que queda', async () => {
    // Antes salia de la categoria de Pokemon. En Magic ninguna faceta es una
    // particion -- una bicolor cuenta dos veces, el coste aparta los reversos --
    // y la rareza si: toda impresion tiene exactamente una (`rarity_id NOT NULL`).
    // Asi no hace falta una consulta mas.
    const db = {
      select: async (sql: string) =>
        sql.includes('r.code')
          ? [
              { valor: 'common', n: 120, tengo: 30 },
              { valor: 'rare', n: 42, tengo: 6 },
            ]
          : sql.includes('c.supertype AS valor')
            ? [
                { valor: 'Trainer', n: 40, tengo: 5 },
                { valor: 'Pokémon', n: 120, tengo: 30 },
                { valor: null, n: 2, tengo: 1 },
              ]
            : [],
    } as unknown as Database;
    const r = await new CatalogQueryRepository(db).listFacets('PTCG', 'sv1', 7);
    expect(r.total).toBe(162);
    expect(r.ownedTotal).toBe(36);
    // El orden es el del perfil, no el de la consulta; y un NULL en una faceta
    // sin "sin valor" no se pinta.
    expect(r.facetas.supertype).toEqual([
      { value: 'Pokémon', count: 120, owned: 30 },
      { value: 'Trainer', count: 40, owned: 5 },
    ]);
  });
});

describe('Magic y Yu-Gi-Oh! en la busqueda y en el rail (H9f)', () => {
  it('el color concreto va por el indice multivaluado, con el valor como parametro', async () => {
    const { sql, params } = await sqlDe({ game: 'MTG', facetas: { color: 'U', kind: 'creature' } });
    expect(sql).toContain("? MEMBER OF (c.game_data->'$.colors')");
    expect(sql).toContain('c.kind = ?');
    expect(params).toEqual(expect.arrayContaining(['U', 'creature']));
    expect(sql).toContain('ORDER BY c.name ASC, p.id ASC');
  });

  it('una clave que no es del juego no se convierte en condicion: se rechaza', async () => {
    const { repo } = repoEspia();
    await expect(repo.searchCards({ game: 'PTCG', facetas: { color: 'U' } })).rejects.toThrow('color');
  });

  it('el rail cuenta la rareza y cada faceta del perfil: cuatro consultas en Magic, seis en Yu-Gi-Oh!', async () => {
    const mtg = repoEspia();
    await mtg.repo.listFacets('MTG');
    expect(mtg.consultas).toHaveLength(4);
    const ygo = repoEspia();
    await ygo.repo.listFacets('YGO', 'LOB');
    expect(ygo.consultas).toHaveLength(6);
    for (const c of ygo.consultas) expect(c.sql).toContain('s.external_id = ?');
  });

  it('una fila de Magic lleva sus datos y no los de Pokemon', () => {
    const fila = {
      id: 1, oracle_key: 'o', game_id: 1, name: 'Llanowar Elves', type_line: 'Creature - Elf Druid',
      set_code: 'DOM', set_name: 'Dominaria', print_id: 9, collector_number: '168',
      image_local_path: null, rarity: 'common',
      ff_manaCost: '{G}', ff_kind: 'creature', ff_power: '1', ff_toughness: '1', ff_hp: 70,
    };
    expect(toSummary(fila).facetas).toEqual({
      manaCost: '{G}', kind: 'creature', power: '1', toughness: '1', loyalty: null,
    });
  });
});
