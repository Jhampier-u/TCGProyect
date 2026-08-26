import { describe, it, expect } from 'vitest';
import { ptcgValidator, PTCG_DECK_SIZE, PTCG_MAX_COPIES } from './ptcg.js';
import type { DeckEntry, DeckIssueCode } from './types.js';

function card(over: Partial<DeckEntry<'PTCG'>>): DeckEntry<'PTCG'> {
  return {
    oracleKey: 'pikachu',
    name: 'Pikachu',
    typeLine: 'Pokemon - Basic',
    gameData: { supertype: 'Pokemon', subtypes: ['Basic'] },
    zone: 'main',
    quantity: 1,
    ...over,
  };
}

function relleno(cuantas: number): DeckEntry<'PTCG'>[] {
  return Array.from({ length: cuantas }, (_, i) =>
    card({ oracleKey: `relleno-${i}`, name: `Relleno ${i}` }),
  );
}

function codigos(entries: DeckEntry<'PTCG'>[]): DeckIssueCode[] {
  return ptcgValidator.validate(entries).issues.map((issue) => issue.code);
}

const ENERGIA_BASICA: Partial<DeckEntry<'PTCG'>> = {
  oracleKey: 'basic-fire',
  name: 'Basic Fire Energy',
  typeLine: 'Energy - Basic',
  gameData: { supertype: 'Energy', subtypes: ['Basic'] },
};

const ENERGIA_ESPECIAL: Partial<DeckEntry<'PTCG'>> = {
  oracleKey: 'double-turbo',
  name: 'Double Turbo Energy',
  typeLine: 'Energy - Special',
  gameData: { supertype: 'Energy', subtypes: ['Special'] },
};

describe('ptcgValidator', () => {
  it('exactamente 60 cartas es valido', () => {
    const resultado = ptcgValidator.validate(relleno(60));
    expect(resultado.valid).toBe(true);
    expect(PTCG_DECK_SIZE).toBe(60);
  });

  it('59 y 61 son invalidos: el tamano es EXACTO', () => {
    expect(codigos(relleno(59))).toContain('main_too_small');
    expect(codigos(relleno(61))).toContain('main_too_large');
  });

  it('mas de 4 copias por nombre es too_many_copies', () => {
    const issue = ptcgValidator
      .validate([...relleno(55), card({ quantity: 5 })])
      .issues.find((i) => i.code === 'too_many_copies');
    expect(issue?.actual).toBe(5);
    expect(issue?.allowed).toBe(PTCG_MAX_COPIES);
  });

  it('la Energia Basica no tiene limite', () => {
    const energia = card({ ...ENERGIA_BASICA, quantity: 15 });
    expect(ptcgValidator.validate([...relleno(45), energia]).valid).toBe(true);
  });

  it('la Energia ESPECIAL si esta limitada a 4 (la trampa)', () => {
    const energia = card({ ...ENERGIA_ESPECIAL, quantity: 5 });
    expect(codigos([...relleno(55), energia])).toContain('too_many_copies');
  });

  it('rechaza cualquier zona que no sea main', () => {
    expect(codigos([...relleno(60), card({ zone: 'side' })])).toContain('unsupported_zone');
    expect(codigos([...relleno(60), card({ zone: 'extra' })])).toContain('unsupported_zone');
  });

  it('el mazo vacio es invalido pero no lanza', () => {
    expect(ptcgValidator.validate([]).valid).toBe(false);
  });
});
