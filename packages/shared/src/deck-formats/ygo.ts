import type { DeckZone } from '../deck-rules/types.js';
import type { DeckCodec, DeckExportEntry, DeckLine, FormatWarning, ParsedDeck } from './types.js';

/**
 * El `.ydk`, formato universal de Yu-Gi-Oh!.
 *
 *   #created by ProyectoTCG
 *   #main
 *   89631139
 *   89631139
 *   #extra
 *   !side
 *
 * Dos cosas que se olvidan al escribir un parser de esto:
 *  - NO hay cantidades. Tres copias son tres lineas iguales.
 *  - El separador del side es `!`, no `#`.
 *
 * El passcode es exactamente nuestro `oracle_key` para este juego, asi que la
 * ida y vuelta es exacta y no hay ninguna ambiguedad que resolver.
 */

const CABECERA = '#created by ProyectoTCG';

export const ygoCodec: DeckCodec = {
  parse(texto: string): ParsedDeck {
    const warnings: FormatWarning[] = [];
    // Se cuenta por (zona, passcode) y se agrupa al final, porque el formato
    // repite la linea una vez por copia.
    const cuenta = new Map<string, { zone: DeckZone; externalId: string; quantity: number }>();

    let zone: DeckZone = 'main';

    texto.split(/\r?\n/).forEach((cruda, i) => {
      const linea = cruda.trim();
      if (linea === '') return;

      if (linea.startsWith('!')) {
        if (/^!side\b/i.test(linea)) zone = 'side';
        return;
      }
      if (linea.startsWith('#')) {
        if (/^#main\b/i.test(linea)) zone = 'main';
        else if (/^#extra\b/i.test(linea)) zone = 'extra';
        // Cualquier otro `#` es un comentario: `#created by ...`. No se avisa.
        return;
      }

      if (!/^\d+$/.test(linea)) {
        warnings.push({ line: i + 1, text: linea, reason: 'unparsable' });
        return;
      }

      const clave = `${zone}:${linea}`;
      const previo = cuenta.get(clave);
      if (previo) previo.quantity += 1;
      else cuenta.set(clave, { zone, externalId: linea, quantity: 1 });
    });

    const lines: DeckLine[] = [...cuenta.values()].map((c) => ({
      quantity: c.quantity,
      zone: c.zone,
      externalId: c.externalId,
    }));

    return { lines, warnings };
  },

  serialize(entries: readonly DeckExportEntry[]): string {
    const bloque = (zone: DeckZone): string[] =>
      entries
        .filter((e) => e.zone === zone)
        .flatMap((e) => Array.from({ length: e.quantity }, () => e.oracleKey));

    return [
      CABECERA,
      '#main',
      ...bloque('main'),
      '#extra',
      ...bloque('extra'),
      '!side',
      ...bloque('side'),
    ].join('\n');
  },
};
