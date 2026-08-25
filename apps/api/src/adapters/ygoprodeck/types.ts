/**
 * Formas CRUDAS de la API de YGOPRODeck v7.
 *
 * Estos tipos describen lo que el origen devuelve de verdad, no lo que nos
 * gustaria que devolviese. Viven aqui, dentro del adaptador, y no cruzan hacia
 * el dominio: ese es todo el sentido de la capa anticorrupcion (ADR-003).
 *
 * Verificado contra respuestas reales el 2026-08-25.
 */

/** GET /api/v7/cardsets.php -> array plano, sin envoltorio. */
export interface RawSet {
  set_name: string;
  set_code: string;
  num_of_cards: number;
  /** Ausente en 2 de los 1032 sets (colaboraciones sin fecha de TCG). */
  tcg_date?: string;
  set_image?: string;
}

/**
 * Una impresion concreta dentro de `card_sets`.
 *
 * OJO: `card_sets` lista TODAS las impresiones de la carta en TODOS los sets,
 * no solo en el que se ha pedido. Hay que filtrar por `set_name`.
 */
export interface RawCardSet {
  set_name: string;
  /** p.ej. "SUDA-EN049". NO es unico dentro de un set: ver el adaptador. */
  set_code: string;
  /** Texto libre. Puede venir sucio: "PLatinum Secret Rare", "2", "3". */
  set_rarity: string;
  set_rarity_code?: string;
  set_price?: string;
}

export interface RawCardImage {
  id: number;
  image_url: string;
  image_url_small?: string;
  image_url_cropped?: string;
}

export interface RawBanlistInfo {
  ban_tcg?: string;
  ban_ocg?: string;
  ban_goat?: string;
}

export interface RawCard {
  id: number;
  name: string;
  type: string;
  humanReadableCardType?: string;
  frameType?: string;
  desc?: string;
  race?: string;
  attribute?: string;
  archetype?: string;
  /** Puede ser numero, la cadena "?" en monstruos de ATK variable, o faltar. */
  atk?: number | string | null;
  /** `null` en monstruos Link, que no tienen DEF. */
  def?: number | string | null;
  /** En monstruos Xyz contiene el RANGO. */
  level?: number | null;
  scale?: number | null;
  linkval?: number | null;
  linkmarkers?: string[];
  banlist_info?: RawBanlistInfo;
  card_sets?: RawCardSet[];
  card_images?: RawCardImage[];
}

export interface RawCardInfoResponse {
  data?: RawCard[];
  /** La API responde 400 con este campo cuando la consulta no encuentra nada. */
  error?: string;
}

/** Contrato minimo que el adaptador necesita de la capa HTTP. */
export interface JsonFetcher {
  json<T>(url: string): Promise<T>;
}
