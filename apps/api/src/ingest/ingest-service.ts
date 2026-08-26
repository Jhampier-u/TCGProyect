import type { DomainPrint, DomainSet, GameAdapter, GameCode, IngestWarningSink } from '@tcg/shared';

/** Capacidad opcional: descargar el catalogo entero de una vez (solo Scryfall). */
export interface BulkCapable {
  supportsBulk(): boolean;
  fetchAllPrints(): AsyncIterable<DomainPrint>;
}

/** Acceso a datos que el orquestador necesita. Interfaz, no implementacion (ADR-006). */
export interface IngestRepository {
  upsertSets(sets: DomainSet[]): Promise<void>;
  findPendingSets(game: GameCode, limit: number): Promise<Array<{ id: number; externalId: string }>>;
  findSetsByExternalId(
    game: GameCode,
    externalIds: readonly string[],
  ): Promise<Array<{ id: number; externalId: string }>>;
  savePrints(game: GameCode, setId: number, prints: DomainPrint[]): Promise<number>;
  markSetIngested(setId: number): Promise<void>;
}

export interface IngestOptions {
  repository: IngestRepository;
  onWarning?: IngestWarningSink;
  onProgress?: (evento: ProgressEvent) => void;
  /** Sets a procesar por ejecucion. Acota el peor caso de un job que se descontrola. */
  maxSetsPerRun?: number;
  /** Fuerza el camino paginado aunque el adaptador ofrezca volcado masivo. */
  preferIncremental?: boolean;
}

export type ProgressEvent =
  | { type: 'sets_discovered'; game: GameCode; count: number }
  | { type: 'set_started'; game: GameCode; set: string }
  | { type: 'set_done'; game: GameCode; set: string; prints: number }
  | { type: 'set_failed'; game: GameCode; set: string; reason: string }
  | { type: 'bulk_started'; game: GameCode }
  | { type: 'bulk_progress'; game: GameCode; prints: number };

export interface IngestReport {
  game: GameCode;
  setsDescubiertos: number;
  setsProcesados: number;
  setsFallidos: number;
  impresiones: number;
  via: 'bulk' | 'incremental';
  errores: Array<{ set: string; motivo: string }>;
}

export const DEFAULT_MAX_SETS_PER_RUN = 50;

/** Opciones de UNA ejecucion. Distintas de `IngestOptions`, que es del constructor. */
export interface IngestRunOptions {
  /**
   * Ids de origen de sets concretos. Si viene, se ingestan esos y solo esos,
   * ignorando el orden por fecha y el marcador de ya ingestado.
   */
  soloSets?: readonly string[];
}

/**
 * Orquestador de ingesta. Une las piezas construidas entre S004 y S010.
 *
 * Hasta ahora existian los adaptadores, el cliente con limite de tasa y el job
 * de imagenes, pero nadie los llamaba: esta clase es quien lo hace.
 *
 * DOS CAMINOS, y la eleccion no es una optimizacion menor:
 *  - **Volcado masivo** cuando el adaptador lo ofrece (Scryfall). 116.752
 *    impresiones en 2 peticiones y ~12 s.
 *  - **Incremental por set** en los demas casos, y tambien en Scryfall cuando
 *    solo hay que ponerse al dia con sets nuevos: no compensa releer 74 MB
 *    porque haya salido una expansion.
 *
 * REANUDABILIDAD (ADR-004). `sets.ingested_at` se marca **al terminar** cada set.
 * Si el proceso muere a mitad, la siguiente ejecucion retoma por los sets sin
 * marcar. Con la API de Pokemon fallando el ~70% de las veces (P-016), esto deja
 * de ser un lujo: es la unica forma de que una ingesta larga llegue a terminar.
 *
 * AISLAMIENTO DE FALLOS. Un set que falla no aborta la ejecucion. Queda sin
 * marcar, se registra el motivo y se sigue con el siguiente. Lo contrario seria
 * que un unico set promocional roto impidiera ingestar el catalogo entero.
 */
export class IngestService {
  readonly #repo: IngestRepository;
  readonly #warn: IngestWarningSink;
  readonly #progress: (e: ProgressEvent) => void;
  readonly #maxSets: number;
  readonly #preferIncremental: boolean;

  constructor(options: IngestOptions) {
    this.#repo = options.repository;
    this.#warn = options.onWarning ?? (() => {});
    this.#progress = options.onProgress ?? (() => {});
    this.#maxSets = options.maxSetsPerRun ?? DEFAULT_MAX_SETS_PER_RUN;
    this.#preferIncremental = options.preferIncremental ?? false;
  }

