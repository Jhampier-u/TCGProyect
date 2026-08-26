/**
 * Esquemas de las rutas de cuenta, sobres y coleccion.
 *
 * Igual que en `schemas.ts`, Fastify los APLICA. Aqui eso protege dos cosas
 * distintas:
 *  - `users.password_hash` no aparece en ninguna respuesta, luego no puede salir.
 *  - `card_prints.image_source_url` tampoco (P-001), ni siquiera en el resultado
 *    de abrir un sobre, que es donde mas cartas se serializan de golpe.
 */

const USER = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    email: { type: 'string' },
    displayName: { type: 'string' },
  },
} as const;

const ERROR = {
  type: 'object',
  properties: { error: { type: 'string' }, message: { type: 'string' } },
} as const;

export const REGISTER = {
  body: {
    type: 'object',
    required: ['email', 'displayName', 'password'],
    properties: {
      email: { type: 'string', format: 'email', maxLength: 190 },
      displayName: { type: 'string', minLength: 2, maxLength: 64 },
      // El maximo no es cosmetico: sin el, alguien envia 10 MB y obliga al
      // servidor a hashearlos con Argon2id. Denegacion de servicio barata.
      password: { type: 'string', minLength: 10, maxLength: 200 },
    },
    additionalProperties: false,
  },
  response: {
    201: { type: 'object', properties: { data: USER, token: { type: 'string' } } },
    409: ERROR,
    400: ERROR,
  },
} as const;

export const LOGIN = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', maxLength: 190 },
      password: { type: 'string', maxLength: 200 },
    },
    additionalProperties: false,
  },
  response: {
    200: { type: 'object', properties: { data: USER, token: { type: 'string' } } },
    401: ERROR,
  },
} as const;

export const ME = {
  response: { 200: { type: 'object', properties: { data: USER } }, 401: ERROR },
} as const;

const OPENED_CARD = {
  type: 'object',
  properties: {
    slotIndex: { type: 'integer' },
    printId: { type: 'integer' },
    cardId: { type: 'integer' },
    name: { type: 'string' },
    rarity: { type: 'string' },
    finish: { type: 'string' },
    isNew: { type: 'boolean' },
    imagePath: { type: ['string', 'null'] },
  },
} as const;

export const OPEN_PACK = {
  body: {
    type: 'object',
    required: ['setId'],
    properties: {
      setId: { type: 'integer', minimum: 1 },
      // Sin tope, un cliente pide 10.000 sobres en una peticion y monopoliza la
      // base de datos. El frontend abre de uno en uno o en cajas de 24/36.
      count: { type: 'integer', minimum: 1, maximum: 36, default: 1 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              openingId: { type: 'integer' },
              seed: { type: 'string' },
              setId: { type: 'integer' },
              cards: { type: 'array', items: OPENED_CARD },
            },
          },
        },
      },
    },
    401: ERROR,
    404: ERROR,
    409: ERROR,
    422: ERROR,
  },
} as const;

export const GET_OPENING = {
  params: {
    type: 'object',
    required: ['openingId'],
    properties: { openingId: { type: 'integer', minimum: 1 } },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            openingId: { type: 'integer' },
            seed: { type: 'string' },
            setId: { type: 'integer' },
            openedAt: { type: 'string' },
            cards: { type: 'array', items: OPENED_CARD },
          },
        },
      },
    },
    401: ERROR,
    404: ERROR,
  },
} as const;

export const LIST_COLLECTION = {
  querystring: {
    type: 'object',
    properties: {
      game: { type: 'string', enum: ['MTG', 'YGO', 'PTCG'] },
      cursor: { type: 'string', maxLength: 512 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 40 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              printId: { type: 'integer' },
              cardId: { type: 'integer' },
              name: { type: 'string' },
              setCode: { type: 'string' },
              setName: { type: 'string' },
              collectorNumber: { type: 'string' },
              rarity: { type: 'string' },
              finish: { type: 'string' },
              quantity: { type: 'integer' },
              imagePath: { type: ['string', 'null'] },
              firstObtainedAt: { type: 'string' },
            },
          },
        },
        nextCursor: { type: ['string', 'null'] },
      },
    },
    401: ERROR,
  },
} as const;

export const COLLECTION_COMPLETION = {
  params: {
    type: 'object',
    required: ['game'],
    properties: { game: { type: 'string', enum: ['MTG', 'YGO', 'PTCG'] } },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              setExternalId: { type: 'string' },
              setCode: { type: 'string' },
              setName: { type: 'string' },
              // Ruta LOCAL del icono (T-035, T-066). `icon_url` -- la del
              // origen -- no sale de aqui ni de ningun otro sitio (P-022).
              iconPath: { type: ['string', 'null'] },
              poolSize: { type: 'integer' },
              owned: { type: 'integer' },
              ratio: { type: 'number' },
            },
          },
        },
      },
    },
    401: ERROR,
  },
} as const;

export const COLLECTION_SUMMARY = {
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            entries: { type: 'integer' },
            copies: { type: 'integer' },
            openings: { type: 'integer' },
          },
        },
      },
    },
    401: ERROR,
  },
} as const;
