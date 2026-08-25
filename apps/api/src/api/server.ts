import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import type { GameCode } from '@tcg/shared';
import type { CatalogQueryRepository } from '../db/catalog-query-repository.js';
import type { CollectionRepository } from '../db/collection-repository.js';
import type { UserRepository } from '../auth/user-repository.js';
import type { PackService } from '../packs/index.js';
import { registerAuthRoutes } from './auth-routes.js';
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
  /** Presentes activan cuentas, sobres y coleccion (H6). Sin ellos, solo catalogo. */
  auth?: {
    users: UserRepository;
    collection: CollectionRepository;
    packs: PackService;
    jwtSecret: string;
    /** Caducidad del token. Corta a proposito: un JWT no se puede revocar (ADR-008). */
    tokenTtl?: string;
  };
}

/**
 * Longitud minima del secreto JWT.
 *
 * 32 caracteres no es una cifra ritual: por debajo, un secreto es adivinable por
 * fuerza bruta, y quien lo adivine puede firmar un token para CUALQUIER usuario.
 */
export const MIN_JWT_SECRET_LENGTH = 32;

export class WeakJwtSecretError extends Error {
  constructor(motivo: string) {
    super(`Secreto JWT invalido: ${motivo}`);
    this.name = 'WeakJwtSecretError';
  }
}

/** Valores que alguien podria dejar puestos sin darse cuenta. */
const SECRETOS_PROHIBIDOS = new Set(['cambiame', 'changeme', 'secret', 'jwt_secret', 'development']);

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
   * Las rutas de cuenta, sobres y coleccion NO se registran aqui.
   *
   * Viven en `buildFullServer`, que exige un secreto JWT valido. Asi es
   * imposible levantar por descuido un servidor con el endpoint de sobres
   * abierto y sin autenticacion: el `user_id` sale siempre del token.
   */

  app.setNotFoundHandler(async (request, reply) =>
    reply.code(404).send({ error: 'not_found', message: `Ruta desconocida: ${request.url}` }),
  );

  return app;
}

/**
 * Servidor completo: catalogo + cuentas + sobres + coleccion (H6).
 *
 * Es `async` porque registrar plugins de Fastify lo es. `buildServer` se
 * mantiene sincrono y sin auth para que los tests del catalogo sigan siendo
 * triviales de montar.
 */
export async function buildFullServer(options: ApiOptions & { auth: NonNullable<ApiOptions['auth']> }): Promise<FastifyInstance> {
  assertStrongSecret(options.auth.jwtSecret);

  const app = buildServer(options);

  await app.register(fastifyRateLimit, {
    // Tope global generoso; el login lleva el suyo, mucho mas estricto.
    max: 300,
    timeWindow: '1 minute',
  });

  await app.register(fastifyJwt, {
    secret: options.auth.jwtSecret,
    sign: { expiresIn: options.auth.tokenTtl ?? '1h' },
  });

  await registerAuthRoutes(app, {
    users: options.auth.users,
    collection: options.auth.collection,
    catalog: options.catalog,
    packs: options.auth.packs,
  });

  return app;
}

/**
 * El servidor se NIEGA A ARRANCAR con un secreto debil.
 *
 * Un valor por defecto en produccion es una cuenta de administrador regalada:
 * quien conozca el secreto puede firmar un token para cualquier usuario. Fallar
 * al arrancar es ruidoso; un secreto por defecto es silencioso hasta que alguien
 * lo aprovecha.
 */
export function assertStrongSecret(secret: string | undefined): void {
  if (!secret || secret.trim() === '') {
    throw new WeakJwtSecretError('esta vacio o no esta definido');
  }
  const limpio = secret.trim();
  if (limpio.length < MIN_JWT_SECRET_LENGTH) {
    throw new WeakJwtSecretError(
      `tiene ${limpio.length} caracteres y se exigen al menos ${MIN_JWT_SECRET_LENGTH}`,
    );
  }
  if (SECRETOS_PROHIBIDOS.has(limpio.toLowerCase())) {
    throw new WeakJwtSecretError('es un valor de ejemplo que alguien olvido cambiar');
  }
}
