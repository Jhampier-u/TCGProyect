import type { GameCode, IngestWarningSink } from '@tcg/shared';
import type {
  HarvestReport,
  ImageDownloader,
  ImageEncoder,
  ImageRepository,
  ImageStore,
  PendingImage,
} from './types.js';

/** Ancho de la variante que se guarda. Decision de `03_Infraestructura.md`. */
export const SMALL_WIDTH = 245;

/**
 * Tope duro de descargas por ejecucion.
 *
 * No es una optimizacion: es un freno de mano. Un fallo que hiciera que
 * `markStored` no persistiera convertiria el job en un bucle que pide las mismas
 * imagenes una y otra vez. Contra YGOPRODeck eso es una lista negra de IP
 * permanente (P-001). Con un tope, el peor caso esta acotado.
 */
export const DEFAULT_MAX_PER_RUN = 5_000;

export interface ImageHarvesterOptions {
  repository: ImageRepository;
  downloader: ImageDownloader;
  encoder: ImageEncoder;
  store: ImageStore;
  onWarning?: IngestWarningSink;
  maxPerRun?: number;
  width?: number;
}

/**
 * Job `image-harvest`. Implementa T-014 y cierra la segunda mitad de P-001.
 *
 * LA REGLA QUE JUSTIFICA TODO ESTE FICHERO. YGOPRODeck prohibe explicitamente
 * enlazar sus imagenes en caliente y castiga con **lista negra de IP**: "descarga
 * la imagen UNA vez y re-hospedala". El incumplimiento no da un error que se
 * pueda reintentar; deja el juego inaccesible.
 *
 * Por eso este job existe y por eso el frontend nunca recibe una URL externa: el
 * unico campo que se sirve es `image_local_path`, y `image_source_url` no debe
 * salir jamas de la capa de ingesta.
 *
 * La regla se aplica a los TRES juegos aunque solo YGOPRODeck la exija de forma
 * expresa. Uniformidad barata que evita que alguien "optimice" en el futuro
 * enlazando directo en un juego y luego copie el patron al otro.
 *
 * Tres salvaguardas contra pedir dos veces la misma imagen:
 *  1. Se consulta el disco antes de descargar. Si el fichero ya esta, no se pide.
 *  2. Se escribe en disco ANTES de marcar en base de datos. Si el proceso muere
 *     entre ambos pasos, la salvaguarda 1 evita la segunda descarga.
 *  3. Tope de descargas por ejecucion.
 */
export class ImageHarvester {
  readonly #repo: ImageRepository;
  readonly #downloader: ImageDownloader;
  readonly #encoder: ImageEncoder;
  readonly #store: ImageStore;
  readonly #warn: IngestWarningSink;
  readonly #maxPerRun: number;
  readonly #width: number;

  constructor(options: ImageHarvesterOptions) {
    this.#repo = options.repository;
    this.#downloader = options.downloader;
    this.#encoder = options.encoder;
    this.#store = options.store;
    this.#warn = options.onWarning ?? (() => {});
    this.#maxPerRun = options.maxPerRun ?? DEFAULT_MAX_PER_RUN;
    this.#width = options.width ?? SMALL_WIDTH;
  }

