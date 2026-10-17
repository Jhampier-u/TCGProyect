import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogQueryRepository } from './catalog-query-repository.js';
import type { Database } from './connection.js';
import {
  CacheEnMemoria, SIN_CACHE, generacionEnFichero, marcarCatalogoCambiado, rutaDeLaMarca,
} from './cache-de-facetas.js';

/**
 * Cache de los recuentos BASE del rail de facetas.
 *
 * Un doble de `Database` que cuenta consultas: las de tenencia se reconocen
 * porque parten de `user_collection`, y todas las demas son base. Lo que se
 * comprueba es justo lo que la cache promete: que la segunda vez no se repite
 * el trabajo caro, que la tenencia sigue viva y que el resultado es el mismo
 * byte a byte que sin cache.
 */
function dbContador() {
  const cuenta = { base: 0, tenencia: 0 };
  const db = {
    select: async (sql: string) => {
      const esTenencia = sql.includes('user_collection');
      if (esTenencia) cuenta.tenencia += 1;
      else cuenta.base += 1;
      if (sql.includes('JOIN rarities r')) {
        return esTenencia
          ? [{ valor: 'C', tengo: 1 }]
          : [{ valor: 'C', n: 3 }, { valor: 'R', n: 2 }];
      }
      return esTenencia
        ? [{ valor: 'X', tengo: 2 }]
        : [{ valor: 'X', n: 5 }, { valor: null, n: 1 }];
    },
  } as unknown as Database;
  return { db, cuenta };
}

function reloj(inicio = 1_000_000) {
  let t = inicio;
  return { ahora: () => t, avanzar: (ms: number) => { t += ms; } };
}

describe('CatalogQueryRepository.listFacets con cache de recuentos base', () => {
  it('la segunda llamada dentro del TTL no lanza consultas base', async () => {
    const { db, cuenta } = dbContador();
    const r = reloj();
    const repo = new CatalogQueryRepository(db, new CacheEnMemoria({ ttlMs: 60_000, ahora: r.ahora }));

    await repo.listFacets('MTG');
    const tras1 = cuenta.base;
    expect(tras1).toBeGreaterThan(0);

    await repo.listFacets('MTG');
    expect(cuenta.base).toBe(tras1);
  });

  it('con sesion la tenencia se sigue consultando aunque la base venga de la cache', async () => {
    const { db, cuenta } = dbContador();
    const repo = new CatalogQueryRepository(db, new CacheEnMemoria({ ttlMs: 60_000 }));

    await repo.listFacets('YGO', undefined, 1);
    const base1 = cuenta.base;
    const ten1 = cuenta.tenencia;
    expect(ten1).toBe(base1);

    await repo.listFacets('YGO', undefined, 1);
    expect(cuenta.base).toBe(base1);
    expect(cuenta.tenencia).toBe(ten1 * 2);
  });

  it('pasado el TTL vuelve a consultar la base', async () => {
    const { db, cuenta } = dbContador();
    const r = reloj();
    const repo = new CatalogQueryRepository(db, new CacheEnMemoria({ ttlMs: 60_000, ahora: r.ahora }));

    await repo.listFacets('PTCG');
    const base1 = cuenta.base;
    r.avanzar(59_999);
    await repo.listFacets('PTCG');
    expect(cuenta.base).toBe(base1);
    r.avanzar(2);
    await repo.listFacets('PTCG');
    expect(cuenta.base).toBe(base1 * 2);
  });

  it('un cambio de generacion (una ingesta) invalida la cache', async () => {
    const { db, cuenta } = dbContador();
    let gen = 'a';
    const repo = new CatalogQueryRepository(
      db,
      new CacheEnMemoria({ ttlMs: 60_000, generacion: async () => gen }),
    );

    await repo.listFacets('MTG', 'khm');
    const base1 = cuenta.base;
    await repo.listFacets('MTG', 'khm');
    expect(cuenta.base).toBe(base1);

    gen = 'b';
    await repo.listFacets('MTG', 'khm');
    expect(cuenta.base).toBe(base1 * 2);
  });

  it('juego y set distintos no comparten entrada', async () => {
    const { db, cuenta } = dbContador();
    const repo = new CatalogQueryRepository(db, new CacheEnMemoria({ ttlMs: 60_000 }));

    await repo.listFacets('MTG');
    const porMtg = cuenta.base;
    await repo.listFacets('MTG', 'khm');
    expect(cuenta.base).toBe(porMtg * 2);
    await repo.listFacets('MTG', 'neo');
    expect(cuenta.base).toBe(porMtg * 3);
    await repo.listFacets('PTCG');
    const tras = cuenta.base;
    expect(tras).toBeGreaterThan(porMtg * 3);

    // Y ahora todas son aciertos.
    await repo.listFacets('MTG');
    await repo.listFacets('MTG', 'khm');
    await repo.listFacets('MTG', 'neo');
    await repo.listFacets('PTCG');
    expect(cuenta.base).toBe(tras);
  });

  it('la respuesta es identica con y sin cache, anonima y con sesion', async () => {
    const sin = new CatalogQueryRepository(dbContador().db);
    const con = new CatalogQueryRepository(dbContador().db, new CacheEnMemoria({ ttlMs: 60_000 }));

    for (const [game, set, user] of [
      ['MTG', undefined, undefined], ['MTG', undefined, 1], ['YGO', 'LOB', 1], ['PTCG', 'base1', undefined],
    ] as const) {
      const esperado = await sin.listFacets(game, set, user);
      expect(await con.listFacets(game, set, user)).toEqual(esperado); // en frio
      expect(await con.listFacets(game, set, user)).toEqual(esperado); // en caliente
    }
  });

  it('mezclar la tenencia no ensucia la entrada cacheada', async () => {
    const repo = new CatalogQueryRepository(dbContador().db, new CacheEnMemoria({ ttlMs: 60_000 }));

    const anonima = await repo.listFacets('MTG');
    const conSesion = await repo.listFacets('MTG', undefined, 1);
    expect(conSesion.ownedTotal).toBe(1);
    expect(conSesion.rarities.find((x) => x.value === 'C')?.owned).toBe(1);

    // Si la mezcla escribiera `tengo` en las filas cacheadas, la siguiente
    // respuesta anonima arrastraria la tenencia de otro usuario.
    const otraAnonima = await repo.listFacets('MTG');
    expect(otraAnonima).toEqual(anonima);
    expect(otraAnonima.ownedTotal).toBeNull();
    expect(otraAnonima.rarities.every((x) => x.owned === null)).toBe(true);

    // Y mutar lo devuelto tampoco llega a la cache.
    otraAnonima.rarities[0]!.count = 999;
    otraAnonima.total = -1;
    expect(await repo.listFacets('MTG')).toEqual(anonima);
  });
});

