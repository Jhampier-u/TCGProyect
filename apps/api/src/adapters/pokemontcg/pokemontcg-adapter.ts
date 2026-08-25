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
  type PackTemplateSpec,
  type PtcgAttack,
  type PtcgGameData,
  type PtcgWeakness,
} from '@tcg/shared';
import type { PokemonHttp, RawAttack, RawCard, RawPaged, RawSet, RawWeakness } from './types.js';

const BASE = 'https://api.pokemontcg.io/v2';

/** Maximo admitido por la API. Verificado: 250 funciona. */
const PAGE_SIZE = 250;

/**
 * Rarezas que pueden aparecer tambien en version reverse holo.
 *
 * La API NO expone el acabado, asi que se deriva de la rareza. Es una
 * aproximacion consciente: en Pokemon el reverse holo es un tratamiento por
 * COPIA, no una impresion distinta, y el simulador ya lo modela en el sobre
 * (`pack_slots.foil_chance` de los slots 7 y 8, migracion 0003).
 */
const REVERSE_CAPABLE: ReadonlySet<string> = new Set(['common', 'uncommon', 'rare', 'rare_holo']);

export interface PokemonTcgAdapterOptions {
  onWarning?: IngestWarningSink;
  /**
   * Clave de dev.pokemontcg.io. Sin ella la API responde igual pero con una
   * cuota diaria muy inferior (~1.000 frente a ~20.000), insuficiente para la
   * ingesta completa. Ver T-005.
   */
  apiKey?: string;
}

/**
 * Adaptador de Pokemon TCG. Implementa T-013.
 *
 * Particularidades del origen que condicionan el diseno:
 *
 * 1. `hp` llega como CADENA ("30"), no como numero.
 * 2. Las cartas que no son Pokemon (entrenadores, energias) no traen `hp`,
 *    `types` ni `attacks`: 43 de 250 en el set sv1.
 * 3. **El nombre NO identifica una carta.** En sv1 hay 250 cartas y solo 173
 *    nombres distintos, y las homonimas son cartas REALMENTE distintas:
 *    `Tarountula` sv1-16 tiene 40 PS y el ataque "String Haul", mientras que
 *    sv1-18 tiene 60 PS y "Surprise Attack". Ver P-015.
 * 4. La API es INESTABLE: en el muestreo del 2026-08-25 solo ~30% de las
 *    peticiones respondieron 200, con 500 y 502 intercalados. Se apoya en los
 *    reintentos de `RateLimitedClient`. Ver P-016.
 */
export class PokemonTcgAdapter implements GameAdapter<'PTCG'> {
  readonly game = 'PTCG' as const;

  readonly #http: PokemonHttp;
  readonly #warn: IngestWarningSink;
  readonly #apiKey: string | undefined;

  constructor(http: PokemonHttp, options: PokemonTcgAdapterOptions = {}) {
    this.#http = http;
    this.#warn = options.onWarning ?? (() => {});
    this.#apiKey = options.apiKey?.trim() || undefined;
  }

  /** Si la ingesta completa es viable con la configuracion actual. */
  hasApiKey(): boolean {
    return this.#apiKey !== undefined;
  }

  async *fetchSets(): AsyncIterable<DomainSet> {
    for await (const set of this.#paginate<RawSet>(`${BASE}/sets`)) {
      yield {
        game: 'PTCG',
        // `id` ("sv1") y no el nombre: es unico y es la clave por la que se
        // filtran las cartas con q=set.id:...
        externalId: set.id,
        code: (set.ptcgoCode ?? set.id).slice(0, 16),
        name: set.name,
        releasedAt: normalizeDate(set.releaseDate),
        // `total` incluye las secretas; `printedTotal` no. Interesa el real.
        cardCount: set.total ?? set.printedTotal ?? 0,
        iconUrl: set.images?.symbol ?? set.images?.logo ?? null,
      };
    }
  }

  async *fetchPrints(set: DomainSet): AsyncIterable<DomainPrint<'PTCG'>> {
    const url = `${BASE}/cards?q=${encodeURIComponent(`set.id:${set.externalId}`)}&orderBy=number`;

    for await (const raw of this.#paginate<RawCard>(url)) {
      yield this.#toDomainPrint(raw, set);
    }
  }

  /** Las plantillas por defecto de PTCG ya estan sembradas (migracion 0003). */
  defaultPackTemplate(): PackTemplateSpec | null {
    return null;
  }

  // ------------------------------------------------------------------

  /**
   * Recorre un endpoint paginado.
   *
   * El corte se decide por `totalCount`, no por "la pagina vino vacia": asi una
   * respuesta corta por un fallo transitorio no se confunde con el final del
   * catalogo y no truncamos la ingesta en silencio.
   */
  async *#paginate<T>(baseUrl: string): AsyncGenerator<T> {
    const separator = baseUrl.includes('?') ? '&' : '?';
    let page = 1;
    let seen = 0;
    let total = Infinity;

