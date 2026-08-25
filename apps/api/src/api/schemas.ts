/**
 * Esquemas JSON de la API (ADR-007).
 *
 * NO SON DOCUMENTACION: Fastify los aplica. Al serializar una respuesta elimina
 * todo campo que no figure aqui, aunque la consulta lo haya traido.
 *
 * Eso convierte el invariante mas caro del proyecto en una garantia estructural:
 * `card_prints.image_source_url` apunta a `images.ygoprodeck.com`, y servirlo al
 * navegador es el hotlinking que castiga con lista negra de IP permanente
 * (P-001). Aqui no aparece, luego no puede salir.
 */

export const CARD_SUMMARY = {
  type: 'object',
  properties: {
    printId: { type: 'integer' },
    cardId: { type: 'integer' },
    game: { type: 'string' },
    name: { type: 'string' },
    typeLine: { type: ['string', 'null'] },
    setCode: { type: 'string' },
    setName: { type: 'string' },
    collectorNumber: { type: 'string' },
    rarity: { type: 'string' },
    // Ruta LOCAL, servida por nosotros. Jamas un dominio externo.
    imagePath: { type: ['string', 'null'] },
  },
} as const;

export const CARD_DETAIL = {
  type: 'object',
  properties: {
    ...CARD_SUMMARY.properties,
    rulesText: { type: ['string', 'null'] },
    gameData: { type: 'object', additionalProperties: true },
    releasedAt: { type: ['string', 'null'] },
    finishes: { type: 'array', items: { type: 'string' } },
    inBoosters: { type: 'boolean' },
  },
} as const;

export const LIST_GAMES = {
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: { code: { type: 'string' }, name: { type: 'string' } },
          },
        },
      },
    },
  },
} as const;

export const LIST_SETS = {
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
              id: { type: 'integer' },
              externalId: { type: 'string' },
              code: { type: 'string' },
              name: { type: 'string' },
              releasedAt: { type: ['string', 'null'] },
              cardCount: { type: 'integer' },
              // `iconUrl` NO se expone. `sets.icon_url` guarda la URL del
              // ORIGEN (images.ygoprodeck.com), y servirla al navegador es
              // exactamente el hotlinking que castiga con lista negra de IP
              // (P-001). El job image-harvest cubre las cartas pero no los
              // iconos de set; hasta que lo haga, este campo se queda dentro.
              // Ver P-022 y T-035.
              poolSize: { type: 'integer' },
            },
          },
        },
      },
    },
  },
} as const;

export const LIST_RARITIES = {
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
              code: { type: 'string' },
              label: { type: 'string' },
              tier: { type: 'integer' },
            },
          },
        },
      },
    },
  },
} as const;

export const SEARCH_CARDS = {
  querystring: {
    type: 'object',
    properties: {
      game: { type: 'string', enum: ['MTG', 'YGO', 'PTCG'] },
      set: { type: 'string', maxLength: 255 },
      rarity: { type: 'string', maxLength: 48 },
      q: { type: 'string', maxLength: 120 },
      cursor: { type: 'string', maxLength: 512 },
      // El tope de 100 no es cosmetico: sin el, un cliente podria pedir 100.000
      // filas y convertir una consulta barata en un problema de memoria.
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 40 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: { type: 'array', items: CARD_SUMMARY },
        nextCursor: { type: ['string', 'null'] },
      },
    },
  },
} as const;

export const GET_CARD = {
  params: {
    type: 'object',
    required: ['printId'],
    properties: { printId: { type: 'integer', minimum: 1 } },
  },
  response: {
    200: { type: 'object', properties: { data: CARD_DETAIL } },
    404: {
      type: 'object',
      properties: { error: { type: 'string' }, message: { type: 'string' } },
    },
  },
} as const;
