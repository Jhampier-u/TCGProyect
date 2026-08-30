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

/** Un valor de faceta con su recuento. */
const RECUENTO = {
  type: 'object',
  properties: { value: { type: 'string' }, count: { type: 'integer' } },
} as const;

export const CARD_SUMMARY = {
  type: 'object',
  properties: {
    printId: { type: 'integer' },
    cardId: { type: 'integer' },
    // Passcode en Yu-Gi-Oh!, que es lo que lleva un .ydk (T-048).
    oracleKey: { type: 'string' },
    game: { type: 'string' },
    name: { type: 'string' },
    typeLine: { type: ['string', 'null'] },
    setCode: { type: 'string' },
    setName: { type: 'string' },
    collectorNumber: { type: 'string' },
    rarity: { type: 'string' },
    // Ruta LOCAL, servida por nosotros. Jamas un dominio externo.
    imagePath: { type: ['string', 'null'] },
    // Facetas de Pokemon (T-092), nulas en los otros dos juegos.
    //
    // AQUI ES DONDE MUERDE ADR-007. El repositorio ya las devuelve; si no se
    // declaran, Fastify las descarta al serializar y la rejilla se queda sin
    // PS, sin tipo y sin marca **sin un solo error**. Es exactamente como se
    // perdio `cardId` durante tres hitos (P-024). Lo unico que lo impide es la
    // prueba que ejecuta `toSummary` y compara sus claves con estas.
    hp: { type: ['integer', 'null'] },
    supertype: { type: ['string', 'null'] },
    elemType: { type: ['string', 'null'] },
    regMark: { type: ['string', 'null'] },
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
              // T-069: si el set es un producto de sobres. Sale para que la
              // pagina de sobres no ofrezca abrir una caja de mazos (P-033).
              isOpenable: { type: 'boolean' },
              // `iconUrl` NO se expone, y no se expondra nunca:
              // `sets.icon_url` guarda la URL del ORIGEN
              // (images.ygoprodeck.com), y servirla al navegador es
              // exactamente el hotlinking que castiga con lista negra de IP
              // (P-001).
              //
              // Lo que si sale es `iconPath`, la ruta LOCAL del icono ya
              // cosechado y convertido a WebP por el mismo job que las cartas
              // (T-035). Es `null` mientras no se haya cosechado, que es la
              // otra mitad de P-022: hasta ahora no habia forma de ensenar un
              // icono sin incumplir P-001.
              iconPath: { type: ['string', 'null'] },
              poolSize: { type: 'integer' },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Las epocas del juego (T-090).
 *
 * ADR-007: todo campo que el front necesite tiene que estar declarado AQUI o
 * Fastify lo descarta sin un solo error. Son cuatro; los cuatro salen.
 */
export const LIST_ERAS = {
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
              name: { type: 'string' },
              from: { type: ['string', 'null'] },
              to: { type: ['string', 'null'] },
              isDefault: { type: 'boolean' },
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

/** Recuentos por faceta para el rail del catalogo (T-092). */
export const LIST_FACETS = {
  params: {
    type: 'object',
    required: ['game'],
    properties: { game: { type: 'string', enum: ['MTG', 'YGO', 'PTCG'] } },
  },
  querystring: {
    type: 'object',
    properties: { set: { type: 'string', maxLength: 255 } },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            types: { type: 'array', items: RECUENTO },
            supertypes: { type: 'array', items: RECUENTO },
            marks: { type: 'array', items: RECUENTO },
            withoutMark: { type: 'integer' },
            rarities: { type: 'array', items: RECUENTO },
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
      // Facetas de Pokemon (T-092). `additionalProperties: false` de abajo hace
      // que una query no declarada sea un 400, no un filtro que se ignora en
      // silencio: la superficie es exactamente la que se declara.
      type: { type: 'string', maxLength: 24 },
      supertype: { type: 'string', maxLength: 24 },
      mark: { type: 'string', maxLength: 16 },
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
