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

import { FACET_KEYS, ROW_FIELDS, ROW_FIELD_KIND } from '@tcg/shared';

/** Un valor de faceta con su recuento. */
const RECUENTO = {
  type: 'object',
  properties: {
    value: { type: 'string' },
    count: { type: 'integer' },
    // Cuantas tiene el usuario (T-093). Nulo sin sesion, que no es un cero.
    owned: { type: ['integer', 'null'] },
  },
} as const;

/**
 * Lo que una fila lleva bajo `facetas`: la UNION de los datos de fila de los
 * tres perfiles (H9f). ADR-007 sigue mordiendo: un dato que falte aqui Fastify
 * lo tira sin decir nada. La prueba de P-024 compara esta lista con los perfiles.
 */
const FACETAS_DE_FILA = {
  type: 'object',
  properties: Object.fromEntries(
    ROW_FIELDS.map((f) => [f, { type: ROW_FIELD_KIND[f] === 'int' ? ['integer', 'null'] : ['string', 'null'] }]),
  ) as Record<(typeof ROW_FIELDS)[number], { type: string[] }>,
} as const;

/** Cada clave de faceta como parametro plano de la URL (`?color=U&kind=creature`). */
const PARAMETROS_DE_FACETA = Object.fromEntries(
  FACET_KEYS.map((k) => [k, { type: 'string', maxLength: 32 }]),
) as Record<(typeof FACET_KEYS)[number], { type: 'string'; maxLength: number }>;

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
    // Los datos de las celdas de la fila, por juego (H9f). Antes eran cuatro
    // campos planos de Pokemon; ahora es la union de los tres perfiles.
    facetas: FACETAS_DE_FILA,
    // Si quien mira la tiene (T-093). Nulo sin sesion y en la ficha.
    owned: { type: ['boolean', 'null'] },
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
              palette: {
                type: ['object', 'null'],
                // El mismo formato que exige `paletaValida` en el repositorio: el
                // contrato lo dice aunque la serializacion no lo compruebe.
                properties: {
                  primario: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
                  secundario: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
                },
                required: ['primario', 'secundario'],
                additionalProperties: false,
              },
              artKey: { type: ['string', 'null'] },
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
            facetas: {
              type: 'object',
              properties: Object.fromEntries(FACET_KEYS.map((k) => [k, { type: 'array', items: RECUENTO }])),
            },
            rarities: { type: 'array', items: RECUENTO },
            total: { type: 'integer' },
            ownedTotal: { type: ['integer', 'null'] },
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
      // Las facetas de los tres juegos (H9f). El esquema admite la UNION; que
      // la clave sea del juego pedido lo comprueba la ruta y contesta 400.
      // `additionalProperties: false` sigue haciendo 400 de lo que no es de
      // ninguno.
      ...PARAMETROS_DE_FACETA,
      // Las que tengo o las que me faltan (T-093). Exige sesion: el usuario
      // sale del token, y por eso aqui no hay ningun `userId` que declarar.
      owned: { type: 'string', enum: ['yes', 'no'] },
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
