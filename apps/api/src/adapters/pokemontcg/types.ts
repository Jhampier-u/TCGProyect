/**
 * Formas CRUDAS de la API de Pokemon TCG v2.
 * Verificado contra respuestas reales el 2026-08-25.
 */

export interface RawSet {
  /** p.ej. "sv1". Unico. Es la clave por la que se filtran las cartas. */
  id: string;
  name: string;
  series?: string;
  /** Cartas impresas en el set segun la numeracion oficial. */
  printedTotal?: number;
  /** Total real, incluyendo secretas. Es el que interesa. */
  total?: number;
  ptcgoCode?: string;
  releaseDate?: string;
  updatedAt?: string;
  images?: { symbol?: string; logo?: string };
  legalities?: Record<string, string>;
}

export interface RawAttack {
  name: string;
  cost?: string[];
  convertedEnergyCost?: number;
  damage?: string;
  text?: string;
}

export interface RawWeakness {
  type: string;
  value: string;
}

export interface RawCard {
  /** p.ej. "sv1-8". Unico globalmente. */
  id: string;
  name: string;
  supertype?: string;
  subtypes?: string[];
  /** CADENA, no numero: la API devuelve "30". Ver `toJsonNumber`. */
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  attacks?: RawAttack[];
  weaknesses?: RawWeakness[];
  resistances?: RawWeakness[];
  /** camelCase en el origen; en `game_data` se persiste como `retreat_cost`. */
  retreatCost?: string[];
  convertedRetreatCost?: number;
  /** Texto de reglas de entrenadores y cartas especiales. */
  rules?: string[];
  regulationMark?: string;
  set: { id: string; name?: string };
  /** Numero de coleccionista impreso. */
  number: string;
  artist?: string;
  /** Ausente en algunas promos antiguas. */
  rarity?: string;
  flavorText?: string;
  images?: { small?: string; large?: string };
  legalities?: Record<string, string>;
}

export interface RawPaged<T> {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
}

/** Contrato minimo que el adaptador necesita de la capa HTTP. */
export interface PokemonHttp {
  json<T>(url: string, init?: { headers?: Record<string, string> }): Promise<T>;
}
