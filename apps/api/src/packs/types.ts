import type { GameCode } from '@tcg/shared';

/** Una posicion del sobre, tal como la devuelve la base de datos. */
export interface SlotConfig {
  slotIndex: number;
  distribution: Array<{ rarity: string; weight: number }>;
  foilChance: number;
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
