import Fastify, { type FastifyInstance } from 'fastify';
import type { GameCode } from '@tcg/shared';
import type { CatalogQueryRepository } from '../db/catalog-query-repository.js';
import {
  GET_CARD,
  LIST_GAMES,
  LIST_RARITIES,
  LIST_SETS,
  SEARCH_CARDS,
} from './schemas.js';

export interface ApiOptions {
  catalog: CatalogQueryRepository;
  logger?: boolean;
}

/**
 * API HTTP del catalogo (H3, ADR-007).
 *
 * TODO lo que sirve sale de la base de datos local. Ninguna peticion de un
 * usuario final llega jamas a Scryfall, YGOPRODeck ni Pokemon TCG (ADR-002): el
 * trafico de usuarios contra esas APIs seria el camino mas rapido a que nos
 * bloqueen la IP.
 *
 * Las respuestas van tipadas por esquema. No es documentacion: Fastify elimina
 * al serializar todo campo que no este declarado, y eso es lo que impide que
 * `image_source_url` llegue al navegador (P-001).
 */
export function buildServer(options: ApiOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    // Sin esto Fastify rechaza como 400 cualquier query no declarada en el
    // esquema, que es justo lo que queremos: la superficie es la declarada.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array' } },
  });

  const { catalog } = options;

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/games', { schema: LIST_GAMES }, async () => ({
    data: await catalog.listGames(),
  }));

  app.get<{ Params: { game: GameCode } }>(
    '/api/games/:game/sets',
    { schema: LIST_SETS },
    async (request) => ({ data: await catalog.listSets(request.params.game) }),
  );

  app.get<{ Params: { game: GameCode } }>(
    '/api/games/:game/rarities',
    { schema: LIST_RARITIES },
    async (request) => ({ data: await catalog.listRarities(request.params.game) }),
  );

  app.get<{
    Querystring: {
      game?: GameCode; set?: string; rarity?: string; q?: string;
      cursor?: string; limit?: number;
    };
  }>('/api/cards', { schema: SEARCH_CARDS }, async (request) => {
    const page = await catalog.searchCards(request.query);
    return { data: page.items, nextCursor: page.nextCursor };
  });

  app.get<{ Params: { printId: number } }>(
    '/api/cards/:printId',
    { schema: GET_CARD },
    async (request, reply) => {
      const card = await catalog.findCard(request.params.printId);
      if (!card) {
        return reply.code(404).send({
          error: 'not_found',
          message: `No existe la impresion ${request.params.printId}`,
        });
      }
      return { data: card };
    },
  );

  /**
   * NO HAY ENDPOINT DE APERTURA DE SOBRES, y es deliberado.
   *
   * El motor (`PackService`) esta construido y probado desde S012, pero abrir un
   * sobre MUTA la coleccion de un usuario concreto. Exponerlo antes de tener
   * autenticacion (H6) significaria aceptar el `user_id` del cliente, que es una
   * vulnerabilidad de referencia directa a objetos de manual: cualquiera podria
   * llenar la coleccion de otro.
   *
   * Se prefiere no tener el endpoint a tenerlo inseguro. Llega en H6.
   */

  app.setNotFoundHandler(async (request, reply) =>
    reply.code(404).send({ error: 'not_found', message: `Ruta desconocida: ${request.url}` }),
  );

  return app;
}
