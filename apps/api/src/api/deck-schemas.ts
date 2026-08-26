/**
 * Esquemas de las rutas de mazos.
 *
 * Fastify los APLICA: lo que no este declarado en `response` NO sale. Aqui eso
 * protege lo de siempre — `card_prints.image_source_url` no aparece, y por tanto
 * no puede filtrarse (P-001). `sets.icon_url` tampoco (P-022).
 */

const ERROR = {
  type: 'object',
  properties: { error: { type: 'string' }, message: { type: 'string' } },
} as const;

const COUNTS = {
  type: 'object',
  properties: {
    main: { type: 'integer' },
    extra: { type: 'integer' },
    side: { type: 'integer' },
    commander: { type: 'integer' },
  },
} as const;

const DECK_SUMMARY = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    game: { type: 'string' },
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    format: { type: ['string', 'null'] },
    isPublic: { type: 'boolean' },
    counts: COUNTS,
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

const DECK_CARD = {
  type: 'object',
  properties: {
    printId: { type: 'integer' },
    cardId: { type: 'integer' },
    // El cliente agrupa las copias por CARTA, no por impresion (RN-04). Sin
    // esto no puede reproducir la validacion del servidor.
    oracleKey: { type: 'string' },
    name: { type: 'string' },
    typeLine: { type: ['string', 'null'] },
    // Lleva la banlist de Yu-Gi-Oh! y el subtipo de las Energias de Pokemon.
    // Viaja igual que en CARD_DETAIL desde H3: los adaptadores construyen
    // game_data con lista blanca y ninguno de los tres perfiles contiene una
    // URL, asi que no abre el agujero de P-001.
    gameData: { type: 'object', additionalProperties: true },
    setCode: { type: 'string' },
    setName: { type: 'string' },
    collectorNumber: { type: 'string' },
    rarity: { type: 'string' },
    zone: { type: 'string' },
    quantity: { type: 'integer' },
    imagePath: { type: ['string', 'null'] },
    owned: { type: 'integer' },
  },
} as const;

const VALIDATION = {
  type: 'object',
  properties: {
    valid: { type: 'boolean' },
    counts: COUNTS,
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          oracleKey: { type: 'string' },
          cardName: { type: 'string' },
          zone: { type: 'string' },
          actual: { type: 'integer' },
          allowed: { type: 'integer' },
        },
      },
    },
  },
} as const;

const DECK_DETAIL = {
  type: 'object',
  properties: {
    ...DECK_SUMMARY.properties,
    cards: { type: 'array', items: DECK_CARD },
    validation: VALIDATION,
  },
} as const;

export const LIST_DECKS = {
  querystring: {
    type: 'object',
    properties: { game: { type: 'string', enum: ['MTG', 'YGO', 'PTCG'] } },
    additionalProperties: false,
  },
  response: {
    200: { type: 'object', properties: { data: { type: 'array', items: DECK_SUMMARY } } },
    401: ERROR,
  },
} as const;

export const CREATE_DECK = {
  body: {
    type: 'object',
    required: ['game', 'name'],
    properties: {
      game: { type: 'string', enum: ['MTG', 'YGO', 'PTCG'] },
      name: { type: 'string', minLength: 1, maxLength: 120 },
      description: { type: ['string', 'null'], maxLength: 2000 },
      format: { type: ['string', 'null'], maxLength: 32 },
      isPublic: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  response: {
    201: { type: 'object', properties: { data: DECK_SUMMARY } },
    400: ERROR,
    401: ERROR,
  },
} as const;

export const GET_DECK = {
  params: { type: 'object', properties: { id: { type: 'integer' } } },
  response: {
    200: { type: 'object', properties: { data: DECK_DETAIL } },
    401: ERROR,
    404: ERROR,
  },
} as const;

export const PATCH_DECK = {
  params: { type: 'object', properties: { id: { type: 'integer' } } },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      description: { type: ['string', 'null'], maxLength: 2000 },
      format: { type: ['string', 'null'], maxLength: 32 },
      isPublic: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  response: {
    200: { type: 'object', properties: { data: DECK_SUMMARY } },
    400: ERROR,
    401: ERROR,
    404: ERROR,
  },
} as const;

/** Tope de filas por peticion: un cuerpo enorme se rechaza antes de tocar la BD. */
export const MAX_DECK_CARD_ROWS = 400;

export const PUT_DECK_CARDS = {
  params: { type: 'object', properties: { id: { type: 'integer' } } },
  body: {
    type: 'object',
    required: ['cards'],
    properties: {
      cards: {
        type: 'array',
        maxItems: MAX_DECK_CARD_ROWS,
        items: {
          type: 'object',
          required: ['printId', 'zone', 'quantity'],
          properties: {
            printId: { type: 'integer', minimum: 1 },
            zone: { type: 'string', enum: ['main', 'extra', 'side', 'commander'] },
            // El CHECK de la tabla es BETWEEN 1 AND 99. El esquema lo repite
            // para que el error salga en la API y no como fallo de MySQL.
            quantity: { type: 'integer', minimum: 1, maximum: 99 },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  response: {
    200: { type: 'object', properties: { data: DECK_DETAIL } },
    400: ERROR,
    401: ERROR,
    404: ERROR,
    422: ERROR,
  },
} as const;

export const DELETE_DECK = {
  params: { type: 'object', properties: { id: { type: 'integer' } } },
  response: {
    200: {
      type: 'object',
      properties: { data: { type: 'object', properties: { id: { type: 'integer' } } } },
    },
    401: ERROR,
    404: ERROR,
  },
} as const;

/** Mismo tope que el PUT: un pegado enorme se rechaza antes de tocar la BD. */
export const RESOLVE_DECK = {
  body: {
    type: 'object',
    required: ['game', 'lines'],
    properties: {
      game: { type: 'string', enum: ['MTG', 'YGO', 'PTCG'] },
      lines: {
        type: 'array',
        maxItems: MAX_DECK_CARD_ROWS,
        items: {
          type: 'object',
          required: ['quantity', 'zone'],
          properties: {
            quantity: { type: 'integer', minimum: 1, maximum: 99 },
            zone: { type: 'string', enum: ['main', 'extra', 'side', 'commander'] },
            name: { type: 'string', maxLength: 255 },
            externalId: { type: 'string', maxLength: 64 },
            setCode: { type: 'string', maxLength: 16 },
            collectorNumber: { type: 'string', maxLength: 16 },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            resolved: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  printId: { type: 'integer' },
                  cardId: { type: 'integer' },
                  oracleKey: { type: 'string' },
                  name: { type: 'string' },
                  typeLine: { type: ['string', 'null'] },
                  gameData: { type: 'object', additionalProperties: true },
                  setCode: { type: 'string' },
                  collectorNumber: { type: 'string' },
                  rarity: { type: 'string' },
                  imagePath: { type: ['string', 'null'] },
                  zone: { type: 'string' },
                  quantity: { type: 'integer' },
                },
              },
            },
            unresolved: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: ['string', 'null'] },
                  externalId: { type: ['string', 'null'] },
                  quantity: { type: 'integer' },
                  zone: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    400: ERROR,
    401: ERROR,
  },
} as const;