describe('CacheEnMemoria', () => {
  it('lo cacheado queda congelado: una mezcla en sitio fallaria a la vista', async () => {
    const cache = new CacheEnMemoria({ ttlMs: 60_000 });
    const valor = await cache.obtener('k', async () => ({ filas: [{ n: 1 }] }));
    expect(Object.isFrozen(valor)).toBe(true);
    expect(Object.isFrozen(valor.filas)).toBe(true);
    expect(Object.isFrozen(valor.filas[0])).toBe(true);
  });

  it('dos fallos simultaneos en frio comparten un solo calculo', async () => {
    const cache = new CacheEnMemoria({ ttlMs: 60_000 });
    let calculos = 0;
    const calcular = async () => {
      calculos += 1;
      await new Promise((r) => setTimeout(r, 5));
      return { n: 1 };
    };
    await Promise.all([cache.obtener('k', calcular), cache.obtener('k', calcular)]);
    expect(calculos).toBe(1);
  });

  it('un calculo que falla no se queda en la cache', async () => {
    const cache = new CacheEnMemoria({ ttlMs: 60_000 });
    await expect(cache.obtener('k', async () => { throw new Error('caida'); })).rejects.toThrow('caida');
    expect(await cache.obtener('k', async () => 7)).toBe(7);
  });

  it('TTL 0 desactiva la cache', async () => {
    const cache = new CacheEnMemoria({ ttlMs: 0 });
    let calculos = 0;
    await cache.obtener('k', async () => ++calculos);
    await cache.obtener('k', async () => ++calculos);
    expect(calculos).toBe(2);
  });

  it('no crece sin limite: pasado el maximo se va la mas antigua', async () => {
    const cache = new CacheEnMemoria({ ttlMs: 60_000, maxEntradas: 2 });
    let calculos = 0;
    const calcular = async () => ++calculos;
    await cache.obtener('a', calcular);
    await cache.obtener('b', calcular);
    await cache.obtener('c', calcular); // expulsa a 'a'
    expect(calculos).toBe(3);
    await cache.obtener('c', calcular);
    await cache.obtener('b', calcular);
    expect(calculos).toBe(3);
    await cache.obtener('a', calcular);
    expect(calculos).toBe(4);
  });

  it('SIN_CACHE siempre calcula', async () => {
    let calculos = 0;
    await SIN_CACHE.obtener('k', async () => ++calculos);
    await SIN_CACHE.obtener('k', async () => ++calculos);
    expect(calculos).toBe(2);
  });
});

describe('la marca de generacion en disco (invalidacion entre procesos)', () => {
  it('sin marca la generacion es estable, y marcar la cambia', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tcg-gen-'));
    try {
      const leer = generacionEnFichero(rutaDeLaMarca(join(dir, 'cards')));
      const g0 = await leer();
      expect(await leer()).toBe(g0);

      await marcarCatalogoCambiado(join(dir, 'cards'));
      const g1 = await leer();
      expect(g1).not.toBe(g0);
      expect(await leer()).toBe(g1);

      await marcarCatalogoCambiado(join(dir, 'cards'));
      expect(await leer()).not.toBe(g1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
