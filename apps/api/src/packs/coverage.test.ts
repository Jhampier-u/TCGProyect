import { describe, it, expect } from 'vitest';
import { rarezasInalcanzables } from './coverage.js';
import type { SlotConfig } from './types.js';

function slot(rarezas: string[]): SlotConfig {
  return {
    slotIndex: 0,
    distribution: rarezas.map((rarity) => ({ rarity, weight: 1 })),
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
