import type { GameCode } from './game.js';
import type { DomainPrint, DomainSet, PackTemplateSpec } from './domain.js';

/**
 * Capa anticorrupcion (ADR-003).
 *
 * Una interfaz de dominio, tres traductores. Anadir un cuarto juego (Lorcana,
 * One Piece) es escribir un adaptador; nada mas del sistema cambia.
 *
 * El adaptador tiene UNA sola responsabilidad: hablar con su API y devolver
 * dominio. NO escribe en la base de datos, NO decide el ritmo de las peticiones
 * (eso es `RateLimitedClient`, T-009) y NO descarga imagenes (eso es el job
 * `image-harvest`, T-014).
 *
 * Los metodos devuelven `AsyncIterable` y no `Promise<T[]>` a proposito: el
 * volcado de Scryfall son cientos de MB y un array completo en memoria mata el
 * worker (P-004). Iterando, el consumidor procesa y libera.
 */
export interface GameAdapter<G extends GameCode = GameCode> {
  readonly game: G;

  /** Todas las expansiones del juego. */
  fetchSets(): AsyncIterable<DomainSet>;

  /**
   * Todas las impresiones de un set, ya normalizadas a dominio.
   *
   * Nota respecto a ADR-003: alli se esbozo como `fetchCards`. Se renombra a
   * `fetchPrints` porque lo que la ingesta necesita es la IMPRESION (con su set,
   * rareza e imagen), que lleva la carta conceptual embebida. El nombre anterior
   * sugeria que devolvia `cards`, que es otra tabla.
   *
   * OBLIGACIONES del implementador:
   *  - `rarityCode` debe salir de `normalizeRarityCode`; si devuelve null, caer a
   *    'common' y dejar aviso (P-007).
   *  - `rarityLabel` conserva la cadena literal de la API, sin tocar.
   *  - Los numericos de `gameData` pasan por `toJsonNumber` y los arrays por
   *    `toStringArray`.
   *  - Nunca descartar una carta por una rareza desconocida.
   */
  fetchPrints(set: DomainSet): AsyncIterable<DomainPrint<G>>;

  /**
   * Plantilla de sobre propia de este set, si la tiene.
   *
   * Devolver `null` es lo normal y significa "usa la plantilla por defecto del
   * juego", que ya esta sembrada por la migracion 0003. Solo se devuelve algo
   * para sets con estructura atipica (ver P-008, limitacion 3).
   */
  defaultPackTemplate(set: DomainSet): PackTemplateSpec | null;
}

/**
 * Aviso no fatal emitido durante la ingesta.
 *
 * Existe porque la regla del proyecto es **no perder nunca una carta**: ante un
 * dato corrupto se degrada con elegancia y se deja constancia, en vez de lanzar
 * una excepcion y abortar el set entero. YGOPRODeck devuelve rarezas como
 * "PLatinum Secret Rare", "2" o "3" (P-007), y eso no puede tumbar la ingesta.
 */
export interface IngestWarning {
  game: GameCode;
  /** Identificador de lo que se estaba procesando (external_id de la impresion). */
  subject: string;
  code: IngestWarningCode;
  message: string;
}

export type IngestWarningCode =
  | 'unknown_rarity'
  | 'invalid_rarity'
  | 'missing_image'
  | 'malformed_field';

/** Consumidor de avisos. La implementacion real ira a un logger; en tests, a un array. */
export type IngestWarningSink = (warning: IngestWarning) => void;
