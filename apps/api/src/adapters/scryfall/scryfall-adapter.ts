import {
  FALLBACK_RARITY_CODE,
  normalizeRarityCode,
  stripUndefined,
  toJsonNumber,
  toStringArray,
  type DomainCard,
  type DomainPrint,
  type DomainSet,
  type GameAdapter,
  type IngestWarningSink,
  type MtgColor,
  type MtgGameData,
  type PackTemplateSpec,
} from '@tcg/shared';
import { gunzipJsonObjects } from './jsonl.js';
import type {
  RawBulkDataList,
  RawCard,
  RawCardFace,
  RawCardSearchResponse,
  RawSet,
  RawSetList,
  ScryfallHttp,
} from './types.js';

const BASE = 'https://api.scryfall.com';

export interface ScryfallAdapterOptions {
  onWarning?: IngestWarningSink;
  /** Tipo de volcado a usar en la carga masiva. Por defecto el recomendado. */
  bulkType?: string;
}

/**
 * Adaptador de Scryfall. Implementa T-011.
 *
 * Ofrece DOS caminos de ingesta, y esa dualidad es deliberada:
 *
 *  - `fetchAllPrints()` — carga inicial. Descarga el volcado `default_cards` y
 *    lo procesa en streaming. **Dos peticiones** para todo el catalogo (~100k
 *    impresiones) en lugar de ~600 paginadas.
 *  - `fetchPrints(set)` — camino incremental. Usa el buscador paginado. Es lo
 *    correcto cuando sale un set nuevo y no compensa releer 74 MB.
 *
 * Notas sobre el origen:
 *  - En cartas de doble cara los campos viven en `card_faces[0]`, no arriba.
 *  - El layout `reversible_card` NO trae `oracle_id` de nivel superior.
 *  - Los codigos de set son unicos (0 duplicados en 1048), asi que sirven como
 *    clave natural — al reves que en Yu-Gi-Oh! (ver P-013).
 */
export class ScryfallAdapter implements GameAdapter<'MTG'> {
  readonly game = 'MTG' as const;

  readonly #http: ScryfallHttp;
  readonly #warn: IngestWarningSink;
  readonly #bulkType: string;

  constructor(http: ScryfallHttp, options: ScryfallAdapterOptions = {}) {
    this.#http = http;
    this.#warn = options.onWarning ?? (() => {});
    this.#bulkType = options.bulkType ?? 'default_cards';
  }

  async *fetchSets(): AsyncIterable<DomainSet> {
    let url: string | undefined = `${BASE}/sets`;

    while (url) {
      const page: RawSetList = await this.#http.json<RawSetList>(url);
      for (const set of page.data ?? []) yield toDomainSet(set);
      url = page.has_more ? page.next_page : undefined;
    }
  }

  /**
   * Camino INCREMENTAL: buscador paginado, 175 cartas por pagina.
   *
   * `unique=prints` es imprescindible: sin el, Scryfall colapsa las reimpresiones
   * y perderiamos justo las impresiones que un sobre entrega.
   */
  async *fetchPrints(set: DomainSet): AsyncIterable<DomainPrint<'MTG'>> {
    const query = `set:${set.externalId}`;
    let url: string | undefined =
      `${BASE}/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=set&include_extras=true`;

    while (url) {
      let page: RawCardSearchResponse;
      try {
        page = await this.#http.json<RawCardSearchResponse>(url);
      } catch (error) {
        // Scryfall responde 404 cuando una busqueda no devuelve nada. Para un set
        // vacio eso es legitimo, no una averia.
        if (isHttpStatus(error, 404)) {
          this.#warn({
            game: 'MTG',
            subject: set.externalId,
            code: 'malformed_field',
            message: `El set no devolvio cartas (HTTP 404): ${set.externalId}`,
          });
          return;
        }
        throw error;
      }

