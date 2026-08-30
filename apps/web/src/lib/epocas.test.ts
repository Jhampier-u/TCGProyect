import { describe, it, expect } from 'vitest';
import { agruparPorEpoca } from './epocas.js';
import type { EraSummary, SetSummary } from './api.js';

/** Un set con lo minimo: lo que se agrupa es su fecha. */
function set(code: string, releasedAt: string | null): SetSummary {
  return {
    id: code.length, externalId: code, code, name: `Set ${code}`,
    releasedAt, cardCount: 100, isOpenable: true, iconPath: null, poolSize: 100,
  };
}

/** Las ventanas REALES de Pokemon, tal como las devuelve la API. */
const EPOCAS: EraSummary[] = [
  { name: 'Booster clasico (hasta la era EX)', from: null, to: '2007-04-30', isDefault: false },
  { name: 'Booster Diamond & Pearl / Platinum', from: '2007-05-01', to: '2010-02-09', isDefault: false },
  { name: 'Booster Sword & Shield', from: '2020-01-01', to: '2023-03-30', isDefault: false },
  { name: 'Booster Scarlet & Violet', from: null, to: null, isDefault: true },
];

describe('agrupar los sets por epoca (T-090)', () => {
  it('mete cada set en la ventana que contiene su fecha', () => {
    const grupos = agruparPorEpoca(
      [set('base', '2000-01-01'), set('dp', '2008-06-01'), set('swsh', '2021-05-01')],
      EPOCAS,
    );
    expect(grupos.map((g) => [g.epoca.name, g.sets.map((s) => s.code)])).toEqual([
      ['Booster Sword & Shield', ['swsh']],
      ['Booster Diamond & Pearl / Platinum', ['dp']],
      ['Booster clasico (hasta la era EX)', ['base']],
    ]);
  });

  it('lo que no cae en ninguna ventana va a la epoca por defecto', () => {
    // Es lo que hace `findTemplate` en el servidor, y por eso la por defecto
    // existe: recoge lo vigente, que todavia no tiene ventana propia.
    const grupos = agruparPorEpoca([set('sv', '2024-06-01')], EPOCAS);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.epoca.isDefault).toBe(true);
    expect(grupos[0]!.sets.map((s) => s.code)).toEqual(['sv']);
  });

  it('un set SIN fecha tambien va a la por defecto, no se pierde', () => {
    const grupos = agruparPorEpoca([set('promo', null)], EPOCAS);
    expect(grupos[0]!.epoca.isDefault).toBe(true);
    expect(grupos[0]!.sets.map((s) => s.code)).toEqual(['promo']);
  });

  it('los limites de la ventana son inclusivos por los dos lados', () => {
    // El dia exacto del corte es del set, no del siguiente. Una ventana
    // exclusiva por un lado deja un dia sin epoca y el set desaparece.
    const grupos = agruparPorEpoca(
      [set('ultimo', '2007-04-30'), set('primero', '2007-05-01')],
      EPOCAS,
    );
    const porNombre = new Map(grupos.map((g) => [g.epoca.name, g.sets.map((s) => s.code)]));
    expect(porNombre.get('Booster clasico (hasta la era EX)')).toEqual(['ultimo']);
    expect(porNombre.get('Booster Diamond & Pearl / Platinum')).toEqual(['primero']);
  });

  it('no pinta epocas vacias', () => {
    const grupos = agruparPorEpoca([set('dp', '2008-06-01')], EPOCAS);
    expect(grupos).toHaveLength(1);
  });

  it('ningun set se queda fuera, pase lo que pase', () => {
    // La comprobacion que de verdad importa: agrupar no puede PERDER cartas.
    const todos = [
      set('a', '1999-01-01'), set('b', '2008-06-01'), set('c', '2021-05-01'),
      set('d', '2026-01-01'), set('e', null),
    ];
    const repartidos = agruparPorEpoca(todos, EPOCAS).flatMap((g) => g.sets);
    expect(repartidos).toHaveLength(todos.length);
    expect(new Set(repartidos.map((s) => s.code))).toEqual(new Set(todos.map((s) => s.code)));
  });
});
