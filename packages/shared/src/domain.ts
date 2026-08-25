import type { GameCode } from './game.js';
import type { GameDataByGame } from './game-data.js';

/**
 * Modelo de DOMINIO. Es la frontera de la capa anticorrupcion (ADR-003):
 * ningun concepto de Scryfall, YGOPRODeck o Pokemon TCG cruza esta linea.
 *
 * Espejo de las tablas de db/migrations/0001_initial_schema.up.sql, en camelCase.
 * La unica excepcion es `gameData`, cuyas claves internas son snake_case por
 * contrato con las columnas generadas — ver game-data.ts.
 */

/** Una expansion. Corresponde a la tabla `sets`. */
export interface DomainSet {
  game: GameCode;
  /** Clave natural frente a la API de origen. Deduplica: UNIQUE (game_id, external_id). */
  externalId: string;
  code: string;
  name: string;
  /** ISO 8601 `YYYY-MM-DD`, o null si la API no lo expone. */
  releasedAt: string | null;
  /** Numero de cartas declarado por la API. Informativo: puede no cuadrar con lo ingestado. */
  cardCount: number;
  iconUrl: string | null;
}

/**
 * La carta CONCEPTUAL (el "oraculo"), no la impresion. Tabla `cards`.
 * Existe separada de la impresion porque las reglas de mazo se aplican por
 * nombre, sumando todas las impresiones (ver RN-04).
 */
export interface DomainCard<G extends GameCode = GameCode> {
  game: G;
  /**
   * Identidad conceptual estable. UNIQUE (game_id, oracle_key).
   *  - MTG:  `oracle_id` de Scryfall
   *  - YGO:  `id` de YGOPRODeck
   *  - PTCG: nombre normalizado (la API no expone un id conceptual)
   */
  oracleKey: string;
  name: string;
  typeLine: string | null;
  rulesText: string | null;
  gameData: GameDataByGame[G];
}

/**
 * La impresion concreta dentro de un set. Tabla `card_prints`.
 * Es la unidad que entrega un sobre y la que referencia una coleccion o un mazo.
 */
export interface DomainPrint<G extends GameCode = GameCode> {
  card: DomainCard<G>;
  /** `externalId` del set al que pertenece. El servicio de ingesta lo resuelve a set_id. */
  setExternalId: string;
  /** Clave natural de la impresion. UNIQUE (set_id, external_id). */
  externalId: string;
  collectorNumber: string;
  /** Codigo normalizado (`rarities.code`). Producto de `normalizeRarityCode`. */
  rarityCode: string;
  /** Cadena LITERAL de la API (`rarities.label`). Se conserva sin tocar para poder auditar. */
  rarityLabel: string;
  /**
   * URL de origen de la imagen. SOLO la usa el job `image-harvest` (T-014) para
   * descargarla una vez. NUNCA se sirve al frontend: YGOPRODeck aplica blacklist
   * de IP por hotlinking, y por uniformidad la regla vale para los tres juegos
   * (ver P-001).
   */
  imageSourceUrl: string | null;
  /** p.ej. ["nonfoil","foil"], ["normal","reverse"], ["holo"]. */
  finishes: string[];
}

/** Un peso de rareza dentro de un slot. Espejo de `pack_slots.distribution`. */
export interface RarityWeight {
  /** Debe existir como `rarities.code` del mismo juego. */
  rarity: string;
  /** Entero. Por convencion los pesos de un slot suman 1000 (el motor normaliza igualmente). */
  weight: number;
}

/** Una posicion del sobre. Espejo de la tabla `pack_slots`. */
export interface PackSlotSpec {
  slotIndex: number;
  distribution: RarityWeight[];
  /** 0..1. Probabilidad de que la carta de este slot salga en foil. */
  foilChance: number;
}

/**
 * Configuracion de un sobre. Espejo de `pack_templates` + `pack_slots`.
 * ADR-005: esto son DATOS, no codigo. El motor de sobres no contiene ni una
 * regla de ningun juego; solo resuelve estos pesos.
 */
export interface PackTemplateSpec {
  game: GameCode;
  /** `externalId` del set, o null para la plantilla por defecto del juego. */
  setExternalId: string | null;
  name: string;
  cardCount: number;
  isDefault: boolean;
  slots: PackSlotSpec[];
}
