import type { FastifyInstance } from 'fastify';
import type { DeckEntry, DeckValidation, GameCode } from '@tcg/shared';
import { validateDeck } from '@tcg/shared';
import type {
  DeckCardInput,
  DeckDetail,
  DeckLineInput,
  DeckRepository,
} from '../db/deck-repository.js';
import { exigirUsuario, usuarioDe } from './require-user.js';
import {
  CREATE_DECK,
  DELETE_DECK,
  GET_DECK,
  LIST_DECKS,
  PATCH_DECK,
  PUT_DECK_CARDS,
  RESOLVE_DECK,
} from './deck-schemas.js';

export interface DeckRoutesOptions {
  decks: DeckRepository;
}

const NO_ENCONTRADO = { error: 'not_found', message: 'El mazo no existe' };

/**
 * Traduce el mazo leido a la entrada del motor de reglas.
 *
 * El motor agrupa por NOMBRE desde P-027: dos impresiones distintas de la misma
 * carta llegan como dos entradas y cuentan como UNA. `oracleKey` viaja para que
 * los problemas puedan referenciar la carta, no como clave de agrupacion.
 */
function toEntries(detalle: DeckDetail): DeckEntry[] {
  return detalle.cards.map((card) => ({
    oracleKey: card.oracleKey,
    name: card.name,
    typeLine: card.typeLine,
    gameData: card.gameData,
    zone: card.zone,
    quantity: card.quantity,
  }));
}

/**
 * La validacion se DERIVA en cada lectura, nunca se guarda.
 *
 * Un informe persistido queda obsoleto en cuanto cambia la banlist ingestada, y
 * nadie se entera: el mazo seguiria diciendo que es legal (D4 del spec).
 */
function withValidation(detalle: DeckDetail): DeckDetail & { validation: DeckValidation } {
  return { ...detalle, validation: validateDeck(detalle.game, toEntries(detalle)) };
}

export async function registerDeckRoutes(
  app: FastifyInstance,
  options: DeckRoutesOptions,
): Promise<void> {
  const { decks } = options;

  // ENCAPSULADO a proposito (T-051). Las seis rutas de mazos son autenticadas,
  // asi que el hook se registra una vez para todas. Sin este `register`, el
  // hook se aplicaria a TODO el servidor: el catalogo publico dejaria de serlo
  // y el propio login exigiria estar logueado.
  await app.register(async (scope) => {
    scope.addHook('preValidation', exigirUsuario);

    scope.get<{ Querystring: { game?: GameCode } }>(
    '/api/decks',
    { schema: LIST_DECKS },
    async (request, reply) => {
      const user = usuarioDe(request);
      return { data: await decks.listByUser(user.id, request.query.game) };
    },
  );

    scope.post<{
    Body: {
      game: GameCode;
      name: string;
      description?: string | null;
      format?: string | null;
      isPublic?: boolean;
    };
  }>('/api/decks', { schema: CREATE_DECK }, async (request, reply) => {
    const user = usuarioDe(request);
    const mazo = await decks.create(user.id, request.body);
    return reply.code(201).send({ data: mazo });
  });

  // Se registra ANTES de `/api/decks/:id`: si no, Fastify intentaria leer
  // "resolve" como un id de mazo.
    scope.post<{ Body: { game: GameCode; lines: DeckLineInput[] } }>(
    '/api/decks/resolve',
    {
      schema: RESOLVE_DECK,
      // Hasta 400 lineas resueltas contra el catalogo por peticion (T-062).
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const user = usuarioDe(request);
      // No muta nada: resolver es una consulta. El cliente decide que hace con
      // el resultado y guarda cuando quiere (D5 del spec de H7).
      return { data: await decks.resolveLines(request.body.game, request.body.lines) };
    },
  );

    scope.get<{ Params: { id: number } }>(
    '/api/decks/:id',
    { schema: GET_DECK },
    async (request, reply) => {
      const user = usuarioDe(request);
      const detalle = await decks.findById(request.params.id, user.id);
      // 404 y no 403: decir "existe pero no es tuyo" convierte la API en un
      // enumerador de identificadores (D6 del spec).
      if (!detalle) return reply.code(404).send(NO_ENCONTRADO);
      return { data: withValidation(detalle) };
    },
  );

    scope.patch<{
    Params: { id: number };
    Body: {
      name?: string;
      description?: string | null;
      format?: string | null;
      isPublic?: boolean;
    };
  }>('/api/decks/:id', { schema: PATCH_DECK }, async (request, reply) => {
    const user = usuarioDe(request);
    const mazo = await decks.updateHeader(request.params.id, user.id, request.body);
    if (!mazo) return reply.code(404).send(NO_ENCONTRADO);
    return { data: mazo };
  });

    scope.put<{ Params: { id: number }; Body: { cards: DeckCardInput[] } }>(
    '/api/decks/:id/cards',
    {
      schema: PUT_DECK_CARDS,
      // Hasta 400 filas por peticion, borradas e insertadas en transaccion
      // (T-062).
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const user = usuarioDe(request);

      const actual = await decks.findById(request.params.id, user.id);
      if (!actual) return reply.code(404).send(NO_ENCONTRADO);

      const { cards } = request.body;
      const ids = [...new Set(cards.map((card) => card.printId))];
      const resueltas = await decks.resolvePrints(ids);
      const porId = new Map(resueltas.map((p) => [p.printId, p.game]));

      // Se distingue "no existe" de "es de otro juego" a proposito: son dos
      // errores del cliente distintos y confundirlos hace imposible depurar.
      const desconocida = ids.find((id) => !porId.has(id));
      if (desconocida !== undefined) {
        return reply.code(422).send({
          error: 'unknown_print',
          message: `La impresion ${desconocida} no existe en el catalogo`,
        });
      }

      const ajena = ids.find((id) => porId.get(id) !== actual.game);
      if (ajena !== undefined) {
        return reply.code(422).send({
          error: 'game_mismatch',
          message: `La impresion ${ajena} no es de ${actual.game}`,
        });
      }

      const ok = await decks.replaceCards(request.params.id, user.id, cards);
      if (!ok) return reply.code(404).send(NO_ENCONTRADO);

      const detalle = await decks.findById(request.params.id, user.id);
      if (!detalle) return reply.code(404).send(NO_ENCONTRADO);
      return { data: withValidation(detalle) };
    },
  );

    scope.delete<{ Params: { id: number } }>(
    '/api/decks/:id',
    { schema: DELETE_DECK },
    async (request, reply) => {
      const user = usuarioDe(request);
      const borrado = await decks.remove(request.params.id, user.id);
      if (!borrado) return reply.code(404).send(NO_ENCONTRADO);
      return { data: { id: request.params.id } };
    },
  );
  });
}