  async ingest(adapter: GameAdapter, opciones: IngestRunOptions = {}): Promise<IngestReport> {
    const game = adapter.game;
    const report: IngestReport = {
      game,
      setsDescubiertos: 0,
      setsProcesados: 0,
      setsFallidos: 0,
      impresiones: 0,
      via: 'incremental',
      errores: [],
    };

    // PASO 1: los sets primero, SIEMPRE. Las impresiones necesitan un set_id, y
    // ademas es lo que permite saber que queda pendiente.
    const sets: DomainSet[] = [];
    for await (const set of adapter.fetchSets()) sets.push(set);
    await this.#repo.upsertSets(sets);
    report.setsDescubiertos = sets.length;
    this.#progress({ type: 'sets_discovered', game, count: sets.length });

    // Con `soloSets` se piden esos y punto, ingestados o no. Sin el, el orden
    // por fecha de publicacion (T-023).
    const pendientes = opciones.soloSets?.length
      ? await this.#repo.findSetsByExternalId(game, opciones.soloSets)
      : await this.#repo.findPendingSets(game, this.#maxSets);
    if (pendientes.length === 0) return report;

    if (!this.#preferIncremental && isBulkCapable(adapter) && adapter.supportsBulk()) {
      report.via = 'bulk';
      await this.#ingestBulk(adapter, pendientes, report);
    } else {
      await this.#ingestIncremental(adapter, sets, pendientes, report);
    }

    return report;
  }

  /**
   * Camino masivo. El volcado trae TODOS los sets mezclados, asi que se agrupa
   * por set sobre la marcha y se vuelca cada grupo cuando alcanza el umbral.
   *
   * Solo se persisten las impresiones de sets pendientes: releer el volcado no
   * deberia reescribir lo que ya estaba ingestado.
   */
  async #ingestBulk(
    adapter: GameAdapter & BulkCapable,
    pendientes: Array<{ id: number; externalId: string }>,
    report: IngestReport,
  ): Promise<void> {
    const game = adapter.game;
    const porExternalId = new Map(pendientes.map((s) => [s.externalId, s.id]));
    const buffers = new Map<string, DomainPrint[]>();
    const UMBRAL = 500;

    this.#progress({ type: 'bulk_started', game });

    for await (const print of adapter.fetchAllPrints()) {
      const setId = porExternalId.get(print.setExternalId);
      if (setId === undefined) continue; // set ya ingestado o fuera del lote

      const buffer = buffers.get(print.setExternalId) ?? [];
      buffer.push(print);
      buffers.set(print.setExternalId, buffer);

      if (buffer.length >= UMBRAL) {
        report.impresiones += await this.#repo.savePrints(game, setId, buffer);
        buffers.set(print.setExternalId, []);
        this.#progress({ type: 'bulk_progress', game, prints: report.impresiones });
      }
    }

    // Vuelca lo que quede y marca. El marcado va al FINAL de todo el volcado:
    // hasta que no se ha leido entero no se sabe si un set tenia mas cartas.
    for (const [externalId, buffer] of buffers) {
      const setId = porExternalId.get(externalId)!;
      if (buffer.length > 0) report.impresiones += await this.#repo.savePrints(game, setId, buffer);
      await this.#repo.markSetIngested(setId);
      report.setsProcesados += 1;
      this.#progress({ type: 'set_done', game, set: externalId, prints: buffer.length });
    }
  }

  /** Camino incremental: un set cada vez, aislando fallos. */
  async #ingestIncremental(
    adapter: GameAdapter,
    todos: DomainSet[],
    pendientes: Array<{ id: number; externalId: string }>,
    report: IngestReport,
  ): Promise<void> {
    const game = adapter.game;
    const porExternalId = new Map(todos.map((s) => [s.externalId, s]));

    for (const pendiente of pendientes) {
      const set = porExternalId.get(pendiente.externalId);
      if (!set) {
        // El set esta en la base de datos pero el origen ya no lo lista.
        this.#warn({
          game,
          subject: pendiente.externalId,
          code: 'malformed_field',
          message: `El set ${pendiente.externalId} esta en la base de datos pero el origen no lo devuelve`,
        });
        continue;
      }

      this.#progress({ type: 'set_started', game, set: set.externalId });

      try {
        let acumulado: DomainPrint[] = [];
        let total = 0;

        for await (const print of adapter.fetchPrints(set)) {
          acumulado.push(print);
          if (acumulado.length >= 500) {
            total += await this.#repo.savePrints(game, pendiente.id, acumulado);
            acumulado = [];
          }
        }
        if (acumulado.length > 0) total += await this.#repo.savePrints(game, pendiente.id, acumulado);

        // Marcar SOLO despues de persistir todo el set. Si se marcara antes, un
        // fallo a mitad dejaria el set como completo con la mitad de las cartas
        // y nadie volveria a mirarlo.
        await this.#repo.markSetIngested(pendiente.id);

        report.impresiones += total;
        report.setsProcesados += 1;
        this.#progress({ type: 'set_done', game, set: set.externalId, prints: total });
      } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        report.setsFallidos += 1;
        report.errores.push({ set: set.externalId, motivo });
        this.#progress({ type: 'set_failed', game, set: set.externalId, reason: motivo });
        // No se marca: la proxima ejecucion lo reintentara.
      }
    }
  }
}

function isBulkCapable(adapter: GameAdapter): adapter is GameAdapter & BulkCapable {
  const candidate = adapter as Partial<BulkCapable>;
  return typeof candidate.supportsBulk === 'function' && typeof candidate.fetchAllPrints === 'function';
}
