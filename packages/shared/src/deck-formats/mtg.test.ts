import { describe, it, expect } from 'vitest';
import { mtgCodec } from './mtg.js';
import type { DeckExportEntry } from './types.js';

function entrada(over: Partial<DeckExportEntry>): DeckExportEntry {
  return {
    name: 'Lightning Bolt',
    oracleKey: 'oracle-bolt',
    setCode: 'M10',
    collectorNumber: '146',
    zone: 'main',
    quantity: 4,
    ...over,
  };
}

describe('mtgCodec.parse', () => {
  it('lee la forma basica', () => {
    const { lines, warnings } = mtgCodec.parse('4 Lightning Bolt\n2 Mountain');
    expect(warnings).toEqual([]);
    expect(lines).toEqual([
      { quantity: 4, zone: 'main', name: 'Lightning Bolt' },
      { quantity: 2, zone: 'main', name: 'Mountain' },
    ]);
  });

  it('acepta la forma "4x Nombre"', () => {
    expect(mtgCodec.parse('4x Lightning Bolt').lines[0]).toEqual({
      quantity: 4,
      zone: 'main',
      name: 'Lightning Bolt',
    });
  });

  it('lee el sufijo de impresion (SET) NUM', () => {
    expect(mtgCodec.parse('4 Lightning Bolt (M10) 146').lines[0]).toEqual({
      quantity: 4,
      zone: 'main',
      name: 'Lightning Bolt',
      setCode: 'M10',
      collectorNumber: '146',
    });
  });

  it('reconoce el sideboard por cabecera', () => {
    const { lines } = mtgCodec.parse('4 Lightning Bolt\nSideboard\n2 Pyroblast');
    expect(lines.map((l) => l.zone)).toEqual(['main', 'side']);
  });

  it('reconoce el sideboard por LINEA EN BLANCO, que es como lo escribe media internet', () => {
    const { lines } = mtgCodec.parse('4 Lightning Bolt\n\n2 Pyroblast');
    expect(lines.map((l) => l.zone)).toEqual(['main', 'side']);
  });

  it('la cabecera Deck no empuja nada al sideboard por si sola', () => {
    const { lines } = mtgCodec.parse('Deck\n4 Lightning Bolt\n\n2 Mountain');
    // La primera linea en blanco sigue separando: es la convencion.
    expect(lines.map((l) => l.zone)).toEqual(['main', 'side']);
  });

  it('tolera CRLF y espacios de sobra', () => {
    const { lines, warnings } = mtgCodec.parse('  4   Lightning Bolt  \r\n\r\n  2 Pyroblast\r\n');
    expect(warnings).toEqual([]);
    expect(lines).toEqual([
      { quantity: 4, zone: 'main', name: 'Lightning Bolt' },
      { quantity: 2, zone: 'side', name: 'Pyroblast' },
    ]);
  });

  it('avisa de lo que no entiende, sin lanzar', () => {
    const { lines, warnings } = mtgCodec.parse('4 Lightning Bolt\nesto no es una carta');
    expect(lines).toHaveLength(1);
    expect(warnings).toEqual([{ line: 2, text: 'esto no es una carta', reason: 'unparsable' }]);
  });

  it('descarta la cantidad cero con aviso', () => {
    const { lines, warnings } = mtgCodec.parse('0 Lightning Bolt');
    expect(lines).toEqual([]);
    expect(warnings[0]?.reason).toBe('zero_quantity');
  });

  it('el texto vacio no lanza', () => {
    expect(mtgCodec.parse('')).toEqual({ lines: [], warnings: [] });
  });
});

describe('mtgCodec.serialize', () => {
  it('escribe main y sideboard', () => {
    const texto = mtgCodec.serialize([
      entrada({ name: 'Lightning Bolt', quantity: 4 }),
      entrada({ name: 'Pyroblast', quantity: 2, zone: 'side' }),
    ]);
    expect(texto).toBe('4 Lightning Bolt\n\nSideboard\n2 Pyroblast');
  });

  it('sin sideboard no escribe la cabecera', () => {
    expect(mtgCodec.serialize([entrada({ quantity: 4 })])).toBe('4 Lightning Bolt');
  });

  it('ida y vuelta: serialize -> parse -> serialize es identico', () => {
    const entradas = [
      entrada({ name: 'Lightning Bolt', quantity: 4 }),
      entrada({ name: 'Snow-Covered Forest', quantity: 12 }),
      entrada({ name: 'Pyroblast', quantity: 2, zone: 'side' }),
    ];
    const primera = mtgCodec.serialize(entradas);
    const vuelta = mtgCodec.parse(primera).lines.map((l) =>
      entrada({ name: l.name!, quantity: l.quantity, zone: l.zone }),
    );
    expect(mtgCodec.serialize(vuelta)).toBe(primera);
  });
});
