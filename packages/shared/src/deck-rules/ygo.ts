import { aggregate, sumZones } from './aggregate.js';
import { isYgoExtraDeckCard, ygoCopyLimit, YGO_DEFAULT_COPY_LIMIT } from './predicates.js';
import type { DeckIssue, DeckValidation, DeckValidator, DeckZone } from './types.js';

export const YGO_MIN_MAIN = 40;
export const YGO_MAX_MAIN = 60;
export const YGO_MAX_EXTRA = 15;
export const YGO_MAX_SIDE = 15;

const ALLOWED_ZONES: readonly DeckZone[] = ['main', 'extra', 'side'];
const COUNTED_ZONES: readonly DeckZone[] = ['main', 'extra', 'side'];

export const ygoValidator: DeckValidator<'YGO'> = {
  game: 'YGO',

  validate(entries): DeckValidation {
    const issues: DeckIssue[] = [];

    for (const entry of entries) {
      if (!ALLOWED_ZONES.includes(entry.zone)) {
        issues.push({
          code: 'unsupported_zone',
          message: `Yu-Gi-Oh! no usa la zona "${entry.zone}"`,
          oracleKey: entry.oracleKey,
          cardName: entry.name,
          zone: entry.zone,
        });
        continue;
      }

      // El Side Deck admite las dos clases de carta: se cambian entre partidas.
      // Solo el Main y el Extra estan renidos.
      const esExtra = isYgoExtraDeckCard(entry.typeLine);
      if (esExtra && entry.zone === 'main') {
        issues.push({
          code: 'wrong_zone',
          message: `"${entry.name}" es carta de Extra Deck y no puede ir en el Main Deck`,
          oracleKey: entry.oracleKey,
          cardName: entry.name,
          zone: entry.zone,
        });
      } else if (!esExtra && entry.zone === 'extra') {
        issues.push({
          code: 'wrong_zone',
          message: `"${entry.name}" no es carta de Extra Deck`,
          oracleKey: entry.oracleKey,
          cardName: entry.name,
          zone: entry.zone,
        });
      }
    }

    const { counts, byCard } = aggregate(entries);

    if (counts.main < YGO_MIN_MAIN) {
      issues.push({
        code: 'main_too_small',
        message: `El Main Deck tiene ${counts.main} cartas y el minimo son ${YGO_MIN_MAIN}`,
        actual: counts.main,
        allowed: YGO_MIN_MAIN,
      });
    } else if (counts.main > YGO_MAX_MAIN) {
      issues.push({
        code: 'main_too_large',
        message: `El Main Deck tiene ${counts.main} cartas y el maximo son ${YGO_MAX_MAIN}`,
        actual: counts.main,
        allowed: YGO_MAX_MAIN,
      });
    }

    if (counts.extra > YGO_MAX_EXTRA) {
      issues.push({
        code: 'extra_too_large',
        message: `El Extra Deck tiene ${counts.extra} cartas y el maximo son ${YGO_MAX_EXTRA}`,
        actual: counts.extra,
        allowed: YGO_MAX_EXTRA,
      });
    }

    if (counts.side > YGO_MAX_SIDE) {
      issues.push({
        code: 'side_too_large',
        message: `El Side Deck tiene ${counts.side} cartas y el maximo son ${YGO_MAX_SIDE}`,
        actual: counts.side,
        allowed: YGO_MAX_SIDE,
      });
    }

    // El limite de una carta es el mas restrictivo que se haya visto para ella:
    // dos impresiones de la misma carta traen el mismo estado de banlist, pero
    // depender de que la primera fila lo traiga seria fragil.
    const limites = new Map<string, number>();
    for (const entry of entries) {
      const limite = ygoCopyLimit(entry.gameData);
      const previo = limites.get(entry.oracleKey);
      limites.set(entry.oracleKey, previo === undefined ? limite : Math.min(previo, limite));
    }

    for (const [oracleKey, tally] of byCard) {
      const limite = limites.get(oracleKey) ?? YGO_DEFAULT_COPY_LIMIT;
      const total = sumZones(tally.perZone, COUNTED_ZONES);
      if (total <= limite) continue;

      const restringida = limite < YGO_DEFAULT_COPY_LIMIT;
      issues.push({
        code: restringida ? 'banned_card' : 'too_many_copies',
        message:
          limite === 0
            ? `"${tally.name}" esta prohibida por la banlist vigente`
            : `"${tally.name}" aparece ${total} veces y el maximo son ${limite}`,
        oracleKey,
        cardName: tally.name,
        actual: total,
        allowed: limite,
      });
    }

    return { valid: issues.length === 0, counts, issues };
  },
};
