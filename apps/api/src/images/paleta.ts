import sharp from 'sharp';
import type { GameCode } from '@tcg/shared';

export interface Paleta {
  primario: string;
  secundario: string;
}

/** Caja de la ilustracion, en fracciones de la imagen. */
export interface Recorte {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const RECORTE_POR_DEFECTO: Recorte = { x0: 0.12, x1: 0.88, y0: 0.11, y1: 0.55 };

/** El arte de Yu-Gi-Oh! esta mas abajo que el de Pokemon y Magic. */
export const RECORTES: Record<GameCode, Recorte> = {
  PTCG: RECORTE_POR_DEFECTO,
  MTG: RECORTE_POR_DEFECTO,
  YGO: { x0: 0.13, x1: 0.87, y0: 0.19, y1: 0.66 },
};

type Rgb = readonly [number, number, number];

const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const distancia = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Dos colores de una imagen: el que mas pesa y el primero que se distinga de el.
 *
 * Solo se mira la ILUSTRACION: se recorta el centro de la carta (por defecto 12% a 88% del
 * ancho, 11% a 55% del alto; cada juego tiene su caja en `RECORTES`), donde esta la caja de arte, para que el marco
 * amarillo de una carta Pokemon no sea "el color" del set. Una imagen pequena
 * (un icono, menos de 100px) no se recorta. Luego se reduce a 32x32 y se agrupa
 * en cubos de 3 bits por canal. Cada pixel pesa saturacion^2 * brillo y los
 * grises y los negros (saturacion < 0.2 o brillo < 0.15) se descartan: ocupan
 * mucho y no son color. Solo si no sobrevive ningun pixel (imagen gris de
 * verdad) se usa el peso antiguo, para devolver siempre dos colores.
 * Determinista y sin red: lee la imagen que ya esta en `storage/`.
 */
export async function paletaDe(imagen: Buffer, recorte: Recorte = RECORTE_POR_DEFECTO): Promise<Paleta> {
  const meta = await sharp(imagen).metadata();
  const ancho = meta.width ?? 0;
  const alto = meta.height ?? 0;
  let tubo = sharp(imagen);
  if (ancho >= 100 && alto >= 100) {
    const left = Math.round(ancho * recorte.x0);
    const top = Math.round(alto * recorte.y0);
    tubo = tubo.extract({
      left,
      top,
      width: Math.max(1, Math.round(ancho * recorte.x1) - left),
      height: Math.max(1, Math.round(alto * recorte.y1) - top),
    });
  }
  const { data, info } = await tubo
    .resize(32, 32, { fit: 'cover' })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`se esperaban 3 canales y hay ${info.channels}`);

  type Cubo = { r: number; g: number; b: number; peso: number };
  const estricto = new Map<number, Cubo>();
  const laxo = new Map<number, Cubo>();
  const sumar = (m: Map<number, Cubo>, clave: number, r: number, g: number, b: number, peso: number) => {
    const c = m.get(clave) ?? { r: 0, g: 0, b: 0, peso: 0 };
    c.r += r * peso;
    c.g += g * peso;
    c.b += b * peso;
    c.peso += peso;
    m.set(clave, c);
  };
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturacion = max === 0 ? 0 : (max - min) / max;
    const valor = max / 255;
    const clave = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    sumar(laxo, clave, r, g, b, 0.15 + saturacion * valor);
    if (valor >= 0.15 && saturacion >= 0.2) sumar(estricto, clave, r, g, b, saturacion * saturacion * valor);
  }
  const cubos = estricto.size > 0 ? estricto : laxo;

  const colores: Rgb[] = [...cubos.values()]
    .sort((a, b) => b.peso - a.peso)
    .map((c) => [c.r / c.peso, c.g / c.peso, c.b / c.peso] as const);

  const primero: Rgb = colores[0] ?? [40, 40, 60];
  const segundo: Rgb =
    colores.find((c) => distancia(c, primero) > 90) ?? [primero[0] * 0.4, primero[1] * 0.4, primero[2] * 0.4];
  return { primario: hex(primero), secundario: hex(segundo) };
}
