import type { PtcgGameData } from '../game-data.js';
import type { DeckCodec, DeckExportEntry, DeckLine, FormatWarning, ParsedDeck } from './types.js';

/**
 * Formato de PTCG Live.
 *
 *   Pokemon: 12
 *   4 Pikachu SVI 47
 *
 *   Trainer: 30
 *   4 Acerola's Mischief ME1 113
 *
 *   Total Cards: 60
 *
 * Las cabeceras agrupan por SUPERTIPO, no por zona: Pokemon solo usa `main`. Al
 * leer se ignoran; al escribir se emiten porque es lo que espera el juego.
 *
 * La cabecera lleva `Pokemon` con acento en la e. El fuente se mantiene en ASCII
 * puro, asi que se construye; al leer se aceptan las dos grafias.
 */
const POKEMON_ACENTUADO = `Pok${String.fromCharCode(0x00e9)}mon`;

/**
 * `4 Resto`. El set y el numero se separan DESPUES, mirando los dos ultimos
 * tokens: meterlo todo en una regex con grupo opcional y nombre perezoso es
 * fragil con nombres que acaban en numero.
 */
const LINEA = /^(\d+)\s+(.+)$/;
const SET = /^[A-Za-z][A-Za-z0-9]{1,9}$/;
const NUMERO = /^[A-Za-z0-9]{1,6}$/;

/**
 * Quita los diacriticos para comparar sin depender de la grafia.
 *
 * `\p{M}` en vez de un literal acentuado: el fuente se mantiene en ASCII puro,
 * y es la misma tecnica que usa `normalizeRarityCode`.
 */
function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Cabeceras de seccion y el total. Se ignoran al leer. */
const CABECERA = /^(pokemon|trainer|energy|total cards)\s*:/i;

export const ptcgCodec: DeckCodec = {
  parse(texto: string): ParsedDeck {
    const lines: DeckLine[] = [];
    const warnings: FormatWarning[] = [];

    texto.split(/\r?\n/).forEach((cruda, i) => {
      const linea = cruda.trim();
      if (linea === '') return;
      if (CABECERA.test(sinAcentos(linea))) return;

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

      const tokens = m[2]!.trim().split(/\s+/);
      const entrada: DeckLine = { quantity, zone: 'main', name: tokens.join(' ') };

      // Los dos ultimos tokens son el set y el numero SOLO si tienen la forma
      // adecuada. "4 Pikachu" no los lleva, y un nombre puede acabar en cifra.
      const numero = tokens[tokens.length - 1];
      const set = tokens[tokens.length - 2];
      if (tokens.length >= 3 && numero && set && NUMERO.test(numero) && SET.test(set)) {
        entrada.name = tokens.slice(0, -2).join(' ');
        entrada.setCode = set;
        entrada.collectorNumber = numero;
        // `SVI 47` -> `svi-47`, que es nuestro oracle_key para este juego.
        entrada.externalId = `${set.toLowerCase()}-${numero.toLowerCase()}`;
      }
      lines.push(entrada);
    });

    return { lines, warnings };
  },

  serialize(entries: readonly DeckExportEntry[]): string {
    const supertipoDe = (e: DeckExportEntry): string =>
      ((e.gameData as PtcgGameData | undefined)?.supertype ?? 'Trainer').trim();

    const secciones: Array<{ etiqueta: string; coincide: (s: string) => boolean }> = [
      { etiqueta: POKEMON_ACENTUADO, coincide: (s) => /^pokemon$/i.test(sinAcentos(s)) },
      { etiqueta: 'Trainer', coincide: (s) => /^trainer$/i.test(s) },
      { etiqueta: 'Energy', coincide: (s) => /^energy$/i.test(s) },
    ];

    const partes: string[] = [];
    let total = 0;

    for (const seccion of secciones) {
      const suyas = entries.filter((e) => seccion.coincide(supertipoDe(e)));
      if (suyas.length === 0) continue;
      const cuenta = suyas.reduce((n, e) => n + e.quantity, 0);
      total += cuenta;
      partes.push(`${seccion.etiqueta}: ${cuenta}`);
      for (const e of suyas) {
        partes.push(`${e.quantity} ${e.name} ${e.setCode} ${e.collectorNumber}`);
      }
      partes.push('');
    }

    partes.push(`Total Cards: ${total}`);
    return partes.join('\n');
  },
};
