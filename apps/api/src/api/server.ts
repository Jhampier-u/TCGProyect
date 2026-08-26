import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { GameCode } from '@tcg/shared';
import type { CatalogQueryRepository } from '../db/catalog-query-repository.js';
import type { CollectionRepository } from '../db/collection-repository.js';
import type { DeckRepository } from '../db/deck-repository.js';
import type { UserRepository } from '../auth/user-repository.js';
import type { PackService } from '../packs/index.js';
import { registerAuthRoutes } from './auth-routes.js';
import { registerDeckRoutes } from './deck-routes.js';
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
  /**
   * Raiz del almacen de imagenes re-hospedadas. Si se indica, se sirven en
   * `/images/...` — que es la UNICA via por la que el navegador debe ver una
   * carta. Nunca se le da la URL del origen (P-001).
   */
  storagePath?: string;
  /** Presentes activan cuentas, sobres y coleccion (H6). Sin ellos, solo catalogo. */
  auth?: {
    users: UserRepository;
    collection: CollectionRepository;
    packs: PackService;
    decks: DeckRepository;
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
  const app = crearInstancia(options);
  registrarRutasDeCatalogo(app, options);
  return app;
}

/** La instancia desnuda, sin una sola ruta. */
function crearInstancia(options: ApiOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    // Sin esto Fastify rechaza como 400 cualquier query no declarada en el
    // esquema, que es justo lo que queremos: la superficie es la declarada.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array' } },
  });

  return app;
}

/**
 * Las rutas publicas del catalogo.
 *
 * Estan aparte para poder registrarlas DESPUES del limitador de tasa. Un plugin
 * de Fastify solo afecta a las rutas declaradas despues de el, y durante cinco
 * hitos estas quedaron delante: el tope global no las cubria (P-038).
 */
function registrarRutasDeCatalogo(app: FastifyInstance, options: ApiOptions): void {
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

  // El orden es lo que arregla P-038: la instancia primero, el limitador
  // despues y las rutas AL FINAL. Un plugin de Fastify solo afecta a lo que se
  // declara despues de el, y con `buildServer` construyendo las rutas de golpe
  // el tope global se quedaba sin cubrir el catalogo entero.
  const app = crearInstancia(options);

  await app.register(fastifyRateLimit, {
    // Tope global generoso y ultima linea: las rutas caras llevan el suyo,
    // mucho mas estricto (T-062).
    //
    // POR IP, NO POR USUARIO, y no es un descuido: el limitador corre en
    // `onRequest`, antes de que el token se verifique, asi que no puede saber
    // quien pide. Moverlo despues obligaria a analizar el cuerpo antes de
    // rechazar, que es justo lo que un limite de tasa debe evitar.
    //
    // EN MEMORIA, no en Redis: el API corre en un solo contenedor. Con N
    // replicas cada una contaria por su cuenta y el limite efectivo seria N
    // veces el configurado; ese dia hay que conectarlo a un almacen compartido.
    max: 300,
    timeWindow: '1 minute',

    // LAS IMAGENES NO CUENTAN (P-037). Medido: exactamente 300 peticiones a
    // `/images/` y la 301 es un 429. Desde que las imagenes se sirven de verdad,
    // una sola pagina del catalogo pide decenas, asi que un usuario navegando
    // agota su propio presupuesto en un par de minutos y ve su catalogo lleno de
    // huecos. Detras de un NAT -- una oficina, un aula -- llega mucho antes.
    //
    // El limite existe para proteger lo CARO: abrir sobres escribe en tres
    // tablas, registrarse calcula un Argon2id, buscar recorre un FULLTEXT.
    // Servir un fichero inmutable de 18 KB con `sendfile` no se parece a nada de
    // eso, y ademas va con `immutable` y un ano de cache, asi que el navegador
    // deja de pedirlo solo. Las rutas caras conservan su propio limite, que es
    // el que de verdad protege (T-062).
    allowList: (request) => request.url.startsWith('/images/'),
  });

  registrarRutasDeCatalogo(app, options);

  if (options.storagePath) {
    // Las imagenes las servimos NOSOTROS desde disco. Es la contrapartida del
    // job image-harvest: se descargan una vez y se re-hospedan, y el navegador
    // nunca toca images.ygoprodeck.com (P-001).
    await app.register(fastifyStatic, {
      root: options.storagePath,
      prefix: '/images/',
      // Las imagenes de carta no cambian nunca: una vez cosechadas son
      // inmutables. Un ano de cache evita miles de peticiones condicionales.
      maxAge: '365d',
      immutable: true,
    });
  }

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

  await registerDeckRoutes(app, { decks: options.auth.decks });

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
