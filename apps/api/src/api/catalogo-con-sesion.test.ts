import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildFullServer, buildServer } from './server.js';
import type { CardQuery, FacetCounts } from '../db/catalog-query-repository.js';

/**
 * T-093 - el catalogo es publico, pero "las que me faltan" es de alguien.
 *
 * La busqueda y los recuentos siguen abiertos a cualquiera. Lo nuevo es que, SI
 * llega un token valido, el servidor sabe contra que coleccion comparar. Tres
 * cosas que no pueden pasar:
 *
 *  - que un anonimo pida "las que me faltan" y reciba el catalogo entero como
 *    si le faltara todo: eso es contestar otra pregunta sin decirlo;
 *  - que un token caducado -- duran una hora, ADR-008 -- tumbe el catalogo
 *    publico de quien simplemente lo tenia guardado;
 *  - que el usuario salga de cualquier sitio que no sea el token.
 */
const SECRETO = 'un-secreto-suficientemente-largo-para-produccion-2026';

const CON_TENENCIA: FacetCounts = {
  types: [{ value: 'Grass', count: 23, owned: 12 }],
  supertypes: [],
  marks: [],
  withoutMark: 0,
  rarities: [],
  total: 23,
  ownedTotal: 12,
};

type Facetas = Array<[string, string | undefined, number | undefined]>;

function catalogoEspia() {
  const busquedas: CardQuery[] = [];
  const facetas: Facetas = [];
  const catalog = {
    listGames: async () => [],
    listSets: async () => [],
    listRarities: async () => [],
    searchCards: async (q: CardQuery) => {
      busquedas.push(q);
      return { items: [], nextCursor: null };
    },
    listFacets: async (game: string, set?: string, userId?: number): Promise<FacetCounts> => {
      facetas.push([game, set, userId]);
      return userId !== undefined
        ? CON_TENENCIA
        : { ...CON_TENENCIA, types: [{ value: 'Grass', count: 23, owned: null }], ownedTotal: null };
    },
    findCard: async () => null,
  };
  return { catalog, busquedas, facetas };
}

/** Dependencias de cuenta que estallan si alguien las usa: aqui no toca ninguna. */
const nadie = new Proxy(
  {},
  {
    get(_t, prop) {
      return () => {
        throw new Error(`Este test no deberia llamar a ${String(prop)}()`);
      };
    },
  },
);

async function montar() {
  const espia = catalogoEspia();
  const app = await buildFullServer({
    catalog: espia.catalog as never,
    auth: {
      users: nadie as never,
      collection: nadie as never,
      packs: nadie as never,
      decks: nadie as never,
      jwtSecret: SECRETO,
    },
  });
  await app.ready();
  return { app, ...espia };
}

const bearer = (app: FastifyInstance, sub: string) => ({
  authorization: `Bearer ${app.jwt.sign({ sub })}`,
});

describe('las que me faltan, en /api/cards', () => {
  it('con sesion, el filtro llega al catalogo con el usuario DEL TOKEN', async () => {
    const { app, busquedas } = await montar();
    const res = await app.inject({ url: '/api/cards?game=PTCG&set=sv1&owned=no', headers: bearer(app, '7') });
    expect(res.statusCode).toBe(200);
    expect(busquedas[0]!.owner).toEqual({ userId: 7, owned: false });
  });

  it('owned=yes pide las que SI tiene', async () => {
    const { app, busquedas } = await montar();
    await app.inject({ url: '/api/cards?game=PTCG&owned=yes', headers: bearer(app, '7') });
    expect(busquedas[0]!.owner).toEqual({ userId: 7, owned: true });
  });

  it('sin sesion, pedir las que faltan es un 401 y no el catalogo entero', async () => {
    const { app, busquedas } = await montar();
    const res = await app.inject({ url: '/api/cards?game=PTCG&owned=no' });
    expect(res.statusCode).toBe(401);
    expect(busquedas).toHaveLength(0);
  });

  it('un token invalido con owned tambien es 401', async () => {
    const { app, busquedas } = await montar();
    const res = await app.inject({ url: '/api/cards?owned=no', headers: { authorization: 'Bearer basura' } });
    expect(res.statusCode).toBe(401);
    expect(busquedas).toHaveLength(0);
  });

  it('un token invalido SIN owned no tumba el catalogo publico', async () => {
    const { app, busquedas } = await montar();
    const res = await app.inject({ url: '/api/cards?game=PTCG', headers: { authorization: 'Bearer caducado' } });
    expect(res.statusCode).toBe(200);
    expect(busquedas[0]!.owner).toBeUndefined();
  });

  it('con sesion pero sin owned no filtra, pero cada fila sabra si la tiene', async () => {
    const { app, busquedas } = await montar();
    await app.inject({ url: '/api/cards?game=PTCG', headers: bearer(app, '7') });
    expect(busquedas[0]!.owner).toBeUndefined();
    expect(busquedas[0]!.viewerId).toBe(7);
  });

  it('sin sesion nadie mira: ninguna fila pregunta por una coleccion', async () => {
    const { app, busquedas } = await montar();
    await app.inject({ url: '/api/cards?game=PTCG' });
    expect(busquedas[0]!.viewerId).toBeUndefined();
  });

  it('el usuario no se puede pasar por la query', async () => {
    const { app } = await montar();
    const res = await app.inject({ url: '/api/cards?owned=no&userId=7' });
    expect(res.statusCode).toBe(400);
  });

  it('owned solo admite yes o no', async () => {
    const { app } = await montar();
    const res = await app.inject({ url: '/api/cards?owned=quizas', headers: bearer(app, '7') });
    expect(res.statusCode).toBe(400);
  });
});

describe('la tenencia en los recuentos del rail', () => {
  it('con sesion, los recuentos dicen tambien cuantas tiene', async () => {
    const { app, facetas } = await montar();
    const res = await app.inject({ url: '/api/games/PTCG/facets?set=sv1', headers: bearer(app, '7') });
    expect(facetas[0]).toEqual(['PTCG', 'sv1', 7]);
    // Declarado en el esquema: si no lo estuviera, Fastify lo tiraria en
    // silencio y el rail no sabria nunca cuantas tienes (ADR-007).
    expect(res.json().data).toMatchObject({
      total: 23,
      ownedTotal: 12,
      types: [{ value: 'Grass', count: 23, owned: 12 }],
    });
  });

  it('sin sesion, recuentos sin tenencia y sin error', async () => {
    const { app, facetas } = await montar();
    const res = await app.inject({ url: '/api/games/PTCG/facets?set=sv1' });
    expect(res.statusCode).toBe(200);
    expect(facetas[0]).toEqual(['PTCG', 'sv1', undefined]);
    expect(res.json().data.ownedTotal).toBeNull();
  });

  it('un token caducado da los recuentos publicos, no un 401', async () => {
    const { app } = await montar();
    const res = await app.inject({
      url: '/api/games/PTCG/facets',
      headers: { authorization: 'Bearer caducado' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('el servidor de solo catalogo, sin cuentas', () => {
  it('no puede contestar "las que me faltan": 401, no un catalogo entero', async () => {
    const { catalog, busquedas } = catalogoEspia();
    const app = buildServer({ catalog: catalog as never });
    const res = await app.inject({ url: '/api/cards?owned=no' });
    expect(res.statusCode).toBe(401);
    expect(busquedas).toHaveLength(0);
  });
});
