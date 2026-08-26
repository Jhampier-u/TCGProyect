import { describe, it, expect } from 'vitest';
import {
  ygoValidator,
  YGO_MIN_MAIN,
  YGO_MAX_MAIN,
  YGO_MAX_EXTRA,
  YGO_MAX_SIDE,
} from './ygo.js';
import type { DeckEntry, DeckIssueCode, DeckZone } from './types.js';

function card(over: Partial<DeckEntry<'YGO'>>): DeckEntry<'YGO'> {
  return {
    oracleKey: 'blue-eyes',
    name: 'Blue-Eyes White Dragon',
    typeLine: 'Normal Monster',
    gameData: {},
    zone: 'main',
    quantity: 1,
    ...over,
  };
}

function relleno(cuantas: number, zone: DeckZone = 'main'): DeckEntry<'YGO'>[] {
  return Array.from({ length: cuantas }, (_, i) =>
    card({ oracleKey: `relleno-${i}`, name: `Relleno ${i}`, zone }),
  );
}

function codigos(entries: DeckEntry<'YGO'>[]): DeckIssueCode[] {
  return ygoValidator.validate(entries).issues.map((issue) => issue.code);
}

describe('ygoValidator', () => {
  it('40 cartas en el main es valido', () => {
    const resultado = ygoValidator.validate(relleno(40));
    expect(resultado.valid).toBe(true);
    expect(resultado.counts.main).toBe(40);
  });

  it('39 es main_too_small y 61 es main_too_large', () => {
    expect(codigos(relleno(39))).toContain('main_too_small');
    expect(codigos(relleno(61))).toContain('main_too_large');
    expect([YGO_MIN_MAIN, YGO_MAX_MAIN]).toEqual([40, 60]);
  });

  it('mas de 15 en el extra o en el side es demasiado', () => {
    const extra = Array.from({ length: 16 }, (_, i) =>
      card({
        oracleKey: `x-${i}`,
        name: `Xyz ${i}`,
        typeLine: 'Xyz Effect Monster',
        zone: 'extra',
      }),
    );
    expect(codigos([...relleno(40), ...extra])).toContain('extra_too_large');
    expect(codigos([...relleno(40), ...relleno(16, 'side')])).toContain('side_too_large');
    expect([YGO_MAX_EXTRA, YGO_MAX_SIDE]).toEqual([15, 15]);
  });

  it('un Xyz en el Main Deck es wrong_zone (la trampa de la grafia)', () => {
    // El catalogo real dice "Xyz Effect Monster", no "XYZ".
    const xyz = card({ oracleKey: 'utopia', name: 'Utopia', typeLine: 'Xyz Effect Monster' });
    expect(codigos([...relleno(39), xyz])).toContain('wrong_zone');
  });

  it('un monstruo normal en el Extra Deck es wrong_zone', () => {
    expect(codigos([...relleno(40), card({ zone: 'extra' })])).toContain('wrong_zone');
  });

  it('un monstruo de Ritual va en el Main Deck y no es wrong_zone', () => {
    const ritual = card({
      oracleKey: 'garlandolf',
      name: 'Garlandolf',
      typeLine: 'Ritual Effect Monster',
    });
    expect(codigos([...relleno(39), ritual])).not.toContain('wrong_zone');
  });

  it('el Side Deck admite cartas de Extra Deck', () => {
    // Es legal: se cambian entre partidas. Solo main y extra estan renidos.
    const xyz = card({
      oracleKey: 'utopia',
      name: 'Utopia',
      typeLine: 'Xyz Effect Monster',
      zone: 'side',
    });
    expect(codigos([...relleno(40), xyz])).not.toContain('wrong_zone');
  });

  it('mas de 3 copias es too_many_copies', () => {
    expect(codigos([...relleno(36), card({ quantity: 4 })])).toContain('too_many_copies');
  });

  it('la banlist aprieta el limite: Limited admite 1', () => {
    const limitada = card({ quantity: 2, gameData: { banlist_info: { ban_tcg: 'Limited' } } });
    const issue = ygoValidator
      .validate([...relleno(38), limitada])
      .issues.find((i) => i.code === 'banned_card');
    expect(issue?.allowed).toBe(1);
    expect(issue?.actual).toBe(2);
  });

  it('Semi-Limited admite 2 y Banned ninguna', () => {
    const semi = card({ quantity: 3, gameData: { banlist_info: { ban_tcg: 'Semi-Limited' } } });
    expect(codigos([...relleno(37), semi])).toContain('banned_card');
    const prohibida = card({ quantity: 1, gameData: { banlist_info: { ban_tcg: 'Banned' } } });
    expect(codigos([...relleno(39), prohibida])).toContain('banned_card');
  });

  it('SIN banlist_info se permiten 3 copias (la trampa)', () => {
    expect(ygoValidator.validate([...relleno(37), card({ quantity: 3 })]).valid).toBe(true);
  });

  it('el limite de copias suma las tres zonas', () => {
    const entries = [...relleno(38), card({ quantity: 2 }), card({ quantity: 2, zone: 'side' })];
    expect(codigos(entries)).toContain('too_many_copies');
  });

  it('rechaza la zona commander', () => {
    expect(codigos([...relleno(40), card({ zone: 'commander' })])).toContain('unsupported_zone');
  });
});
