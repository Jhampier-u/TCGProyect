import { aggregate, sumZones } from './aggregate.js';
import { isMtgBasicLand } from './predicates.js';
import type { DeckIssue, DeckValidation, DeckValidator, DeckZone } from './types.js';

export const MTG_MIN_MAIN = 60;
export const MTG_MAX_SIDE = 15;
export const MTG_MAX_COPIES = 4;

/** Magic no usa Extra Deck. `commander` queda para cuando se aborde el formato. */
const ALLOWED_ZONES: readonly DeckZone[] = ['main', 'side'];

/** El limite de copias suma main y sideboard: asi cuenta Magic. */
const COUNTED_ZONES: readonly DeckZone[] = ['main', 'side'];

export const mtgValidator: DeckValidator<'MTG'> = {
  game: 'MTG',

  validate(entries): DeckValidation {
    const issues: DeckIssue[] = [];

    for (const entry of entries) {
      if (!ALLOWED_ZONES.includes(entry.zone)) {
        issues.push({
          code: 'unsupported_zone',
          message: `Magic no usa la zona "${entry.zone}"`,
          oracleKey: entry.oracleKey,
          cardName: entry.name,
          zone: entry.zone,
        });
      }
    }

    const { counts, byCard } = aggregate(entries);

    if (counts.main < MTG_MIN_MAIN) {
      issues.push({
        code: 'main_too_small',
        message: `El mazo principal tiene ${counts.main} cartas y el minimo son ${MTG_MIN_MAIN}`,
        actual: counts.main,
        allowed: MTG_MIN_MAIN,
      });
    }

    // Sin maximo para el main: Magic permite mazos mas grandes de 60.

    if (counts.side > MTG_MAX_SIDE) {
      issues.push({
        code: 'side_too_large',
        message: `El sideboard tiene ${counts.side} cartas y el maximo son ${MTG_MAX_SIDE}`,
        actual: counts.side,
        allowed: MTG_MAX_SIDE,
      });
    }

    // Indexado por NOMBRE, igual que `byCard` (P-027). Si esto se queda en
    // `oracleKey`, la exencion deja de aplicarse sin un solo error.
    const sinLimite = new Set<string>();
    for (const entry of entries) {
      if (isMtgBasicLand(entry.typeLine)) sinLimite.add(entry.name);
    }

    for (const [nombre, tally] of byCard) {
      if (sinLimite.has(nombre)) continue;
      const total = sumZones(tally.perZone, COUNTED_ZONES);
      if (total > MTG_MAX_COPIES) {
        issues.push({
          code: 'too_many_copies',
          message: `"${tally.name}" aparece ${total} veces y el maximo son ${MTG_MAX_COPIES}`,
          oracleKey: tally.oracleKey,
          cardName: tally.name,
          actual: total,
          allowed: MTG_MAX_COPIES,
        });
      }
    }

    return { valid: issues.length === 0, counts, issues };
  },
};
