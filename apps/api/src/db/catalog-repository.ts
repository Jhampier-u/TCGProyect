import type { DomainPrint, DomainSet, GameCode } from '@tcg/shared';
import { GAME_IDS } from '@tcg/shared';
import type { Database } from './connection.js';
import type { ImageRepository, PendingImage } from '../images/types.js';
import { iconKeyFromUrl } from '../images/image-harvester.js';
import { clasificarSet, lineaDeProducto } from '../ingest/openable.js';

/** Hoy en `YYYY-MM-DD`, en hora local, que es como el origen fecha los sets. */
function hoyISO(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Tamano de lote para los upserts.
 *
 * No es arbitrario: con 116.752 impresiones de Magic, insertarlas de una en una
 * son 116.752 idas y vueltas a la base de datos. En lotes de 500 son 234. El
 * limite superior lo marca `max_allowed_packet` (16 MB por defecto): las filas
 * de `cards` llevan `game_data` y `rules_text`, asi que 500 es un punto
 * conservador que deja mucho margen.
 */
export const BATCH_SIZE = 500;

export interface SetRow {
  id: number;
  external_id: string;
}

/** Un set pendiente de ingestar, con su identificador ya resuelto. */
export interface PendingSet {
  id: number;
  externalId: string;
}

/**
 * Acceso a `sets`, `cards` y `card_prints` (ADR-006).
 *
 * Todas las escrituras son `INSERT ... ON DUPLICATE KEY UPDATE` sobre las claves
 * naturales del diccionario de datos. Eso es lo que hace la ingesta idempotente:
 * volver a ejecutarla actualiza, nunca duplica.
 */
export class CatalogRepository implements ImageRepository {
  constructor(private readonly db: Database) {}

  // ---------------------------------------------------------------- sets

  async upsertSets(sets: DomainSet[]): Promise<void> {
    for (const chunk of chunks(sets, BATCH_SIZE)) {
      const values = chunk.map((s) => [
        GAME_IDS[s.game],
        s.externalId,
        s.code,
        s.name,
        s.releasedAt,
        s.cardCount,
        // T-069: si el set es un producto de sobres. Se decide aqui, con el
        // nombre y el tamano que el origen declara, y no se toca `in_boosters`:
        // son dos cosas distintas y confundirlas es P-033.
        clasificarSet(
          { game: s.game, name: s.name, code: s.code, cardCount: s.cardCount, releasedAt: s.releasedAt },
          hoyISO(),
        ).abrible
          ? 1
          : 0,
        // La linea de producto a la que pertenece, si es de alguna (T-080).
        lineaDeProducto(s.game, s.name, s.code),
        s.iconUrl,
      ]);
      await this.db.query(
        `INSERT INTO sets (game_id, external_id, code, name, released_at, card_count, is_openable, product_line, icon_url)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           code = VALUES(code), name = VALUES(name),
           released_at = VALUES(released_at), card_count = VALUES(card_count),
           is_openable = VALUES(is_openable), product_line = VALUES(product_line),
           icon_url = VALUES(icon_url)`,
        [values],
      );
    }
  }

  /**
   * Sets aun sin ingestar. Es el checkpoint de ADR-004: si el worker muere a
   * mitad, la siguiente ejecucion retoma por aqui sin reprocesar lo hecho.
   *
   * SE EXCLUYEN LOS SETS SIN PUBLICAR (T-023). Los origenes listan producto
   * anunciado y todavia no salido, y con `released_at DESC` esos van PRIMEROS:
   * una ejecucion acotada se llevaba lo que aun no existe en vez de lo jugable.
   * Medido el 2026-08-26 sobre el catalogo real: en Magic los dos primeros eran
   * `Star Trek Commander` (41 cartas) y `Star Trek Tokens` (UNA carta).
   *
   * Los sets sin fecha SI entran, y quedan los ultimos: en MySQL un `DESC`
   * ordena los NULL al final. Excluirlos les habria cerrado la puerta para
   * siempre.
   */
  async findPendingSets(game: GameCode, limit: number): Promise<PendingSet[]> {
    const rows = await this.db.select<SetRow>(
      `SELECT id, external_id FROM sets
       WHERE game_id = ? AND ingested_at IS NULL
         AND (released_at IS NULL OR released_at <= CURDATE())
       ORDER BY released_at DESC, id DESC
       LIMIT ?`,
      [GAME_IDS[game], limit],
    );
    return rows.map((r) => ({ id: Number(r.id), externalId: r.external_id }));
  }

  /**
   * Sets concretos por su id de origen, ingestados o no.
   *
   * Existe para poder pedir UN set: el orden por fecha es correcto para ponerse
   * al dia, pero inutil cuando hace falta un set concreto que esta 35 posiciones
   * abajo. Deliberadamente NO filtra por `ingested_at`, para poder reingestar.
   */
  async findSetsByExternalId(game: GameCode, externalIds: readonly string[]): Promise<PendingSet[]> {
    if (externalIds.length === 0) return [];
    const huecos = externalIds.map(() => '?').join(', ');
    const rows = await this.db.select<SetRow>(
      `SELECT id, external_id FROM sets
       WHERE game_id = ? AND external_id IN (${huecos})`,
      [GAME_IDS[game], ...externalIds],
    );
    return rows.map((r) => ({ id: Number(r.id), externalId: r.external_id }));
  }

  /**
   * Vuelve a clasificar TODOS los sets (T-069).
   *
   * `upsertSets` decide `is_openable` al ingestar, pero eso solo alcanza a lo
   * que se vuelva a ingestar. Los sets que ya estan en la base se quedarian con
   * el valor por defecto -- abribles -- hasta que alguien reingestara los tres
   * juegos enteros, que son horas de descargas.
   *
   * Esto los recorre y aplica el mismo clasificador, que sigue siendo la unica
   * fuente de verdad. Es barato (unos miles de filas) e idempotente, asi que
   * corre en cada ejecucion del CLI y no hace falta acordarse de nada.
   *
   * Devuelve cuantos han cambiado de valor, para que el CLI pueda decirlo.
   *
   * Y hay una razon mas para que corra siempre: la clasificacion depende de la
   * FECHA (T-067). Un set que hoy no ha salido lo hara, y entonces tiene que
   * volverse abrible solo, sin que nadie se acuerde de nada.
   */
  async reclasificarSets(): Promise<number> {
    const rows = await this.db.select<{
      id: number; game_id: number; name: string; code: string; card_count: number;
      released_at: string | Date | null; is_openable: number; product_line: string | null;
    }>(`SELECT id, game_id, name, code, card_count, released_at, is_openable, product_line FROM sets`);

    // Se calcula UNA vez para toda la pasada: si se tomara por fila, una
    // ejecucion a medianoche clasificaria unos sets con un dia y otros con el
    // siguiente.
    const hoy = hoyISO();

    const cambian: number[] = [];
    const abren: number[] = [];
    for (const r of rows) {
      const abrible = clasificarSet(
        {
          game: gameCodeOf(Number(r.game_id)),
          name: r.name,
          code: r.code,
          cardCount: Number(r.card_count),
          // `DATE` llega como `Date` con mysql2; se recorta a `YYYY-MM-DD`.
          releasedAt: r.released_at ? String(r.released_at).slice(0, 10) : null,
        },
        hoy,
      ).abrible;
      const linea = lineaDeProducto(gameCodeOf(Number(r.game_id)), r.name, r.code);
      if (linea !== r.product_line) {
        await this.db.query(`UPDATE sets SET product_line = ? WHERE id = ?`, [linea, Number(r.id)]);
      }

      if (abrible === (Number(r.is_openable) === 1)) continue;
      (abrible ? abren : cambian).push(Number(r.id));
    }

    for (const [ids, valor] of [[cambian, 0], [abren, 1]] as const) {
      for (const lote of chunks(ids, BATCH_SIZE)) {
        if (lote.length === 0) continue;
        await this.db.query(
          `UPDATE sets SET is_openable = ? WHERE id IN (${lote.map(() => '?').join(', ')})`,
          [valor, ...lote],
        );
      }
    }
    return cambian.length + abren.length;
  }

  /**
   * Retira las impresiones de un set que el origen ya no lista (T-083, P-040).
   *
   * POR QUE HACE FALTA. La clave natural de una impresion incluye el
   * `external_id`, y en Yu-Gi-Oh! ese identificador LLEVA LA RAREZA DENTRO
   * (`SUDA-EN049::quarter_century_secret_rare`). Si la rareza cambia, cambia la
   * clave: el upsert no reconoce la fila y en vez de actualizarla inserta otra.
   * Medido al normalizar las etiquetas que no son rarezas, quedaron 110 filas
   * duplicadas sin que nada fallara.
   *
   * DOS CASOS, Y LA DIFERENCIA IMPORTA:
   *
   *  - Sin referencias -> se BORRA. Es una fila que nadie ha tocado.
   *  - Con referencias -> se RETIRA. Una impresion que alguien saco de un sobre
   *    NO se puede borrar: `pack_opening_cards` es la fuente de verdad de RN-01
   *    y hacerlo reescribiria su historial (P-005). Se marca `withdrawn_at`, que
   *    la saca del pool y de la completitud sin tocar el pasado.
   *
   * Se compara en memoria en vez de con un `NOT IN` gigante: un set son
   * centenares de impresiones, no millones, y un `IN` de 450 elementos es peor
   * que traerlas y restar conjuntos.
   *
   * Devuelve cuantas se han borrado y cuantas retirado, para poder decirlo.
   */
  async retirarImpresionesAusentes(
    setId: number,
    vigentes: ReadonlySet<string>,
  ): Promise<{ borradas: number; retiradas: number }> {
    const filas = await this.db.select<{ id: number; external_id: string }>(
      `SELECT id, external_id FROM card_prints WHERE set_id = ? AND withdrawn_at IS NULL`,
      [setId],
    );

    const sobrantes = filas.filter((f) => !vigentes.has(f.external_id)).map((f) => Number(f.id));
    if (sobrantes.length === 0) return { borradas: 0, retiradas: 0 };

    // Que impresiones toca alguien: una apertura, una coleccion o un mazo.
    const huecos = sobrantes.map(() => '?').join(', ');
    const referidas = new Set(
      (
        await this.db.select<{ id: number }>(
          `SELECT DISTINCT card_print_id AS id FROM pack_opening_cards WHERE card_print_id IN (${huecos})
           UNION SELECT DISTINCT card_print_id FROM user_collection WHERE card_print_id IN (${huecos})
           UNION SELECT DISTINCT card_print_id FROM deck_cards WHERE card_print_id IN (${huecos})`,
          [...sobrantes, ...sobrantes, ...sobrantes],
        )
      ).map((r) => Number(r.id)),
    );

    const aBorrar = sobrantes.filter((id) => !referidas.has(id));
    const aRetirar = sobrantes.filter((id) => referidas.has(id));

    for (const lote of chunks(aBorrar, BATCH_SIZE)) {
      if (lote.length === 0) continue;
      await this.db.query(
        `DELETE FROM card_prints WHERE id IN (${lote.map(() => '?').join(', ')})`,
        lote,
      );
    }
    for (const lote of chunks(aRetirar, BATCH_SIZE)) {
      if (lote.length === 0) continue;
      await this.db.query(
        `UPDATE card_prints SET withdrawn_at = CURRENT_TIMESTAMP
          WHERE id IN (${lote.map(() => '?').join(', ')})`,
        lote,
      );
    }

    return { borradas: aBorrar.length, retiradas: aRetirar.length };
  }

  async markSetIngested(setId: number): Promise<void> {
    await this.db.query(`UPDATE sets SET ingested_at = CURRENT_TIMESTAMP WHERE id = ?`, [setId]);
  }

  // ------------------------------------------------------- cards y prints

  /**
   * Persiste un lote de impresiones con sus cartas.
   *
   * Tres pasos, y el orden importa:
   *  1. Upsert de `cards` (la carta conceptual).
   *  2. SELECT para resolver `oracle_key -> id`. Hace falta un viaje extra porque
   *     `LAST_INSERT_ID()` no es fiable en un upsert por lotes con duplicados:
   *     devuelve el id de la primera fila insertada, no de las actualizadas.
   *  3. Upsert de `card_prints` con los ids ya resueltos.
   */
  async savePrints(game: GameCode, setId: number, prints: DomainPrint[]): Promise<number> {
    if (prints.length === 0) return 0;
    const gameId = GAME_IDS[game];
    let escritas = 0;

    for (const chunk of chunks(prints, BATCH_SIZE)) {
      // 1. Cartas conceptuales, deduplicadas dentro del lote: varias impresiones
      //    de la misma carta comparten oracle_key y MySQL rechazaria el lote con
      //    "Duplicate entry" si se enviara dos veces la misma clave.
      const cards = new Map<string, DomainPrint['card']>();
      for (const p of chunk) cards.set(p.card.oracleKey, p.card);

      await this.db.query(
        `INSERT INTO cards (game_id, oracle_key, name, type_line, rules_text, game_data)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), type_line = VALUES(type_line),
           rules_text = VALUES(rules_text), game_data = VALUES(game_data)`,
        [
          [...cards.values()].map((c) => [
            gameId,
            c.oracleKey,
            c.name,
            c.typeLine,
            c.rulesText,
            JSON.stringify(c.gameData),
          ]),
        ],
      );

      // 2. Resolver los ids.
      const keys = [...cards.keys()];
      const rows = await this.db.select<{ id: number; oracle_key: string }>(
        `SELECT id, oracle_key FROM cards WHERE game_id = ? AND oracle_key IN (?)`,
        [gameId, keys],
      );
      const cardIds = new Map(rows.map((r) => [r.oracle_key, Number(r.id)]));

      // 3. Impresiones, en un unico INSERT por lote.
      //
      //    La rareza se resuelve en memoria y no con un JOIN dentro del INSERT.
      //    Un `INSERT ... SELECT FROM rarities` obligaria a una sentencia por
      //    fila, que es exactamente lo que el lote pretende evitar: seria volver
      //    a 116.752 idas y vueltas. Las rarezas son 66 en total, asi que caben
      //    holgadamente en un mapa.
      const rarityIds = await this.#rarityIds(game);
      const values: unknown[][] = [];

      for (const p of chunk) {
        const cardId = cardIds.get(p.card.oracleKey);
        if (cardId === undefined) continue; // no deberia ocurrir; se omite en vez de romper

        let rarityId = rarityIds.get(p.rarityCode);
        if (rarityId === undefined) {
          // Rareza nueva: se crea al vuelo con tier 50 (contrato de P-007) y se
          // refresca el mapa. Nunca se descarta la carta.
          await this.ensureRarity(game, p.rarityCode, p.rarityLabel);
          this.#rarityCache.delete(game);
          rarityId = (await this.#rarityIds(game)).get(p.rarityCode);
          if (rarityId === undefined) continue;
        }

        values.push([
          cardId,
          setId,
          p.externalId,
          p.collectorNumber,
          rarityId,
          p.inBoosters ? 1 : 0,
          p.imageSourceUrl,
          JSON.stringify(p.finishes),
        ]);
      }
      if (values.length === 0) continue;

      await this.db.query(
        `INSERT INTO card_prints
           (card_id, set_id, external_id, collector_number, rarity_id, in_boosters, image_source_url, finishes)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           rarity_id = VALUES(rarity_id), in_boosters = VALUES(in_boosters),
           collector_number = VALUES(collector_number),
           image_source_url = VALUES(image_source_url), finishes = VALUES(finishes)`,
        [values],
      );
      escritas += values.length;
    }

    return escritas;
  }

  readonly #rarityCache = new Map<GameCode, Map<string, number>>();

  /** Mapa `code -> rarities.id` del juego, cacheado por proceso. */
  async #rarityIds(game: GameCode): Promise<Map<string, number>> {
    const cached = this.#rarityCache.get(game);
    if (cached) return cached;

    const rows = await this.db.select<{ id: number; code: string }>(
      `SELECT id, code FROM rarities WHERE game_id = ?`,
      [GAME_IDS[game]],
    );
    const map = new Map(rows.map((r) => [r.code, Number(r.id)]));
    this.#rarityCache.set(game, map);
    return map;
  }

  /**
   * Inserta una rareza desconocida al vuelo, con tier 50.
   *
   * Contrato de P-007: **nunca se descarta una carta por no reconocer su rareza**.
   * `INSERT IGNORE` porque dos workers concurrentes pueden encontrarse la misma
   * rareza nueva a la vez.
   */
  async ensureRarity(game: GameCode, code: string, label: string): Promise<void> {
    await this.db.query(
      `INSERT IGNORE INTO rarities (game_id, code, label, tier) VALUES (?, ?, ?, 50)`,
      [GAME_IDS[game], code, label || code],
    );
  }

  // -------------------------------------------------------------- imagenes

  /**
   * Intentos antes de dejar de pedir una imagen (T-019).
   *
   * Tres, no uno: un origen caido no debe condenar una imagen para siempre. Y
   * no diez, porque entonces una URL rota sigue costando peticiones durante
   * diez ejecuciones.
   */
  static readonly MAX_IMAGE_ATTEMPTS = 3;

  async findPending(limit: number): Promise<PendingImage[]> {
    const rows = await this.db.select<{
      id: number; game_id: number; code: string; external_id: string; image_source_url: string;
    }>(
      `SELECT p.id, s.game_id, s.code, p.external_id, p.image_source_url
       FROM card_prints p JOIN sets s ON s.id = p.set_id
       WHERE p.image_local_path IS NULL AND p.image_source_url IS NOT NULL
         AND p.image_fail_count < ?
       ORDER BY p.id
       LIMIT ?`,
      [CatalogRepository.MAX_IMAGE_ATTEMPTS, limit],
    );
    return rows.map((r) => ({
      rowId: Number(r.id),
      game: gameCodeOf(Number(r.game_id)),
      setCode: r.code,
      externalId: r.external_id,
      imageSourceUrl: r.image_source_url,
    }));
  }

  async markStored(rowId: number, localPath: string): Promise<void> {
    // Se limpia el contador: si acabo de bajarse, lo que fallara antes ya no
    // importa y una racha vieja no debe contar contra un reintento futuro.
    await this.db.query(
      `UPDATE card_prints
          SET image_local_path = ?, image_fail_count = 0, image_failed_at = NULL
        WHERE id = ?`,
      [localPath, rowId],
    );
  }

  // ------------------------------------------------ iconos de set (T-035)

  /**
   * Vista de `sets` con la MISMA forma que el job de imagenes espera.
   *
   * Devolver `PendingImage` no es un apano: un icono de set es una imagen que
   * pertenece a una fila de un juego y un set, que es exactamente lo que el job
   * necesita saber. Reutilizarlo evita repetir sus tres salvaguardas contra
   * pedir dos veces la misma imagen, que es donde de verdad esta el valor.
   *
   * La ruta queda `mtg/iconos/sets-trk.64.webp`: agrupada aparte de las cartas
   * y nombrada por la URL, no por el set, para que dos sets que comparten icono
   * compartan fichero. Ver `iconKeyFromUrl`.
   */
  async findPendingIcons(limit: number): Promise<PendingImage[]> {
    const rows = await this.db.select<{
      id: number; game_id: number; code: string; icon_url: string;
    }>(
      `SELECT id, game_id, code, icon_url FROM sets
        WHERE icon_local_path IS NULL AND icon_url IS NOT NULL
          AND icon_fail_count < ?
        ORDER BY id
        LIMIT ?`,
      [CatalogRepository.MAX_IMAGE_ATTEMPTS, limit],
    );
    return rows.map((r) => ({
      rowId: Number(r.id),
      game: gameCodeOf(Number(r.game_id)),
      setCode: 'iconos',
      externalId: iconKeyFromUrl(r.icon_url, Number(r.id)),
      imageSourceUrl: r.icon_url,
    }));
  }

  async markIconStored(setId: number, localPath: string): Promise<void> {
    await this.db.query(
      `UPDATE sets
          SET icon_local_path = ?, icon_fail_count = 0, icon_failed_at = NULL
        WHERE id = ?`,
      [localPath, setId],
    );
  }

  async markIconFailed(setId: number): Promise<void> {
    await this.db.query(
      `UPDATE sets
          SET icon_fail_count = icon_fail_count + 1, icon_failed_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [setId],
    );
  }

  /**
   * El repositorio de iconos con la forma que pide `ImageHarvester`.
   *
   * Se expone como objeto y no como otra clase para que quede evidente que es la
   * MISMA maquina cosechando otra cosa, no un segundo cosechador.
   */
  get iconos(): ImageRepository {
    return {
      findPending: (limit) => this.findPendingIcons(limit),
      markStored: (rowId, localPath) => this.markIconStored(rowId, localPath),
      markImageFailed: (rowId) => this.markIconFailed(rowId),
    };
  }

  /**
   * Anota que la imagen de esta impresion no se pudo cosechar (T-019).
   *
   * Al llegar a `MAX_IMAGE_ATTEMPTS`, `findPending` deja de devolverla: una URL
   * permanentemente rota se reintentaba en CADA ejecucion, gastando peticiones
   * contra el origen y llenando el informe de las mismas fallidas de siempre.
   */
  async markImageFailed(rowId: number): Promise<void> {
    await this.db.query(
      `UPDATE card_prints
          SET image_fail_count = image_fail_count + 1, image_failed_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [rowId],
    );
  }

  /**
   * Devuelve a la cola las imagenes agotadas. Cuantas filas se reactivan.
   *
   * Existe porque el contador no distingue causas: si el origen estuvo caido
   * una tarde, unas cuantas imagenes buenas pueden haber agotado sus intentos.
   * Sin esto no habria forma de recuperarlas salvo SQL a mano.
   */
  async resetImageFailures(): Promise<number> {
    const filas = await this.db.select<{ n: number }>(
      `SELECT COUNT(*) AS n FROM card_prints
        WHERE image_local_path IS NULL AND image_fail_count > 0`,
    );
    await this.db.query(
      `UPDATE card_prints SET image_fail_count = 0, image_failed_at = NULL
        WHERE image_local_path IS NULL AND image_fail_count > 0`,
    );
    return Number(filas[0]?.n ?? 0);
  }
}

/** Inverso de GAME_IDS. Si aparece un id desconocido, algo va muy mal. */
function gameCodeOf(id: number): GameCode {
  const entry = (Object.entries(GAME_IDS) as Array<[GameCode, number]>).find(([, v]) => v === id);
  if (!entry) throw new Error(`game_id desconocido en la base de datos: ${id}`);
  return entry[0];
}

export function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
