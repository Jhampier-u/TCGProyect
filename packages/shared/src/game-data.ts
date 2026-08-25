import type { GameCode } from './game.js';

/**
 * Perfiles de `cards.game_data`.
 *
 * ATENCION AL ESTILO DE NOMBRES: estas interfaces usan **snake_case**, al reves
 * que el resto del dominio. No es un descuido. `game_data` se serializa tal cual
 * a una columna JSON de MySQL, y el DDL indexa rutas concretas de ese JSON:
 *
 *   cmc   <- $.cmc      (columna generada, MTG)
 *   atk   <- $.atk      (columna generada, YGO)
 *   def   <- $.def      (columna generada, YGO)
 *   lvl   <- $.level    (columna generada, YGO)
 *   hp    <- $.hp       (columna generada, PTCG)
 *   idx_cards_mtg_colors <- $.colors  (indice multivaluado, MTG)
 *
 * Renombrar una de estas claves a camelCase romperia silenciosamente las columnas
 * generadas y el indice: seguirian existiendo, pero siempre valdrian NULL. Las
 * claves de aqui son un contrato con db/migrations/0001_initial_schema.up.sql.
 *
 * CONTRATO DE VALORES (ver 001Reportes/Tareas_Pendientes.md):
 *  - Los campos numericos se escriben como numero JSON o **se omiten**. Nunca
 *    "?", "X" ni "". Yu-Gi-Oh! devuelve `"atk": "?"` en cartas de ATK variable;
 *    normalizar eso es responsabilidad del adaptador (usar `toJsonNumber`).
 *  - `colors` es siempre un array o se omite. Un escalar romperia el indice
 *    multivaluado (usar `toStringArray`).
 */

/** Colores de Magic en la notacion de Scryfall. */
export type MtgColor = 'W' | 'U' | 'B' | 'R' | 'G';

export interface MtgGameData {
  mana_cost?: string;
  cmc?: number;
  colors?: MtgColor[];
  color_identity?: MtgColor[];
  /** Texto, no numero: Magic admite potencias como "*" o "1+*". */
  power?: string;
  toughness?: string;
  loyalty?: string;
  keywords?: string[];
  /** formato -> "legal" | "not_legal" | "banned" | "restricted" */
  legalities?: Record<string, string>;
}

export interface YgoBanlistInfo {
  ban_tcg?: string;
  ban_ocg?: string;
  ban_goat?: string;
}

export interface YgoGameData {
  attribute?: string;
  race?: string;
  /**
   * Para monstruos Xyz este campo contiene el RANGO, no el nivel: YGOPRODeck
   * reutiliza `level` para ambos y no expone `rank` por separado.
   */
  level?: number;
  rank?: number;
  link_val?: number;
  link_markers?: string[];
  /** Omitido cuando la API devuelve "?" (ATK variable). Ver `toJsonNumber`. */
  atk?: number;
  /** Omitido en monstruos Link, donde la API devuelve `null`. */
  def?: number;
  scale?: number;
  /** Arquetipo. Es el filtro mas usado al construir mazos de Yu-Gi-Oh!. */
  archetype?: string;
  banlist_info?: YgoBanlistInfo;
}

export interface PtcgAttack {
  name: string;
  cost?: string[];
  converted_energy_cost?: number;
  damage?: string;
  text?: string;
}

export interface PtcgWeakness {
  type: string;
  value: string;
}

export interface PtcgGameData {
  supertype?: string;
  subtypes?: string[];
  hp?: number;
  types?: string[];
  evolves_from?: string;
  attacks?: PtcgAttack[];
  weaknesses?: PtcgWeakness[];
  resistances?: PtcgWeakness[];
  retreat_cost?: string[];
  regulation_mark?: string;
}

/** Mapa juego -> perfil de game_data. Permite tipar el adaptador por juego. */
export interface GameDataByGame {
  MTG: MtgGameData;
  YGO: YgoGameData;
  PTCG: PtcgGameData;
}

/** Union de los tres perfiles, para cuando el juego no se conoce en tiempo de tipo. */
export type GameData = GameDataByGame[GameCode];
