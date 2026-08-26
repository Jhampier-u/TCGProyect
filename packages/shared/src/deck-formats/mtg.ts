import type { DeckZone } from '../deck-rules/types.js';
import type { DeckCodec, DeckExportEntry, DeckLine, FormatWarning, ParsedDeck } from './types.js';

/**
 * Formato de texto de Magic, el que aceptan Arena y los constructores web.
 *
 *   4 Lightning Bolt
 *   2 Snow-Covered Forest
 *
 *   Sideboard
 *   2 Pyroblast
 *
 * El sideboard se marca con la cabecera `Sideboard` O con una linea en blanco,
 * que es como lo escribe media internet. Cualquiera de las dos vale.
 */

/**
 * `4 Nombre`, `4x Nombre`, con `(SET) NUM` opcional al final.
 *
 * La `x` va dentro de su propio grupo opcional: escrito como `\s*[xX]?\s+`, la
 * forma sin `x` no casa, porque solo hay un espacio que repartir entre los dos.
 */
const LINEA = /^(\d+)(?:\s*[xX])?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([A-Za-z0-9-]+))?)?$/;

export const mtgCodec: DeckCodec = {
  parse(texto: string): ParsedDeck {
    const lines: DeckLine[] = [];
    const warnings: FormatWarning[] = [];
    let zone: DeckZone = 'main';
    let vistaAlgunaCarta = false;

    texto.split(/\r?\n/).forEach((cruda, i) => {
      const linea = cruda.trim();

      if (linea === '') {
        // Primera linea en blanco despues de contenido: empieza el sideboard.
        if (vistaAlgunaCarta && zone === 'main') zone = 'side';
        return;
      }
      if (/^sideboard\b/i.test(linea)) {
        zone = 'side';
        return;
      }
      if (/^deck\b/i.test(linea)) {
        zone = 'main';
        return;
      }

      const m = LINEA.exec(linea);
      if (!m) {
        warnings.push({ line: i + 1, text: linea, reason: 'unparsable' });
        return;
      }

      const quantity = Number(m[1]);
      if (quantity <= 0) {
        warnings.push({ line: i + 1, text: linea, reason: 'zero_quantity' });
        return;
      }

      vistaAlgunaCarta = true;
      const entrada: DeckLine = { quantity, zone, name: m[2]!.trim() };
      if (m[3]) entrada.setCode = m[3];
      if (m[4]) entrada.collectorNumber = m[4];
      lines.push(entrada);
    });

    return { lines, warnings };
  },

  serialize(entries: readonly DeckExportEntry[]): string {
    const main = entries.filter((e) => e.zone === 'main');
    const side = entries.filter((e) => e.zone === 'side');

    const bloque = (xs: readonly DeckExportEntry[]): string =>
      xs.map((e) => `${e.quantity} ${e.name}`).join('\n');

    if (side.length === 0) return bloque(main);
    return `${bloque(main)}\n\nSideboard\n${bloque(side)}`;
  },
};
