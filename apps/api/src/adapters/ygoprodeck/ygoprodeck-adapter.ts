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
  type YgoBanlistInfo,
  type YgoGameData,
} from '@tcg/shared';
import { HttpError } from '../../http/errors.js';
import type { JsonFetcher, RawCard, RawCardInfoResponse, RawCardSet, RawSet } from './types.js';

const BASE = 'https://db.ygoprodeck.com/api/v7';

/**
 * Rarezas de Yu-Gi-Oh! que NO llevan tratamiento foil.
 *
 * En Yu-Gi-Oh! el acabado no es una variante independiente de la impresion como
 * en Magic: la rareza YA determina el tratamiento. Una "Secret Rare" es foil por
 * definicion; no existe su version no-foil. Por eso el acabado se deriva de la
 * rareza en vez de leerse de un campo propio (la API no expone ninguno).
 */
const NON_FOIL_RARITIES: ReadonlySet<string> = new Set([
  'common',
  'short_print',
  'super_short_print',
  'rare',
]);

export interface YgoprodeckAdapterOptions {
  onWarning?: IngestWarningSink;
}

/**
 * Adaptador de YGOPRODeck. Implementa T-012.
 *
 * Tres particularidades del origen condicionan todo el diseno de esta clase:
 *
 * 1. `card_sets` de una carta lista TODAS sus impresiones en TODOS los sets. Al
 *    pedir el set X, la respuesta trae tambien impresiones de los sets Y y Z.
 *    Sin filtrar, la ingesta de un set contaminaria a los demas.
 *
 * 2. `set_code` NO es unico dentro de un set. En "Supreme Darkness" hay 24
 *    codigos repetidos: la misma carta con el mismo codigo en dos rarezas
 *    distintas (Quarter Century Secret Rare y Secret Rare, por ejemplo). Usar
 *    el codigo como `externalId` haria que la segunda impresion sobreescribiera
 *    a la primera via ON DUPLICATE KEY UPDATE, perdiendola en silencio.
 *
 * 3. Las rarezas son texto libre y vienen sucias (P-007).
 */
export class YgoprodeckAdapter implements GameAdapter<'YGO'> {
  readonly game = 'YGO' as const;

  readonly #client: JsonFetcher;
  readonly #warn: IngestWarningSink;

  constructor(client: JsonFetcher, options: YgoprodeckAdapterOptions = {}) {
    this.#client = client;
    this.#warn = options.onWarning ?? (() => {});
  }

  async *fetchSets(): AsyncIterable<DomainSet> {
    const raw = await this.#client.json<RawSet[]>(`${BASE}/cardsets.php`);

    for (const set of raw) {
      // externalId = set_name, NO set_code. `set_code` se repite en 142 casos:
      // "JUMP" lo comparten 70 sets distintos. Usarlo como clave natural
      // colapsaria esos 70 en uno solo. `set_name` es unico en los 1032.
      // Ademas es la clave por la que se consulta cardinfo.php?cardset=...
      yield {
        game: 'YGO',
        externalId: set.set_name,
        code: set.set_code.slice(0, 16),
        name: set.set_name,
        releasedAt: set.tcg_date ?? null,
        cardCount: set.num_of_cards ?? 0,
        iconUrl: set.set_image ?? null,
      };
    }
  }

