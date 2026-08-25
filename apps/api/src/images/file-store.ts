import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { ImageStore } from './types.js';

/**
 * Almacen de imagenes en el sistema de ficheros local.
 *
 * La raiz sale de `STORAGE_PATH`. El directorio esta en `.gitignore`: son varios
 * GB de binarios que no pintan nada en un repositorio.
 */
export class FileImageStore implements ImageStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await access(this.#absolute(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async save(relativePath: string, bytes: Uint8Array): Promise<void> {
    const target = this.#absolute(relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }

  /**
   * Resuelve la ruta y comprueba que no se escapa de la raiz.
   *
   * Las rutas se construyen a partir de `external_id`, que viene de una API
   * externa. `sanitizeSegment` ya limpia los segmentos, pero esta segunda
   * comprobacion es la que garantiza que un dato del origen nunca pueda escribir
   * fuera del directorio de almacenamiento.
   */
  #absolute(relativePath: string): string {
    const target = resolve(join(this.#root, relativePath));
    if (target !== this.#root && !target.startsWith(this.#root + sep)) {
      throw new Error(`Ruta fuera del almacen: ${relativePath}`);
    }
    return target;
  }
}
