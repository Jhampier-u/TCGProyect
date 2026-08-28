import type { GameCode } from '@tcg/shared';

/** Una posicion del sobre, tal como la devuelve la base de datos. */
/**
 * Una entrada de la distribucion de un slot.
 *
 * `rarity` y `set` son EXCLUYENTES y ninguna entrada lleva las dos:
 *
 *  - `rarity`: una rareza del set que se esta abriendo. El caso de siempre.
 *  - `set`: el `sets.code` de OTRO set del que sale la carta (T-085). Existe
 *    porque hay productos reales que meten cartas ajenas al set en el sobre --
 *    The List de Magic es el caso -- y el motor solo sabia elegir dentro del
 *    pool `(set_id, rarity_id)` del set abierto. Sin esto, la carta de The List
 *    no era modelable y el sobre nunca podia parecerse al real (P-008).
 */
export interface SlotEntry {
  rarity?: string;
  set?: string;
  weight: number;
}

/** Filtros de carta que una slot puede exigir ademas de la rareza (T-085). */
export type CardFilter = 'basic_land';

export interface SlotConfig {
  slotIndex: number;
  distribution: SlotEntry[];
  foilChance: number;
  /**
   * Restringe los candidatos a un tipo de carta, ademas de por rareza.
   *
   * Existe por el slot de tierra de Magic: las tierras basicas son rareza
   * `common` en Scryfall, asi que un slot que pida `common` entrega cualquier
   * comun y el sobre no lleva la tierra que el producto real lleva (P-008).
   *
   * Es una lista cerrada a proposito, no un `type_line LIKE` libre: un filtro
   * con una errata no casaria con nada, vaciaria el slot y el respaldo lo
   * taparia sin un solo error -- exactamente la familia de fallo que este
   * proyecto lleva cuatro sesiones persiguiendo.
   */
  cardFilter?: CardFilter;
}

/** Plantilla resuelta: la propia del set, o la por defecto del juego. */
export interface TemplateConfig {
  templateId: number;
  game: GameCode;
  setId: number;
  name: string;
  cardCount: number;
  slots: SlotConfig[];
}

/** Una impresion candidata del pool. Solo lo imprescindible: el pool se precarga entero. */
export interface PoolEntry {
  printId: number;
  cardId: number;
  /** `cards.type_line` empieza por "Basic Land". Lo necesita `cardFilter`. */
  basicLand: boolean;
}

/** Pool del set, indexado por codigo de rareza. Ya filtrado por `in_boosters = 1`. */
export type SetPool = Map<string, PoolEntry[]>;

/** Una carta entregada por el sobre. */
export interface OpenedCard {
  slotIndex: number;
  printId: number;
  rarityCode: string;
  finish: string;
  /** Si era la primera copia que el usuario poseia de esa impresion y acabado. */
  isNew: boolean;
}

export interface PackOpening {
  openingId: number;
  seed: string;
  templateId: number;
  setId: number;
  openedAt: string;
  cards: OpenedCard[];
}

/** Acceso a datos del motor de sobres. Interfaz, no implementacion (ADR-006). */
export interface PackRepository {
  /** Plantilla del set, o la por defecto del juego si el set no tiene la suya. */
  findTemplate(setId: number): Promise<TemplateConfig | null>;
  /** Pool completo del set por rareza, filtrado por `in_boosters = 1`. */
  loadPool(setId: number): Promise<SetPool>;
  /**
   * Pool de un set nombrado por su `sets.code`, para las entradas de otro set
   * (T-085). Devuelve `null` si ese codigo no existe en el juego.
   *
   * SE PIDE POR CODIGO Y NO POR ID porque quien lo escribe es una migracion, y
   * un id numerico en un `distribution` seria imposible de leer y se rompería en
   * cuanto la base se sembrara en otro orden.
   */
  loadPoolByCode(game: GameCode, code: string): Promise<SetPool | null>;
  /** Rarezas del juego ordenadas por escasez ascendente. Para el respaldo de pool vacio. */
  rarityTiers(game: GameCode): Promise<Map<string, number>>;
  /** Cuantas copias posee ya el usuario de cada (impresion, acabado). */
  ownedQuantities(userId: number, printIds: number[]): Promise<Map<string, number>>;
  /** Persiste la apertura y actualiza la coleccion. Debe ser atomico. */
  persistOpening(input: PersistOpeningInput): Promise<number>;
  /** Reproduce una apertura leyendo lo persistido. NUNCA re-ejecuta el PRNG (P-005). */
  findOpening(openingId: number, userId: number): Promise<PackOpening | null>;
}

export interface PersistOpeningInput {
  userId: number;
  templateId: number;
  setId: number;
  seed: string;
  /** Configuracion vigente al abrir. Congela la plantilla (P-005). */
  templateSnapshot: TemplateConfig;
  cards: OpenedCard[];
}