    while (seen < total) {
      const url = `${baseUrl}${separator}page=${page}&pageSize=${PAGE_SIZE}`;
      const response = await this.#http.json<RawPaged<T>>(url, { headers: this.#headers() });

      total = response.totalCount ?? 0;
      const items = response.data ?? [];
      if (items.length === 0) break;

      for (const item of items) yield item;
      seen += items.length;
      page += 1;
    }
  }

  #headers(): Record<string, string> {
    return this.#apiKey ? { 'x-api-key': this.#apiKey } : {};
  }

  #toDomainPrint(raw: RawCard, set: DomainSet): DomainPrint<'PTCG'> {
    const rarityCode = this.#resolveRarity(raw);
    const imageSourceUrl = raw.images?.large ?? raw.images?.small ?? null;

    if (imageSourceUrl === null) {
      this.#warn({
        game: 'PTCG',
        subject: raw.id,
        code: 'missing_image',
        message: `Sin imagen de origen para ${raw.name} (${raw.id})`,
      });
    }

    return {
      card: this.#toDomainCard(raw),
      setExternalId: set.externalId,
      externalId: raw.id,
      collectorNumber: raw.number.slice(0, 16),
      rarityCode,
      rarityLabel: raw.rarity ?? '',
      imageSourceUrl,
      finishes: REVERSE_CAPABLE.has(rarityCode) ? ['normal', 'reverse'] : ['holo'],
      // Suposicion a nivel de set, igual que en YGO: la API no marca esto por
      // carta, y en Pokemon los productos que no son sobres (mazos temáticos,
      // cajas de coleccionista) son sets aparte. Ver P-014.
      inBoosters: true,
    };
  }

  #toDomainCard(raw: RawCard): DomainCard<'PTCG'> {
    const gameData = stripUndefined<PtcgGameData>({
      supertype: raw.supertype,
      subtypes: toStringArray(raw.subtypes),
      // La API devuelve "30" como cadena; toJsonNumber lo convierte y descarta
      // cualquier valor no numerico sin abortar el INSERT.
      hp: toJsonNumber(raw.hp),
      types: toStringArray(raw.types),
      evolves_from: raw.evolvesFrom,
      attacks: mapAttacks(raw.attacks),
      weaknesses: mapWeaknesses(raw.weaknesses),
      resistances: mapWeaknesses(raw.resistances),
      // camelCase en el origen, snake_case en game_data por contrato con el DDL.
      retreat_cost: toStringArray(raw.retreatCost),
      regulation_mark: raw.regulationMark,
    }) as PtcgGameData;

    return {
      game: 'PTCG',
      // EL ID, NO EL NOMBRE. El diccionario de datos planteaba usar el nombre
      // normalizado, pero el nombre no identifica una carta en Pokemon: en sv1
      // hay 250 cartas y 173 nombres. Tarountula sv1-16 (40 PS, "String Haul") y
      // sv1-18 (60 PS, "Surprise Attack") son cartas distintas homonimas, y
      // con clave por nombre la segunda habria sobrescrito a la primera. P-015.
      //
      // La regla de mazo "maximo 4 copias por nombre" (RN-04) no se ve afectada:
      // el validador agrupa por `cards.name`, que sigue estando ahi.
      oracleKey: raw.id,
      name: raw.name,
      typeLine: buildTypeLine(raw),
      rulesText: raw.rules?.join('\n') ?? null,
      gameData,
    };
  }

  #resolveRarity(raw: RawCard): string {
    const normalized = normalizeRarityCode(raw.rarity);
    if (normalized !== null) return normalized;

    this.#warn({
      game: 'PTCG',
      subject: `${raw.id} (${raw.name})`,
      code: raw.rarity === undefined ? 'unknown_rarity' : 'invalid_rarity',
      message: `Rareza ausente o irrecuperable ${JSON.stringify(raw.rarity ?? null)}; se usa '${FALLBACK_RARITY_CODE}'`,
    });
    return FALLBACK_RARITY_CODE;
  }
}

// --------------------------------------------------------------------

/** "Pokemon - Basic, ex" a partir de supertype y subtypes. */
export function buildTypeLine(raw: RawCard): string | null {
  const supertype = raw.supertype?.trim();
  const subtypes = (raw.subtypes ?? []).filter((s) => s.trim() !== '');

  if (!supertype && subtypes.length === 0) return null;
  if (subtypes.length === 0) return supertype ?? null;
  return `${supertype ?? ''} - ${subtypes.join(', ')}`.trim();
}

/** La API usa `releaseDate` con barras ("1999/01/09"); MySQL DATE quiere guiones. */
export function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(raw.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function mapAttacks(raw: RawAttack[] | undefined): PtcgAttack[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  return raw.map((a) =>
    stripUndefined<PtcgAttack>({
      name: a.name,
      cost: toStringArray(a.cost),
      converted_energy_cost: toJsonNumber(a.convertedEnergyCost),
      damage: a.damage === '' ? undefined : a.damage,
      text: a.text === '' ? undefined : a.text,
    }) as PtcgAttack,
  );
}

function mapWeaknesses(raw: RawWeakness[] | undefined): PtcgWeakness[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  return raw.map((w) => ({ type: w.type, value: w.value }));
}