  async run(): Promise<HarvestReport> {
    const report: HarvestReport = {
      intentadas: 0,
      descargadas: 0,
      omitidas: 0,
      fallidas: 0,
      bytesOrigen: 0,
      bytesGuardados: 0,
      errores: [],
    };

    const pendientes = await this.#repo.findPending(this.#maxPerRun);

    for (const pending of pendientes) {
      report.intentadas += 1;
      const relativePath = buildImagePath(pending, this.#width);

      // SALVAGUARDA 1: si ya esta en disco, la base de datos solo iba retrasada.
      // Se corrige el registro sin volver a molestar al origen.
      if (await this.#store.exists(relativePath)) {
        await this.#repo.markStored(pending.printId, relativePath);
        report.omitidas += 1;
        continue;
      }

      try {
        const original = await this.#collect(pending.imageSourceUrl);
        const webp = await this.#encoder.toWebp(original, this.#width);

        // SALVAGUARDA 2: disco primero, base de datos despues. Al reves, un fallo
        // de escritura dejaria una fila apuntando a un fichero inexistente.
        await this.#store.save(relativePath, webp);
        await this.#repo.markStored(pending.printId, relativePath);

        report.descargadas += 1;
        report.bytesOrigen += original.byteLength;
        report.bytesGuardados += webp.byteLength;
      } catch (error) {
        // Una imagen que falla no puede tumbar la cosecha entera: quedaria un
        // catalogo a medio ilustrar y sin forma de saber donde se corto.
        const motivo = error instanceof Error ? error.message : String(error);

        // Se anota el intento (T-019). Sin esto, una URL permanentemente rota
        // vuelve a la cola en cada ejecucion: gasta peticiones contra el origen
        // y llena el informe de las mismas fallidas de siempre, hasta que nadie
        // lo lee.
        await this.#repo.markImageFailed(pending.printId);

        report.fallidas += 1;
        report.errores.push({ printId: pending.printId, url: pending.imageSourceUrl, motivo });
        this.#warn({
          game: pending.game,
          subject: String(pending.printId),
          code: 'missing_image',
          message: `No se pudo cosechar ${pending.imageSourceUrl}: ${motivo}`,
        });
      }
    }

    return report;
  }

  async #collect(url: string): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of await this.#downloader.stream(url)) {
      chunks.push(chunk);
      total += chunk.byteLength;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }
}

/**
 * Ruta relativa de destino: `mtg/blb/0000419b-....245.webp`
 *
 * Se agrupa por juego y set para no acabar con 110.000 ficheros en un solo
 * directorio, que degrada cualquier sistema de ficheros y hace inutilizable un
 * `ls`. El ancho va en el nombre para poder anadir la variante grande despues
 * sin renombrar nada.
 */
export function buildImagePath(pending: PendingImage, width: number): string {
  const game = pending.game.toLowerCase();
  const set = sanitizeSegment(pending.setCode) || 'sin-set';
  const file = sanitizeSegment(pending.externalId) || String(pending.printId);
  return `${game}/${set}/${file}.${width}.webp`;
}

/**
 * Deja un segmento apto para el sistema de ficheros.
 *
 * No es cosmetico. Los `external_id` de Yu-Gi-Oh! son del tipo
 * `SUDA-EN049::quarter_century_secret_rare`: los dos puntos son ilegales en
 * nombres de fichero de Windows, y un `..` permitiria escribir fuera del
 * directorio de almacenamiento.
 */
export function sanitizeSegment(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    // El `..` va DESPUES de sustituir los caracteres ilegales: si no, `a/../b`
    // se convertiria en `a-..-b` y el `..` sobreviviria.
    .replace(/\.{2,}/g, '-')
    // Colapsa los guiones que dejan los pasos anteriores, para que los nombres
    // de fichero no queden como `suda-en049---secret-rare`.
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120);
}

/**
 * Comprueba que una ruta almacenada es local y relativa.
 *
 * Es la barrera que hace cumplir el invariante de P-001. Se usa en los tests y
 * deberia usarse en el serializador de la API: si alguna vez una URL externa
 * llegara a `image_local_path`, el frontend empezaria a enlazar en caliente y
 * el bloqueo llegaria sin previo aviso.
 */
export function isSafeLocalPath(path: string): boolean {
  if (path === '') return false;
  if (/^[a-z]+:\/\//i.test(path)) return false; // http://, https://, file://
  if (path.startsWith('/') || path.startsWith('\\')) return false;
  if (/^[a-z]:/i.test(path)) return false; // C:\...
  if (path.includes('..')) return false;
  return true;
}

/** Juegos soportados, para validar el primer segmento de la ruta. */
export const IMAGE_ROOT_SEGMENTS: ReadonlyArray<Lowercase<GameCode>> = ['mtg', 'ygo', 'ptcg'];
