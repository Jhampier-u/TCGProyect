import { describe, it, expect } from 'vitest';
import {
  typesOf,
  isMtgBasicLand,
  isYgoExtraDeckCard,
  ygoCopyLimit,
  isPtcgBasicEnergy,
  YGO_DEFAULT_COPY_LIMIT,
} from './predicates.js';

/**
 * Los casos de aqui NO son inventados. Los de Yu-Gi-Oh! salen de un
 * SELECT DISTINCT type_line sobre el catalogo ingestado el 2026-08-25; los de
 * Magic y Pokemon, del formato documentado de Scryfall y de la API de Pokemon.
 * Ver 004Arquitectura/04_Spec_H7_Deckbuilder.md, seccion 3.3.
 */

const EM_DASH = String.fromCharCode(0x2014);

describe('typesOf', () => {
  it('se queda con lo que hay antes del guion largo', () => {
    expect(typesOf(`Basic Land ${EM_DASH} Forest`)).toBe('Basic Land');
    expect(typesOf(`Legendary Creature ${EM_DASH} Elf Druid`)).toBe('Legendary Creature');
  });

  it('tolera que no haya separador', () => {
    // Yu-Gi-Oh! nunca lo lleva, y en Magic tampoco lo llevan los hechizos.
    expect(typesOf('Continuous Spell')).toBe('Continuous Spell');
    expect(typesOf('Instant')).toBe('Instant');
  });

  it('tolera la ausencia de type_line', () => {
    expect(typesOf(null)).toBe('');
    expect(typesOf(undefined)).toBe('');
  });
});

describe('isMtgBasicLand', () => {
  it('reconoce la tierra basica', () => {
    expect(isMtgBasicLand(`Basic Land ${EM_DASH} Forest`)).toBe(true);
    expect(isMtgBasicLand('Basic Land')).toBe(true);
  });

  it('reconoce la tierra basica NEVADA (la trampa)', () => {
    // "Basic Snow Land" NO contiene la cadena "Basic Land". Un includes()
    // limitaria las nevadas a 4 copias, que es incorrecto: el predicado es el
    // supertipo "Basic", no la subcadena.
    expect(isMtgBasicLand(`Basic Snow Land ${EM_DASH} Forest`)).toBe(true);
  });

  it('no confunde una tierra no basica', () => {
    expect(isMtgBasicLand(`Land ${EM_DASH} Forest Island`)).toBe(false);
    expect(isMtgBasicLand(`Snow Land ${EM_DASH} Forest`)).toBe(false);
    expect(isMtgBasicLand(`Legendary Creature ${EM_DASH} Elf`)).toBe(false);
    expect(isMtgBasicLand(null)).toBe(false);
  });

  it('no mira los subtipos', () => {
    // Un subtipo llamado "Basic" no existe, pero si existiera no debe contar.
    expect(isMtgBasicLand(`Creature ${EM_DASH} Basic`)).toBe(false);
  });
});

describe('isYgoExtraDeckCard', () => {
  it('reconoce las cuatro familias con la grafia REAL del catalogo', () => {
    // El catalogo dice "Xyz Effect Monster", NO "XYZ". Un includes('XYZ')
    // dejaria los Xyz en el Main Deck sin un solo error.
    expect(isYgoExtraDeckCard('Xyz Effect Monster')).toBe(true);
    expect(isYgoExtraDeckCard('Fusion Effect Monster')).toBe(true);
    expect(isYgoExtraDeckCard('Synchro Effect Monster')).toBe(true);
    expect(isYgoExtraDeckCard('Link Effect Monster')).toBe(true);
  });

  it('reconoce los Pendulo que SI son de Extra Deck', () => {
    expect(isYgoExtraDeckCard('Fusion Pendulum Effect Monster')).toBe(true);
    expect(isYgoExtraDeckCard('Synchro Pendulum Effect Monster')).toBe(true);
  });

  it('deja en el Main Deck lo que le corresponde', () => {
    expect(isYgoExtraDeckCard('Effect Monster')).toBe(false);
    expect(isYgoExtraDeckCard('Toon Effect Monster')).toBe(false);
    expect(isYgoExtraDeckCard('Pendulum Effect Monster')).toBe(false);
    // Ritual NO es Extra Deck: el monstruo de Ritual vive en el Main Deck.
    expect(isYgoExtraDeckCard('Ritual Effect Monster')).toBe(false);
    expect(isYgoExtraDeckCard('Continuous Spell')).toBe(false);
    expect(isYgoExtraDeckCard('Quick-Play Spell')).toBe(false);
    expect(isYgoExtraDeckCard('Continuous Trap')).toBe(false);
    expect(isYgoExtraDeckCard(null)).toBe(false);
  });
});

describe('ygoCopyLimit', () => {
  it('aplica la banlist del TCG', () => {
    expect(ygoCopyLimit({ banlist_info: { ban_tcg: 'Banned' } })).toBe(0);
    expect(ygoCopyLimit({ banlist_info: { ban_tcg: 'Limited' } })).toBe(1);
    expect(ygoCopyLimit({ banlist_info: { ban_tcg: 'Semi-Limited' } })).toBe(2);
  });

  it('AUSENCIA de banlist_info significa 3 copias, no "no lo se" (la trampa)', () => {
    // El adaptador OMITE el campo cuando viene vacio: solo las cartas
    // restringidas lo llevan. Tratar la ausencia como desconocido dejaria el
    // 99 % del catalogo sin limite.
    expect(ygoCopyLimit({})).toBe(YGO_DEFAULT_COPY_LIMIT);
    expect(ygoCopyLimit({ banlist_info: {} })).toBe(YGO_DEFAULT_COPY_LIMIT);
    expect(YGO_DEFAULT_COPY_LIMIT).toBe(3);
  });

  it('ignora las banlists de OCG y GOAT', () => {
    // El proyecto valida contra el TCG. Mezclarlas prohibiria cartas legales.
    expect(ygoCopyLimit({ banlist_info: { ban_ocg: 'Banned' } })).toBe(3);
    expect(ygoCopyLimit({ banlist_info: { ban_goat: 'Limited' } })).toBe(3);
  });
});

describe('isPtcgBasicEnergy', () => {
  it('reconoce la Energia Basica', () => {
    expect(isPtcgBasicEnergy({ supertype: 'Energy', subtypes: ['Basic'] })).toBe(true);
  });

  it('NO considera basica la Energia Especial (la trampa)', () => {
    // supertype === 'Energy' a secas incluiria las Especiales, que SI estan
    // limitadas a 4 copias.
    expect(isPtcgBasicEnergy({ supertype: 'Energy', subtypes: ['Special'] })).toBe(false);
    expect(isPtcgBasicEnergy({ supertype: 'Energy' })).toBe(false);
  });

  it('no confunde un Pokemon Basico con una Energia Basica', () => {
    expect(isPtcgBasicEnergy({ supertype: 'Pokemon', subtypes: ['Basic'] })).toBe(false);
    expect(isPtcgBasicEnergy({ supertype: 'Trainer', subtypes: ['Item'] })).toBe(false);
    expect(isPtcgBasicEnergy({})).toBe(false);
  });
});
