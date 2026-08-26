import { describe, it, expect } from 'vitest';
import { mtgValidator, MTG_MIN_MAIN, MTG_MAX_SIDE, MTG_MAX_COPIES } from './mtg.js';
import type { DeckEntry, DeckIssueCode } from './types.js';

const EM_DASH = String.fromCharCode(0x2014);

function card(over: Partial<DeckEntry<'MTG'>>): DeckEntry<'MTG'> {
  return {
    oracleKey: 'lightning-bolt',
    name: 'Lightning Bolt',
    typeLine: 'Instant',
    gameData: {},
    zone: 'main',
    quantity: 1,
    ...over,
  };
}

/** Rellena el main con cartas distintas, para aislar lo que se prueba. */
function relleno(cuantas: number): DeckEntry<'MTG'>[] {
  return Array.from({ length: cuantas }, (_, i) =>
    card({ oracleKey: `relleno-${i}`, name: `Relleno ${i}`, quantity: 1 }),
  );
}

function codigos(entries: DeckEntry<'MTG'>[]): DeckIssueCode[] {
  return mtgValidator.validate(entries).issues.map((issue) => issue.code);
}

describe('mtgValidator', () => {
  it('un mazo de 60 cartas distintas es valido', () => {
    const resultado = mtgValidator.validate(relleno(60));
    expect(resultado.valid).toBe(true);
    expect(resultado.counts.main).toBe(60);
  });

  it('menos de 60 en el main es main_too_small', () => {
    const resultado = mtgValidator.validate(relleno(59));
    expect(resultado.valid).toBe(false);
    expect(resultado.issues[0]?.code).toBe('main_too_small');
    expect(resultado.issues[0]?.actual).toBe(59);
    expect(resultado.issues[0]?.allowed).toBe(MTG_MIN_MAIN);
  });

  it('mas de 60 en el main es valido: Magic no tiene maximo', () => {
    expect(mtgValidator.validate(relleno(75)).valid).toBe(true);
  });

  it('mas de 15 en el sideboard es side_too_large', () => {
    const entries = [
      ...relleno(60),
      ...Array.from({ length: 16 }, (_, i) =>
        card({ oracleKey: `side-${i}`, name: `Side ${i}`, zone: 'side' }),
      ),
    ];
    expect(codigos(entries)).toContain('side_too_large');
    expect(MTG_MAX_SIDE).toBe(15);
  });

  it('mas de 4 copias por nombre es too_many_copies', () => {
    const entries = [...relleno(56), card({ quantity: 5 })];
    const issue = mtgValidator.validate(entries).issues.find((i) => i.code === 'too_many_copies');
    expect(issue?.cardName).toBe('Lightning Bolt');
    expect(issue?.actual).toBe(5);
    expect(issue?.allowed).toBe(MTG_MAX_COPIES);
  });

  it('el limite de copias suma main Y sideboard', () => {
    // Asi cuenta Magic: el sideboard no es un mazo aparte a estos efectos.
    const entries = [...relleno(57), card({ quantity: 3 }), card({ zone: 'side', quantity: 2 })];
    expect(codigos(entries)).toContain('too_many_copies');
  });

  it('la tierra basica no tiene limite', () => {
    const bosque = card({
      oracleKey: 'forest',
      name: 'Forest',
      typeLine: `Basic Land ${EM_DASH} Forest`,
      quantity: 24,
    });
    expect(mtgValidator.validate([...relleno(36), bosque]).valid).toBe(true);
  });

  it('la tierra basica NEVADA tampoco (la trampa)', () => {
    const nevado = card({
      oracleKey: 'snow-forest',
      name: 'Snow-Covered Forest',
      typeLine: `Basic Snow Land ${EM_DASH} Forest`,
      quantity: 24,
    });
    expect(mtgValidator.validate([...relleno(36), nevado]).valid).toBe(true);
  });

  it('la misma carta en dos impresiones cuenta como UNA', () => {
    const entries = [
      ...relleno(57),
      card({ quantity: 2 }),
      card({ quantity: 2 }), // otra impresion, mismo oracleKey
    ];
    // 4 copias en total: legal. Contar por impresion daria 2 y 2 y no avisaria
    // nunca de la quinta.
    expect(mtgValidator.validate(entries).valid).toBe(true);
    expect(codigos([...relleno(56), card({ quantity: 3 }), card({ quantity: 2 })])).toContain(
      'too_many_copies',
    );
  });

  it('rechaza las zonas que Magic no usa en v1', () => {
    const entries = [...relleno(60), card({ zone: 'extra' })];
    expect(codigos(entries)).toContain('unsupported_zone');
  });

  it('el mazo vacio es invalido pero no lanza', () => {
    const resultado = mtgValidator.validate([]);
    expect(resultado.valid).toBe(false);
    expect(resultado.counts.main).toBe(0);
  });
});
