import { describe, it, expect } from 'vitest';
import { rarezasInalcanzables, pesoSinDestino } from './coverage.js';
import type { SlotConfig } from './types.js';

function slot(rarezas: string[]): SlotConfig {
  return {
    slotIndex: 0,
    distribution: rarezas.map((rarity) => ({ rarity, weight: 1 })),
    foilChance: 0,
  };
}

function slotConPesos(slotIndex: number, pares: Array<[string, number]>): SlotConfig {
  return {
    slotIndex,
    distribution: pares.map(([rarity, weight]) => ({ rarity, weight })),
    foilChance: 0,
  };
}

describe('rarezasInalcanzables (T-034)', () => {
  it('senala lo que el pool tiene y ninguna slot pide', () => {
    // El caso real de Legend of Blue Eyes bajo la plantilla moderna: el techo
    // medido era del 70,7% y estas son las tres rarezas que lo causaban.
    const plantillaModerna = [
      slot(['common']),
      slot(['super_rare', 'ultra_rare', 'secret_rare', 'quarter_century_secret_rare']),
    ];
    const pool = ['common', 'rare', 'short_print', 'super_short_print', 'ultra_rare',
                  'super_rare', 'secret_rare'];

    expect(rarezasInalcanzables(plantillaModerna, pool))
      .toEqual(['rare', 'short_print', 'super_short_print']);
  });

  it('devuelve vacio cuando la plantilla cubre el pool entero', () => {
    const plantilla = [slot(['common', 'short_print']), slot(['rare', 'secret_rare'])];
    expect(rarezasInalcanzables(plantilla, ['common', 'rare', 'short_print'])).toEqual([]);
  });

  it('una rareza que la plantilla pide y el set no tiene NO es un problema', () => {
    // Es el caso contrario y es normal: el respaldo del motor entrega otra.
    // Si esto se contara como fallo, el informe seria ruido en cada set.
    expect(rarezasInalcanzables([slot(['common', 'mythic'])], ['common'])).toEqual([]);
  });

  it('no cuenta dos veces una rareza repetida en el pool', () => {
    expect(rarezasInalcanzables([slot(['common'])], ['rare', 'rare'])).toEqual(['rare']);
  });
});

describe('pesoSinDestino (T-070)', () => {
  it('mide el caso real de Pokemon antes de la migracion 0012', () => {
    // El slot del hit pedia `rare_holo` (267) y `hyper_rare` (18) y NINGUN set
    // del juego tenia una sola impresion de ninguna de las dos. El respaldo las
    // entregaba todas como `rare`, que subio del 40% previsto al 72,3% medido.
    const hit = slotConPesos(9, [
      ['rare', 400], ['rare_holo', 267], ['double_rare', 143], ['illustration_rare', 75],
      ['ultra_rare', 67], ['special_illustration_rare', 30], ['hyper_rare', 18],
    ]);
    const existen = new Set(['rare', 'double_rare', 'illustration_rare', 'ultra_rare',
                             'special_illustration_rare', 'mega_hyper_rare']);

    const [d] = pesoSinDestino([hit], existen);
    expect(d?.slotIndex).toBe(9);
    expect(d?.rarezas).toEqual(['hyper_rare', 'rare_holo']);
    expect(d?.fraccion).toBeCloseTo(0.285, 3);
  });

  it('no dice nada de un slot cuyas rarezas existen todas', () => {
    const bueno = slotConPesos(0, [['common', 900], ['short_print', 100]]);
    expect(pesoSinDestino([bueno], new Set(['common', 'short_print']))).toEqual([]);
  });

  it('un slot entero sin destino da fraccion 1', () => {
    // El peor caso: la slot no puede entregar NADA de lo que pide y el respaldo
    // global tiene que inventarse la carta entera.
    const muerto = slotConPesos(3, [['rare_holo', 500], ['hyper_rare', 500]]);
    const [d] = pesoSinDestino([muerto], new Set(['common']));
    expect(d?.fraccion).toBe(1);
  });

  it('un slot con pesos a cero no divide entre cero', () => {
    const raro = slotConPesos(0, [['rare_holo', 0]]);
    expect(pesoSinDestino([raro], new Set(['common']))).toEqual([]);
  });
});
