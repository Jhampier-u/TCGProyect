import { describe, it, expect } from 'vitest';
import { ygoCodec } from './ygo.js';
import type { DeckExportEntry } from './types.js';

function entrada(over: Partial<DeckExportEntry>): DeckExportEntry {
  return {
    name: 'Blue-Eyes White Dragon',
    oracleKey: '89631139',
    setCode: 'LOB',
    collectorNumber: '001',
    zone: 'main',
    quantity: 3,
    ...over,
  };
}

const YDK = ['#created by ProyectoTCG', '#main', '89631139', '89631139', '#extra', '!side'].join(
  '\n',
);

describe('ygoCodec.parse', () => {
  it('agrupa las copias repetidas en una linea con cantidad', () => {
    // El .ydk NO tiene cantidades: tres copias son tres lineas iguales.
    const { lines } = ygoCodec.parse(YDK);
    expect(lines).toEqual([{ quantity: 2, zone: 'main', externalId: '89631139' }]);
  });

  it('reparte por zonas, y el side lleva ! y no #', () => {
    const texto = ['#main', '111', '#extra', '222', '!side', '333'].join('\n');
    expect(ygoCodec.parse(texto).lines).toEqual([
      { quantity: 1, zone: 'main', externalId: '111' },
      { quantity: 1, zone: 'extra', externalId: '222' },
      { quantity: 1, zone: 'side', externalId: '333' },
    ]);
  });

  it('ignora los comentarios y no avisa de ellos', () => {
    const { lines, warnings } = ygoCodec.parse('#created by alguien\n#main\n111');
    expect(lines).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('avisa de una linea que no es un passcode', () => {
    const { warnings } = ygoCodec.parse('#main\n111\nno soy un numero');
    expect(warnings).toEqual([{ line: 3, text: 'no soy un numero', reason: 'unparsable' }]);
  });

  it('tolera CRLF y lineas en blanco', () => {
    const { lines, warnings } = ygoCodec.parse('#main\r\n111\r\n\r\n111\r\n');
    expect(warnings).toEqual([]);
    expect(lines).toEqual([{ quantity: 2, zone: 'main', externalId: '111' }]);
  });

  it('sin cabecera de zona todo cae en el main', () => {
    expect(ygoCodec.parse('111').lines[0]?.zone).toBe('main');
  });

  it('el texto vacio no lanza', () => {
    expect(ygoCodec.parse('')).toEqual({ lines: [], warnings: [] });
  });
});

describe('ygoCodec.serialize', () => {
  it('repite el passcode una vez por copia', () => {
    const texto = ygoCodec.serialize([entrada({ quantity: 3 })]);
    expect(texto).toBe(
      [
        '#created by ProyectoTCG',
        '#main',
        '89631139',
        '89631139',
        '89631139',
        '#extra',
        '!side',
      ].join('\n'),
    );
  });

  it('escribe siempre las tres cabeceras, aunque haya zonas vacias', () => {
    expect(ygoCodec.serialize([])).toBe(
      ['#created by ProyectoTCG', '#main', '#extra', '!side'].join('\n'),
    );
  });

  it('ida y vuelta EXACTA: el .ydk no tiene ambiguedad', () => {
    const entradas = [
      entrada({ oracleKey: '89631139', quantity: 3 }),
      entrada({ oracleKey: '46986414', quantity: 1 }),
      entrada({ oracleKey: '84013237', quantity: 2, zone: 'extra' }),
      entrada({ oracleKey: '14558127', quantity: 1, zone: 'side' }),
    ];
    const primera = ygoCodec.serialize(entradas);
    const vuelta = ygoCodec.parse(primera).lines.map((l) =>
      entrada({ oracleKey: l.externalId!, quantity: l.quantity, zone: l.zone }),
    );
    expect(ygoCodec.serialize(vuelta)).toBe(primera);
  });
});
