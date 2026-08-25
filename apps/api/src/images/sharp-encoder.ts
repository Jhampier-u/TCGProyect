import sharp from 'sharp';
import type { ImageEncoder } from './types.js';

/**
 * Codificador WebP sobre `sharp` (libvips).
 *
 * POR QUE WEBP. El presupuesto de `03_Infraestructura.md`: ~110.000 impresiones.
 * En JPEG/PNG original rondarian los 20-30 GB; en WebP a 245 px de ancho, unos
 * 6-7 GB. La diferencia decide si el almacenamiento es un detalle o un problema.
 *
 * `withoutEnlargement` evita ampliar una imagen que ya sea mas estrecha que el
 * objetivo: ampliar no anade informacion y si multiplica el peso.
 */
export class SharpImageEncoder implements ImageEncoder {
  constructor(private readonly quality = 82) {}

  async toWebp(input: Uint8Array, maxWidth: number): Promise<Uint8Array> {
    const output = await sharp(input)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality: this.quality })
      .toBuffer();
    return new Uint8Array(output);
  }
}