  async *fetchPrints(set: DomainSet): AsyncIterable<DomainPrint<'YGO'>> {
    const url = `${BASE}/cardinfo.php?cardset=${encodeURIComponent(set.externalId)}`;

    let payload: RawCardInfoResponse;
    try {
      payload = await this.#client.json<RawCardInfoResponse>(url);
    } catch (error) {
      // La API responde 400 (no 404 ni 200 vacio) cuando un set no tiene cartas.
      // Es una respuesta legitima para sets promocionales vacios, no una averia:
      // se avisa y se sigue con el resto del catalogo.
      if (error instanceof HttpError && error.status === 400) {
        this.#warn({
          game: 'YGO',
          subject: set.externalId,
          code: 'malformed_field',
          message: `El set no devolvio cartas (HTTP 400): ${set.externalId}`,
        });
        return;
      }
      throw error;
    }

    const cards = payload.data ?? [];
    // Detecta colisiones de externalId dentro del set. No deberia ocurrir una vez
    // incluida la rareza en la clave, pero si el origen cambia, mejor enterarse
    // por un aviso que por cartas desaparecidas.
    const vistos = new Set<string>();

    for (const raw of cards) {
      const card = this.#toDomainCard(raw);

      for (const printing of raw.card_sets ?? []) {
        // FILTRO IMPRESCINDIBLE: card_sets trae impresiones de otros sets.
        if (printing.set_name !== set.externalId) continue;

        const rarityCode = this.#resolveRarity(printing, raw);
        const externalId = buildPrintExternalId(printing.set_code, rarityCode);

        if (vistos.has(externalId)) {
          this.#warn({
            game: 'YGO',
            subject: externalId,
            code: 'malformed_field',
            message: `externalId duplicado en ${set.externalId}; se omite la repeticion`,
          });
          continue;
        }
        vistos.add(externalId);

        const imageUrl = raw.card_images?.[0]?.image_url ?? null;
        if (imageUrl === null) {
          this.#warn({
            game: 'YGO',
            subject: externalId,
            code: 'missing_image',
            message: `Sin imagen de origen para ${raw.name}`,
          });
        }

        yield {
          card,
          setExternalId: set.externalId,
          externalId,
          collectorNumber: collectorNumberFrom(printing.set_code),
          rarityCode,
          rarityLabel: printing.set_rarity,
          imageSourceUrl: imageUrl,
          finishes: NON_FOIL_RARITIES.has(rarityCode) ? ['nonfoil'] : ['foil'],
          // SUPOSICION, no dato: YGOPRODeck no marca esto por carta. Es correcta
          // porque en Yu-Gi-Oh! la distincion es POR SET -- los Structure Deck,
          // los tins y los promocionales son sets aparte, no cartas marcadas
          // dentro de un set de sobres. Ver P-014.
          inBoosters: true,
        };
      }
    }
  }

  /** Yu-Gi-Oh! no tiene sets con estructura de sobre atipica en el alcance de v1. */
  defaultPackTemplate(): PackTemplateSpec | null {
    return null;
  }

  // ------------------------------------------------------------------

  #toDomainCard(raw: RawCard): DomainCard<'YGO'> {
    const gameData = stripUndefined<YgoGameData>({
      attribute: raw.attribute,
      race: raw.race,
      level: toJsonNumber(raw.level),
      link_val: toJsonNumber(raw.linkval),
      link_markers: toStringArray(raw.linkmarkers),
      // toJsonNumber absorbe los dos casos reales que rompian el INSERT:
      // atk "?" (ATK variable, tipo Slifer) y def null (monstruos Link).
      atk: toJsonNumber(raw.atk),
      def: toJsonNumber(raw.def),
      scale: toJsonNumber(raw.scale),
      archetype: raw.archetype,
      banlist_info: mapBanlist(raw.banlist_info),
    }) as YgoGameData;

    return {
      game: 'YGO',
      // El id numerico de YGOPRODeck ES la identidad conceptual: todas las
      // impresiones de una carta lo comparten. No hay que derivarlo del nombre.
      oracleKey: String(raw.id),
      name: raw.name,
      typeLine: raw.humanReadableCardType ?? raw.type ?? null,
      rulesText: raw.desc ?? null,
      gameData,
    };
  }

  /** Normaliza la rareza aplicando el contrato de P-007. Nunca descarta la carta. */
  #resolveRarity(printing: RawCardSet, card: RawCard): string {
    const normalized = normalizeRarityCode(printing.set_rarity);
    if (normalized !== null) return normalized;

    this.#warn({
      game: 'YGO',
      subject: `${printing.set_code} (${card.name})`,
      code: 'invalid_rarity',
      message: `Rareza irrecuperable ${JSON.stringify(printing.set_rarity)}; se usa '${FALLBACK_RARITY_CODE}'`,
    });
    return FALLBACK_RARITY_CODE;
  }
}

/**
 * Clave natural de la impresion, con la rareza incluida.
 *
 * La rareza forma parte de la clave porque `set_code` por si solo NO identifica
 * una impresion: la misma carta puede salir en el mismo set, con el mismo
 * codigo, en dos rarezas. Son dos productos distintos que un sobre entrega por
 * separado y que un coleccionista posee por separado.
 */
export function buildPrintExternalId(setCode: string, rarityCode: string): string {
  return `${setCode}::${rarityCode}`.slice(0, 64);
}

/** Extrae el numero de coleccionista de un codigo tipo "SUDA-EN049" -> "049". */
export function collectorNumberFrom(setCode: string): string {
  const match = /(\d+)\s*$/.exec(setCode);
  return (match?.[1] ?? setCode).slice(0, 16);
}

function mapBanlist(raw: RawCard['banlist_info']): YgoBanlistInfo | undefined {
  if (!raw) return undefined;
  const mapped = stripUndefined<YgoBanlistInfo>({
    ban_tcg: raw.ban_tcg,
    ban_ocg: raw.ban_ocg,
    ban_goat: raw.ban_goat,
  });
  return Object.keys(mapped).length > 0 ? (mapped as YgoBanlistInfo) : undefined;
}
