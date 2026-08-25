import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { gunzipJsonLines, gunzipJsonObjects } from './jsonl.js';

/** Convierte un buffer en un flujo troceado, para forzar cortes en sitios incomodos. */
function chunked(data: Uint8Array, size: number): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < data.length; i += size) yield data.subarray(i, i + size);
    },
  };
}

function gzipLines(lines: string[]): Uint8Array {
  return new Uint8Array(gzipSync(Buffer.from(lines.join('\n'), 'utf8')));
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe('gunzipJsonLines', () => {
  it('lee lineas de un JSONL comprimido', async () => {
    const gz = gzipLines(['{"a":1}', '{"a":2}', '{"a":3}']);
    expect(await collect(gunzipJsonLines(chunked(gz, 1024)))).toEqual([
      '{"a":1}',
      '{"a":2}',
      '{"a":3}',
    ]);
  });

  it('devuelve la ultima linea aunque no acabe en salto', async () => {
    const gz = gzipLines(['{"a":1}', '{"a":2}']);
    expect(await collect(gunzipJsonLines(chunked(gz, 4)))).toHaveLength(2);
  });

  it('NO se rompe cuando el corte cae dentro de una linea', async () => {
    const lines = Array.from({ length: 50 }, (_, i) => JSON.stringify({ n: i, pad: 'x'.repeat(40) }));
    const gz = gzipLines(lines);
    // Troceo byte a byte: el caso mas hostil posible.
    const salida = await collect(gunzipJsonLines(chunked(gz, 1)));
    expect(salida).toEqual(lines);
  });

  it('NO corrompe caracteres multibyte partidos entre dos chunks', async () => {
    // El motivo real de usar TextDecoder con { stream: true }. Los nombres de
    // carta de Scryfall llevan acentos, guiones largos y el simbolo de la barra
    // invertida en tipos como "Basic Land - Forest".
    const nombres = ['Ajani Vengeant', 'Jotun Grunt', 'Seance', 'Lim-Dul the Necromancer'];
    const lines = nombres.map((n) => JSON.stringify({ name: n + ' — prueba áéíóú' }));
    const gz = gzipLines(lines);
    const salida = await collect(gunzipJsonLines(chunked(gz, 3)));
    expect(salida.map((l) => JSON.parse(l).name)).toEqual(
      nombres.map((n) => n + ' — prueba áéíóú'),
    );
  });

  it('ignora lineas vacias', async () => {
    const gz = gzipLines(['{"a":1}', '', '   ', '{"a":2}']);
    expect(await collect(gunzipJsonLines(chunked(gz, 8)))).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('tolera un volcado vacio', async () => {
    expect(await collect(gunzipJsonLines(chunked(gzipLines([]), 16)))).toEqual([]);
  });
});

describe('gunzipJsonObjects', () => {
  it('parsea cada linea', async () => {
    const gz = gzipLines([JSON.stringify({ id: 'a' }), JSON.stringify({ id: 'b' })]);
    const objs = await collect(gunzipJsonObjects<{ id: string }>(chunked(gz, 32)));
    expect(objs.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('una linea corrupta NO aborta el volcado entero', async () => {
    // Perder 1 carta de 100.000 es asumible. Perder las 100.000 por una linea
    // mala, no. La ingesta debe degradarse, no caerse.
    const errores: string[] = [];
    const gz = gzipLines(['{"id":"a"}', '{esto no es json}', '{"id":"c"}']);
    const objs = await collect(
      gunzipJsonObjects<{ id: string }>(chunked(gz, 16), (line) => errores.push(line)),
    );

    expect(objs.map((o) => o.id)).toEqual(['a', 'c']);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('esto no es json');
  });
});

describe('memoria', () => {
  it('procesa un volcado grande sin acumularlo (P-004)', async () => {
    // 40.000 lineas de ~1 KB = ~40 MB descomprimidos. Se comprueba que el RSS no
    // crece de forma proporcional al fichero: si el lector acumulara, aqui se
    // notaria.
    const linea = JSON.stringify({ pad: 'y'.repeat(1000) });
    const gz = gzipLines(Array.from({ length: 40_000 }, () => linea));

    const antes = process.memoryUsage().heapUsed;
    let contadas = 0;
    for await (const _ of gunzipJsonLines(chunked(gz, 64 * 1024))) contadas += 1;
    const crecimiento = (process.memoryUsage().heapUsed - antes) / 1048576;

    expect(contadas).toBe(40_000);
    // 40 MB de datos: si se acumulasen, el crecimiento rondaria esa cifra.
    expect(crecimiento).toBeLessThan(20);
  });
});
