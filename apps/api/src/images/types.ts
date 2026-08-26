import type { GameCode } from '@tcg/shared';

/**
 * Una impresion pendiente de tener su imagen re-hospedada.
 *
 * Corresponde a una fila de `card_prints` con `image_local_path IS NULL` y
 * `image_source_url IS NOT NULL`.
 */
export interface PendingImage {
  printId: number;
  game: GameCode;
  /** Codigo del set. Solo se usa para construir la ruta de destino. */
  setCode: string;
  /** `card_prints.external_id`. Da nombre al fichero. */
  externalId: string;
  imageSourceUrl: string;
}

/**
 * Acceso a `card_prints` para el job.
 *
 * Es una interfaz y no una implementacion concreta porque ADR-006 (ORM y
 * migrador) sigue abierta. El job no debe quedar atado a esa decision.
 */
export interface ImageRepository {
  /** Impresiones sin imagen local, hasta `limit`. */
  findPending(limit: number): Promise<PendingImage[]>;
  /** Fija `image_local_path`. Solo se llama cuando el fichero ya esta en disco. */
  markStored(printId: number, localPath: string): Promise<void>;
  /**
   * Suma un intento fallido (T-019). Al agotarlos, `findPending` deja de
   * devolver esa impresion: una URL rota se reintentaba en cada ejecucion.
   */
  markImageFailed(printId: number): Promise<void>;
}

/**
 * Conversion de imagen. Inyectable para poder probar el job sin `sharp` y para
 * poder cambiar de codificador sin tocar la logica de descarga.
 */
export interface ImageEncoder {
  /**
   * Convierte a WebP redimensionando a lo ancho si hace falta.
   * Nunca amplia una imagen mas pequena que `maxWidth`.
   */
  toWebp(input: Uint8Array, maxWidth: number): Promise<Uint8Array>;
}

/** Escritura en disco. Abstraida para poder probar sin tocar el sistema de ficheros. */
export interface ImageStore {
  /** true si ya existe algo en esa ruta relativa. */
  exists(relativePath: string): Promise<boolean>;
  /** Escribe creando los directorios intermedios. */
  save(relativePath: string, bytes: Uint8Array): Promise<void>;
}

/** Descarga de bytes. La implementacion real es `RateLimitedClient.stream`. */
export interface ImageDownloader {
  stream(url: string, init?: { headers?: Record<string, string> }): Promise<AsyncIterable<Uint8Array>>;
}

export interface HarvestReport {
  intentadas: number;
  descargadas: number;
  /** Ya estaban en disco: no se volvio a pedir al origen. */
  omitidas: number;
  fallidas: number;
  bytesOrigen: number;
  bytesGuardados: number;
  errores: Array<{ printId: number; url: string; motivo: string }>;
}
