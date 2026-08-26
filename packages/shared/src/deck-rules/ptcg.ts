import { aggregate, sumZones } from './aggregate.js';
import { isPtcgBasicEnergy } from './predicates.js';
import type { DeckIssue, DeckValidation, DeckValidator, DeckZone } from './types.js';

/** Pokemon exige EXACTAMENTE 60 cartas. Ni 59 ni 61. */
export const PTCG_DECK_SIZE = 60;
export const PTCG_MAX_COPIES = 4;

const ALLOWED_ZONES: readonly DeckZone[] = ['main'];
const COUNTED_ZONES: readonly DeckZone[] = ['main'];

export const ptcgValidator: DeckValidator<'PTCG'> = {
  game: 'PTCG',

  validate(entries): DeckValidation {
    const issues: DeckIssue[] = [];

    for (const entry of entries) {
      if (!ALLOWED_ZONES.includes(entry.zone)) {
        issues.push({
          code: 'unsupported_zone',
          message: `Pokemon no usa la zona "${entry.zone}"`,
          oracleKey: entry.oracleKey,
          cardName: entry.name,
          zone: entry.zone,
        });
      }
    }

    const { counts, byCard } = aggregate(entries);

    if (counts.main < PTCG_DECK_SIZE) {
      issues.push({
        code: 'main_too_small',
        message: `El mazo tiene ${counts.main} cartas y deben ser exactamente ${PTCG_DECK_SIZE}`,
        actual: counts.main,
        allowed: PTCG_DECK_SIZE,
      });
    } else if (counts.main > PTCG_DECK_SIZE) {
      issues.push({
        code: 'main_too_large',
        message: `El mazo tiene ${counts.main} cartas y deben ser exactamente ${PTCG_DECK_SIZE}`,
        actual: counts.main,
        allowed: PTCG_DECK_SIZE,
      });
    }

    const sinLimite = new Set<string>();
    for (const entry of entries) {
      if (isPtcgBasicEnergy(entry.gameData)) sinLimite.add(entry.oracleKey);
    }

    for (const [oracleKey, tally] of byCard) {
      if (sinLimite.has(oracleKey)) continue;
      const total = sumZones(tally.perZone, COUNTED_ZONES);
      if (total > PTCG_MAX_COPIES) {
        issues.push({
          code: 'too_many_copies',
          message: `"${tally.name}" aparece ${total} veces y el maximo son ${PTCG_MAX_COPIES}`,
          oracleKey,
          cardName: tally.name,
          actual: total,
          allowed: PTCG_MAX_COPIES,
        });
      }
    }

    return { valid: issues.length === 0, counts, issues };
  },
};