      for (const raw of page.data ?? []) yield this.#toDomainPrint(raw);
      url = page.has_more ? page.next_page : undefined;
    }
  }

  /**
   * Camino de CARGA INICIAL: volcado completo en streaming.
   *
   * No forma parte de `GameAdapter` porque no todos los origenes ofrecen volcado
   * (Pokemon TCG solo pagina). El servicio de ingesta comprueba la capacidad con
   * `supportsBulk()` y usa este camino cuando existe.
   */
  async *fetchAllPrints(): AsyncIterable<DomainPrint<'MTG'>> {
    const catalog = await this.#http.json<RawBulkDataList>(`${BASE}/bulk-data`);
    const entry = (catalog.data ?? []).find((b) => b.type === this.#bulkType);

    if (!entry?.jsonl_download_uri) {
      throw new Error(
        `Scryfall no ofrece el volcado '${this.#bulkType}'. Disponibles: ` +
          (catalog.data ?? []).map((b) => b.type).join(', '),
      );
    }

    const bytes = await this.#http.stream(entry.jsonl_download_uri);

    for await (const raw of gunzipJsonObjects<RawCard>(bytes, (line, error) => {
      this.#warn({
        game: 'MTG',
        subject: line,
        code: 'malformed_field',
        message: `Linea JSONL ilegible en el volcado: ${error.message}`,
      });
    })) {
      yield this.#toDomainPrint(raw);
    }
  }

  supportsBulk(): boolean {
    return true;
  }

  /** Las plantillas por defecto de MTG ya estan sembradas (migracion 0003). */
  defaultPackTemplate(): PackTemplateSpec | null {
    return null;
  }

  // ------------------------------------------------------------------

  #toDomainPrint(raw: RawCard): DomainPrint<'MTG'> {
    const rarityCode = this.#resolveRarity(raw);
    const imageSourceUrl = imageOf(raw);

    if (imageSourceUrl === null) {
      this.#warn({
        game: 'MTG',
        subject: raw.id,
        code: 'missing_image',
        message: `Sin imagen de origen para ${raw.name} (${raw.set})`,
      });
    }

    return {
      card: this.#toDomainCard(raw),
      setExternalId: raw.set,
      // El id de Scryfall es un UUID unico globalmente: no hace falta componer
      // la clave con la rareza como en Yu-Gi-Oh! (P-013).
      externalId: raw.id,
      collectorNumber: raw.collector_number.slice(0, 16),
      rarityCode,
      rarityLabel: raw.rarity,
      imageSourceUrl,
      finishes: raw.finishes && raw.finishes.length > 0 ? raw.finishes : ['nonfoil'],
      // Dato REAL del origen (P-014). El 54,7% de las impresiones del volcado
      // tienen booster:false: promos, buy-a-box, Secret Lair, art series.
      // El respaldo a `true` solo actua si el campo falta, que en el volcado no
      // ocurre; se mantiene por prudencia ante cambios del origen.
      inBoosters: raw.booster ?? true,
    };
  }

  #toDomainCard(raw: RawCard): DomainCard<'MTG'> {
    const face = raw.card_faces?.[0];

    const gameData = stripUndefined<MtgGameData>({
      mana_cost: nonEmpty(raw.mana_cost ?? face?.mana_cost),
      cmc: toJsonNumber(raw.cmc),
      // `colors` de una carta incolora llega como [], y toStringArray lo omite.
      // Es lo correcto: una carta incolora no debe entrar en el indice de colores.
      colors: toStringArray(raw.colors ?? face?.colors) as MtgColor[] | undefined,
      color_identity: toStringArray(raw.color_identity) as MtgColor[] | undefined,
      // Texto y no numero: Magic admite potencias como "*" o "1+*".
      power: nonEmpty(raw.power ?? face?.power),
      toughness: nonEmpty(raw.toughness ?? face?.toughness),
      loyalty: nonEmpty(raw.loyalty ?? face?.loyalty),
      keywords: toStringArray(raw.keywords),
      legalities: raw.legalities,
    }) as MtgGameData;

    return {
      game: 'MTG',
      oracleKey: oracleKeyOf(raw),
      name: raw.name,
      typeLine: raw.type_line ?? face?.type_line ?? null,
      rulesText: rulesTextOf(raw),
      gameData,
    };
  }

  #resolveRarity(raw: RawCard): string {
    const normalized = normalizeRarityCode(raw.rarity);
    if (normalized !== null) return normalized;

    this.#warn({
      game: 'MTG',
      subject: `${raw.id} (${raw.name})`,
      code: 'invalid_rarity',
      message: `Rareza irrecuperable ${JSON.stringify(raw.rarity)}; se usa '${FALLBACK_RARITY_CODE}'`,
    });
    return FALLBACK_RARITY_CODE;
  }
}

// --------------------------------------------------------------------

export function toDomainSet(raw: RawSet): DomainSet {
  return {
    game: 'MTG',
    // El codigo, no el UUID: es unico en Scryfall, es lo que las cartas traen en
    // su campo `set`, y es infinitamente mas legible al depurar.
    externalId: raw.code,
    code: raw.code.slice(0, 16),
    name: raw.name,
    releasedAt: raw.released_at ?? null,
    cardCount: raw.card_count ?? 0,
    iconUrl: raw.icon_svg_uri ?? null,
  };
}

/**
 * Identidad conceptual.
 *
 * El layout `reversible_card` no trae `oracle_id` arriba: lo lleva cada cara.
 * Sin este respaldo, esas cartas se quedarian sin clave conceptual y romperian
 * el NOT NULL de `cards.oracle_key`.
 */
export function oracleKeyOf(raw: RawCard): string {
  return raw.oracle_id ?? raw.card_faces?.[0]?.oracle_id ?? raw.id;
}

/** En cartas de doble cara el texto de reglas vive en cada cara. */
export function rulesTextOf(raw: RawCard): string | null {
  if (raw.oracle_text !== undefined && raw.oracle_text !== '') return raw.oracle_text;

  const faces = raw.card_faces ?? [];
  const partes = faces.map((f: RawCardFace) => f.oracle_text).filter((t): t is string => !!t);
  return partes.length > 0 ? partes.join('\n//\n') : null;
}

/** Imagen: arriba en cartas normales, en la primera cara en las de doble cara. */
export function imageOf(raw: RawCard): string | null {
  return raw.image_uris?.normal ?? raw.card_faces?.[0]?.image_uris?.normal ?? null;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

function isHttpStatus(error: unknown, status: number): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === status;
}
