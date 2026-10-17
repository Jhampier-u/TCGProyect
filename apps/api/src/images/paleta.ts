import sharp from 'sharp';

export interface Paleta {
  primario: string;
  secundario: string;
}

type Rgb = readonly [number, number, number];

const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const distancia = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Dos colores de una imagen: el que mas pesa y el primero que se distinga de el.
 *
 * Se reduce a 32x32 y se agrupa en cubos de 3 bits por canal. Cada pixel pesa
 * por su SATURACION y su brillo: el marco gris y el negro de una carta ocupan
 * mucho y no son su color. Determinista y sin red: lee la imagen que ya esta en
 * `storage/`.
 */
export async function paletaDe(imagen: Buffer): Promise<Paleta> {
  const { data, info } = await sharp(imagen)
    .resize(32, 32, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cubos = new Map<number, { r: number; g: number; b: number; peso: number }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturacion = max === 0 ? 0 : (max - min) / max;
    const peso = 0.15 + saturacion * (max / 255);
    const clave = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const c = cubos.get(clave) ?? { r: 0, g: 0, b: 0, peso: 0 };
    c.r += r * peso;
    c.g += g * peso;
    c.b += b * peso;
    c.peso += peso;
    cubos.set(clave, c);
  }

  const colores: Rgb[] = [...cubos.values()]
    .sort((a, b) => b.peso - a.peso)
    .map((c) => [c.r / c.peso, c.g / c.peso, c.b / c.peso] as const);

  const primero: Rgb = colores[0] ?? [40, 40, 60];
  const segundo: Rgb =
    colores.find((c) => distancia(c, primero) > 90) ?? [primero[0] * 0.4, primero[1] * 0.4, primero[2] * 0.4];
  return { primario: hex(primero), secundario: hex(segundo) };
}
