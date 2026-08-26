import { describe, it, expect } from 'vitest';
import { ptcgCodec } from './ptcg.js';
import type { DeckExportEntry } from './types.js';

const ACENTO = `Pok${String.fromCharCode(0x00e9)}mon`;

function entrada(over: Partial<DeckExportEntry>): DeckExportEntry {
  return {
    name: 'Pikachu',
    oracleKey: 'svi-47',
    setCode: 'SVI',
    collectorNumber: '47',
    zone: 'main',
    quantity: 4,
    gameData: { supertype: 'Pokemon' },
    ...over,
  };
}

describe('ptcgCodec.parse', () => {
  it('lee nombre, set y numero, y compone el oracle_key', () => {
    expect(ptcgCodec.parse('4 Pikachu SVI 47').lines[0]).toEqual({
      quantity: 4,
      zone: 'main',
      name: 'Pikachu',
      setCode: 'SVI',
      collectorNumber: '47',
      externalId: 'svi-47',
    });
  });

  it('acepta la cabecera con acento y sin el', () => {
    const conAcento = ptcgCodec.parse(`${ACENTO}: 12\n4 Pikachu SVI 47`);
    const sinAcento = ptcgCodec.parse('Pokemon: 12\n4 Pikachu SVI 47');
    expect(conAcento.warnings).toEqual([]);
    expect(sinAcento.warnings).toEqual([]);
    expect(conAcento.lines).toEqual(sinAcento.lines);
  });

  it('ignora Total Cards y las demas cabeceras', () => {
    const texto = ['Trainer: 30', "4 Acerola's Mischief ME1 113", 'Energy: 18', 'Total Cards: 60'];
    const { lines, warnings } = ptcgCodec.parse(texto.join('\n'));
    expect(warnings).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.name).toBe("Acerola's Mischief");
  });

  it('todo cae en main: Pokemon no usa otras zonas', () => {
    const { lines } = ptcgCodec.parse('4 Pikachu SVI 47\n2 Bulbasaur ME1 1');
    expect(lines.every((l) => l.zone === 'main')).toBe(true);
  });

  it('un nombre que acaba en numero no confunde al parser', () => {
    expect(ptcgCodec.parse("4 Team Rocket's Great Ball ME2PT5 205").lines[0]).toEqual({
      quantity: 4,
      zone: 'main',
      name: "Team Rocket's Great Ball",
      setCode: 'ME2PT5',
      collectorNumber: '205',
      externalId: 'me2pt5-205',
    });
  });

  it('sin set ni numero se queda con el nombre', () => {
    expect(ptcgCodec.parse('4 Pikachu').lines[0]).toEqual({
      quantity: 4,
      zone: 'main',
      name: 'Pikachu',
    });
  });

  it('tolera CRLF y lineas en blanco', () => {
    const { lines, warnings } = ptcgCodec.parse('4 Pikachu SVI 47\r\n\r\n2 Bulbasaur ME1 1\r\n');
    expect(warnings).toEqual([]);
    expect(lines).toHaveLength(2);
  });

  it('descarta la cantidad cero con aviso y el texto vacio no lanza', () => {
    expect(ptcgCodec.parse('0 Pikachu SVI 47').warnings[0]?.reason).toBe('zero_quantity');
    expect(ptcgCodec.parse('')).toEqual({ lines: [], warnings: [] });
  });
});

describe('ptcgCodec.serialize', () => {
  it('agrupa en secciones por supertipo y cierra con el total', () => {
    const texto = ptcgCodec.serialize([
      entrada({ name: 'Pikachu', quantity: 4, gameData: { supertype: 'Pokemon' } }),
      entrada({
        name: "Acerola's Mischief",
        oracleKey: 'me1-113',
        setCode: 'ME1',
        collectorNumber: '113',
        quantity: 2,
        gameData: { supertype: 'Trainer' },
      }),
    ]);
    expect(texto).toBe(
      [
        `${ACENTO}: 4`,
        '4 Pikachu SVI 47',
        '',
        'Trainer: 2',
        "2 Acerola's Mischief ME1 113",
        '',
        'Total Cards: 6',
      ].join('\n'),
    );
  });

  it('ida y vuelta: serialize -> parse -> serialize es identico', () => {
    const entradas = [
      entrada({ name: 'Pikachu', quantity: 4, gameData: { supertype: 'Pokemon' } }),
      entrada({
        name: 'Basic Fire Energy',
        oracleKey: 'sve-2',
        setCode: 'SVE',
        collectorNumber: '2',
        quantity: 8,
        gameData: { supertype: 'Energy' },
      }),
    ];
    const primera = ptcgCodec.serialize(entradas);
    const vuelta = ptcgCodec.parse(primera).lines.map((l) => {
      const original = entradas.find((e) => e.name === l.name)!;
      return entrada({ ...original, quantity: l.quantity });
    });
    expect(ptcgCodec.serialize(vuelta)).toBe(primera);
  });
});
