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

  async function carta(fondo: string, color: string, r: { left: number; top: number; width: number; height: number }) {
    const base = sharp({ create: { width: 100, height: 140, channels: 3, background: fondo } });
    const pieza = await sharp({ create: { width: r.width, height: r.height, channels: 3, background: color } })
      .png()
      .toBuffer();
    return base.composite([{ input: pieza, left: r.left, top: r.top }]).png().toBuffer();
  }

  it('el marco no es el color', async () => {
    const img = await carta('#f0d020', '#2050d0', { left: 15, top: 20, width: 70, height: 50 });
    const p = await paletaDe(img);
    expect(parseInt(p.primario.slice(5, 7), 16)).toBeGreaterThan(parseInt(p.primario.slice(1, 3), 16));
  });

  it('el negro y el gris no ganan al color', async () => {
    const img = await carta('#151515', '#d03030', { left: 30, top: 25, width: 30, height: 30 });
    expect(rojizo((await paletaDe(img)).primario)).toBe(true);
  });

  it('una imagen gris sigue dando dos colores', async () => {
    const p = await paletaDe(await liso('#808080'));
    expect(p.primario).toMatch(HEX);
    expect(p.secundario).toMatch(HEX);
    expect(p.secundario).not.toBe(p.primario);
  });
});
