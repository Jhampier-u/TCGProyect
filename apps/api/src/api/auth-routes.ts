import type { FastifyInstance } from 'fastify';
import type { GameCode } from '@tcg/shared';
import {
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from '../auth/password.js';
import { EmailAlreadyExistsError, type UserRepository } from '../auth/user-repository.js';
import type { CollectionRepository } from '../db/collection-repository.js';
import type { CatalogQueryRepository } from '../db/catalog-query-repository.js';
import { exigirUsuario, usuarioDe } from './require-user.js';
import { DuplicateSeedError, EmptyPoolError, NoTemplateError, type PackService } from '../packs/index.js';
import {
  COLLECTION_COMPLETION,
  COLLECTION_SUMMARY,
  GET_OPENING,
  LIST_COLLECTION,
  LOGIN,
  ME,
  OPEN_PACK,
  REGISTER,
} from './auth-schemas.js';

export interface AuthRoutesOptions {
  users: UserRepository;
  collection: CollectionRepository;
  catalog: CatalogQueryRepository;
  packs: PackService;
}

/**
 * Mensaje unico para todos los fallos de login.
 *
 * No distingue "ese correo no existe" de "la contrasena es incorrecta". Decirlo
 * convertiria el login en un comprobador de correos registrados, que es el paso
 * previo a cualquier ataque dirigido.
 */
const CREDENCIALES_INVALIDAS = 'Correo o contrasena incorrectos';

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRoutesOptions,
): Promise<void> {
  const { users, collection, catalog, packs } = options;

  // ------------------------------------------------------------------ cuentas

  app.post<{ Body: { email: string; displayName: string; password: string } }>(
    '/api/auth/register',
    {
      schema: REGISTER,
      // T-062. Cada registro paga un Argon2id con los parametros de OWASP: 19
      // MiB de memoria y 2 iteraciones. Sin limite propio, el tope global de
      // 300/min permite 18.000 hashes de 19 MiB por hora, que es una
      // denegacion de servicio barata contra el recurso mas caro del servidor.
      //
      // Son 20 y no menos porque hay IPs compartidas de sobra -- un aula, una
      // oficina, una red movil con NAT -- y cinco cuentas por hora dejaria
      // fuera a gente legitima.
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const problema = validatePassword(request.body.password);
      if (problema) {
        return reply.code(400).send({ error: 'invalid_password', message: problema });
      }

      try {
        const user = await users.create(
          email,
          request.body.displayName.trim(),
          await hashPassword(request.body.password),
        );
        return reply.code(201).send({ data: user, token: signToken(app, user.id) });
      } catch (error) {
        if (error instanceof EmailAlreadyExistsError) {
          // Aqui SI se admite que el correo existe: en un registro es
          // inevitable, porque el usuario necesita saber que ya tiene cuenta.
          // El login, que es el vector real, no lo revela.
          return reply
            .code(409)
            .send({ error: 'email_taken', message: 'Ya existe una cuenta con ese correo' });
        }
        throw error;
      }
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/api/auth/login',
    {
      schema: LOGIN,
      // Limite de intentos POR RUTA. Argon2id encarece cada intento, pero no
      // impide probar millones: eso lo hace esto.
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const user = await users.findByEmail(email);

      // Se verifica SIEMPRE, incluso sin usuario: `verifyPassword` gasta el mismo
      // tiempo contra un hash señuelo. Sin eso, el tiempo de respuesta delata
      // que correos estan registrados.
      const ok = await verifyPassword(request.body.password, user?.passwordHash ?? null);
      if (!user || !ok) {
        return reply.code(401).send({ error: 'invalid_credentials', message: CREDENCIALES_INVALIDAS });
      }

      return reply.send({
        data: { id: user.id, email: user.email, displayName: user.displayName },
        token: signToken(app, user.id),
      });
    },
  );

  app.get('/api/auth/me', { schema: ME, preValidation: exigirUsuario }, async (request, reply) => {
    const auth = usuarioDe(request);

    const user = await users.findById(auth.id);
    if (!user) {
      // El token es valido pero la cuenta ya no existe.
      return reply.code(401).send({ error: 'unauthorized', message: 'La cuenta ya no existe' });
    }
    return reply.send({ data: user });
  });

  // ------------------------------------------------------------------- sobres

  app.post<{ Body: { setId: number; count?: number } }>(
    '/api/packs/open',
    {
      schema: OPEN_PACK,
      preValidation: exigirUsuario,
      // Abre hasta 24 sobres por peticion, y cada uno escribe en
      // pack_openings, pack_opening_cards y user_collection (T-062).
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const auth = usuarioDe(request);

      // El userId sale del TOKEN, jamas del cuerpo de la peticion. Aceptarlo del
      // cliente seria una referencia directa a objetos: cualquiera podria abrir
      // sobres en la cuenta de otro.
      const { setId } = request.body;
      const count = request.body.count ?? 1;
      const resultados = [];

      try {
        for (let i = 0; i < count; i += 1) {
          const opening = await packs.open(auth.id, setId);
          resultados.push(await enrich(catalog, opening));
        }
      } catch (error) {
        if (error instanceof NoTemplateError) {
          return reply.code(404).send({ error: 'no_template', message: error.message });
        }
        if (error instanceof EmptyPoolError) {
          // 422 y no 404: el set existe, pero no se puede abrir. Ocurre de verdad
          // con los sets 100% promocionales (P-014).
          return reply.code(422).send({ error: 'empty_pool', message: error.message });
        }
        if (error instanceof DuplicateSeedError) {
          return reply.code(409).send({ error: 'duplicate_seed', message: error.message });
        }
        throw error;
      }

      return reply.send({ data: resultados });
    },
  );

  app.get<{ Params: { openingId: number } }>(
    '/api/packs/openings/:openingId',
    { schema: GET_OPENING, preValidation: exigirUsuario },
    async (request, reply) => {
      const auth = usuarioDe(request);

      // `replay` filtra por user_id: una apertura ajena responde 404, no 403.
      // Un 403 confirmaria que esa apertura existe.
      const opening = await packs.replay(request.params.openingId, auth.id);
      if (!opening) {
        return reply.code(404).send({ error: 'not_found', message: 'Apertura no encontrada' });
      }
      return reply.send({ data: await enrich(catalog, opening) });
    },
  );

  // --------------------------------------------------------------- coleccion

  app.get<{ Querystring: { game?: GameCode; cursor?: string; limit?: number } }>(
    '/api/collection',
    { schema: LIST_COLLECTION, preValidation: exigirUsuario },
    async (request, reply) => {
      const auth = usuarioDe(request);
      const page = await collection.list(auth.id, request.query);
      return reply.send({ data: page.items, nextCursor: page.nextCursor });
    },
  );

  app.get<{ Params: { game: GameCode } }>(
    '/api/collection/completion/:game',
    { schema: COLLECTION_COMPLETION, preValidation: exigirUsuario },
    async (request, reply) => {
      const auth = usuarioDe(request);
      return reply.send({ data: await collection.completion(auth.id, request.params.game) });
    },
  );

  app.get('/api/collection/summary', { schema: COLLECTION_SUMMARY, preValidation: exigirUsuario }, async (request, reply) => {
    const auth = usuarioDe(request);
    return reply.send({ data: await collection.summary(auth.id) });
  });
}

function signToken(app: FastifyInstance, userId: number): string {
  // `sub` como cadena: es lo que dice el estandar JWT y evita sorpresas con
  // librerias que tratan los numericos de otra forma.
  return app.jwt.sign({ sub: String(userId) });
}

/**
 * Anade nombre e imagen a las cartas de una apertura.
 *
 * El motor devuelve identificadores porque su trabajo es elegir cartas, no
 * describirlas. La API es quien las presenta.
 */
async function enrich(
  catalog: CatalogQueryRepository,
  opening: { openingId: number; seed: string; setId: number; openedAt?: string; cards: Array<{ slotIndex: number; printId: number; rarityCode: string; finish: string; isNew: boolean }> },
): Promise<unknown> {
  const cards = await Promise.all(
    opening.cards.map(async (c) => {
      const detalle = await catalog.findCard(c.printId);
      return {
        slotIndex: c.slotIndex,
        printId: c.printId,
        cardId: detalle?.cardId ?? 0,
        name: detalle?.name ?? '(desconocida)',
        rarity: c.rarityCode,
        finish: c.finish,
        isNew: c.isNew,
        imagePath: detalle?.imagePath ?? null,
      };
    }),
  );

  return {
    openingId: opening.openingId,
    seed: opening.seed,
    setId: opening.setId,
    openedAt: opening.openedAt,
    cards,
  };
}
