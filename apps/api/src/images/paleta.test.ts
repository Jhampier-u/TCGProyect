import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { paletaDe } from './paleta.js';

const HEX = /^#[0-9a-f]{6}$/;
const liso = (color: string) =>
  sharp({ create: { width: 32, height: 32, channels: 3, background: color } }).png().toBuffer();

async function partido(izquierda: string, derecha: string): Promise<Buffer> {
  const mitad = await sharp({ create: { width: 16, height: 32, channels: 3, background: izquierda } }).png().toBuffer();
  return sharp({ create: { width: 32, height: 32, channels: 3, background: derecha } })
    .composite([{ input: mitad, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

const rojizo = (h: string) => parseInt(h.slice(1, 3), 16) > parseInt(h.slice(5, 7), 16);

describe('la paleta de un set (H9e)', () => {
  it('siempre dos colores validos', async () => {
    const p = await paletaDe(await liso('#808080'));
    expect(p.primario).toMatch(HEX);
    expect(p.secundario).toMatch(HEX);
  });

  it('con dos colores fuertes, uno es el primario y el otro el secundario', async () => {
    const p = await paletaDe(await partido('#d02020', '#2040d0'));
    expect(rojizo(p.primario)).not.toBe(rojizo(p.secundario));
  });

  it('el gris pesa menos que el color: el marco de la carta no es su color', async () => {
    // Tres cuartas partes grises y una roja: gana el rojo.
    const gris = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#7a7a7a' } }).png().toBuffer();
    const rojo = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#e01818' } }).png().toBuffer();
    const img = await sharp(gris).composite([{ input: rojo, left: 0, top: 0 }]).png().toBuffer();
    expect(rojizo((await paletaDe(img)).primario)).toBe(true);
  });

  it('con un solo color, el secundario es una version oscura del primario', async () => {
    const p = await paletaDe(await liso('#30a050'));
    expect(p.secundario).not.toBe(p.primario);
  });
});
