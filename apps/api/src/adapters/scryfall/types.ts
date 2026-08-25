/**
 * Formas CRUDAS de la API de Scryfall.
 *
 * Verificado contra respuestas reales el 2026-08-25. Ojo: el endpoint
 * `/bulk-data` cambio respecto a lo documentado en S001. Ya NO expone
 * `download_uri` ni `size`, sino `jsonl_download_uri` y `compressed_size`, y el
 * fichero es JSONL comprimido en gzip, no un array JSON.
 */

export interface RawBulkData {
  type: string;
  name?: string;
  description?: string;
  updated_at?: string;
  compressed_size?: number;
  /** URI del volcado en formato JSONL comprimido (gzip). Host: data.scryfall.io */
  jsonl_download_uri: string;
}

export interface RawBulkDataList {
  data: RawBulkData[];
}

export interface RawSet {
  id: string;
  code: string;
  name: string;
  released_at?: string;
  card_count: number;
  set_type?: string;
  digital?: boolean;
  icon_svg_uri?: string;
}

export interface RawSetList {
  data: RawSet[];
  has_more?: boolean;
  next_page?: string;
}

export interface RawImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
}

/**
 * Una cara de carta. En layouts de doble cara (`transform`, `modal_dfc`,
 * `reversible_card`...) los campos que en una carta normal estan arriba viven
 * aqui: `mana_cost`, `colors`, `oracle_text`, `image_uris` e incluso `oracle_id`.
 */
export interface RawCardFace {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: RawImageUris;
  /** Presente solo en `reversible_card`, donde no hay oracle_id arriba. */
  oracle_id?: string;
}

export interface RawCard {
  /** UUID de la IMPRESION. Unico globalmente. */
  id: string;
  /**
   * UUID de la carta conceptual. AUSENTE en layout `reversible_card`, donde
   * cada cara lleva el suyo.
   */
  oracle_id?: string;
  name: string;
  lang?: string;
  layout?: string;
  /** Codigo del set, p.ej. "blb". Unico en Scryfall (verificado: 0 duplicados en 1048). */
  set: string;
  set_id?: string;
  collector_number: string;
  rarity: string;
  digital?: boolean;
  /**
   * `false` en cartas que NUNCA aparecen en un sobre: promos, buy-a-box,
   * Secret Lair, art series... Es el 54,7% de la muestra analizada. Ver P-014.
   */
  booster?: boolean;
  promo?: boolean;
  /** Ya viene como array: ["nonfoil","foil"], ["etched"]... */
  finishes?: string[];
  image_uris?: RawImageUris;
  card_faces?: RawCardFace[];

  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  keywords?: string[];
  legalities?: Record<string, string>;
}

export interface RawCardSearchResponse {
  data?: RawCard[];
  has_more?: boolean;
  next_page?: string;
  total_cards?: number;
}

/** Contrato minimo que el adaptador necesita de la capa HTTP. */
export interface ScryfallHttp {
  json<T>(url: string): Promise<T>;
  stream(url: string): Promise<AsyncIterable<Uint8Array>>;
}
