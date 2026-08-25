import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';

/**
 * Lectura en streaming de un volcado JSONL comprimido en gzip.
 *
 * RESUELVE P-004. El volcado `default_cards` de Scryfall son 74 MB comprimidos
 * que descomprimen a varios cientos. Un `JSON.parse` del fichero entero mata el
 * proceso por falta de memoria.
 *
 * El formato juega a favor: desde 2025 Scryfall sirve los volcados como JSONL
 * (un objeto JSON completo por linea, sin array envolvente), no como un unico
 * array gigante. Verificado el 2026-08-25: el fichero empieza por '{', no por
 * '['. Eso convierte el troceado en algo trivial y robusto — partir por saltos
 * de linea — en vez de exigir un analizador de JSON incremental propio.
 *
 * Memoria: en todo momento se retiene un chunk del descompresor mas, como mucho,
 * una linea incompleta. Da igual que el fichero pese 500 MB o 5 GB.
 */
export async function* gunzipJsonLines(source: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const gunzip = createGunzip();
  // `Readable.from` acepta cualquier async-iterable, incluido el ReadableStream
  // web que devuelve el fetch de Node.
  Readable.from(source).pipe(gunzip);

  // `stream: true` es imprescindible: un caracter multibyte (los nombres de
  // carta llevan acentos, guiones largos y simbolos) puede quedar partido entre
  // dos chunks. Sin el, se corrompe silenciosamente.
  const decoder = new TextDecoder('utf-8');
  let carry = '';

  for await (const chunk of gunzip) {
    carry += decoder.decode(chunk as Uint8Array, { stream: true });

    let newline = carry.indexOf('\n');
    while (newline !== -1) {
      const line = carry.slice(0, newline).trim();
      carry = carry.slice(newline + 1);
      if (line !== '') yield line;
      newline = carry.indexOf('\n');
    }
  }

  // Vacia lo que quede en el decodificador y la ultima linea sin salto final.
  carry += decoder.decode();
  const last = carry.trim();
  if (last !== '') yield last;
}

/**
 * Igual que `gunzipJsonLines` pero devolviendo objetos ya parseados.
 *
 * Una linea corrupta NO aborta el volcado entero: se avisa y se sigue. Perder
 * una carta de 100.000 es asumible; perder las 100.000 por una linea mala, no.
 */
export async function* gunzipJsonObjects<T>(
  source: AsyncIterable<Uint8Array>,
  onParseError?: (line: string, error: Error) => void,
): AsyncGenerator<T> {
  for await (const line of gunzipJsonLines(source)) {
    try {
      yield JSON.parse(line) as T;
    } catch (error) {
      onParseError?.(line.slice(0, 200), error instanceof Error ? error : new Error(String(error)));
    }
  }
}
