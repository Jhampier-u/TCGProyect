import { describe, it, expect } from 'vitest';
import { ordenarPorEscasez } from './PackReveal.js';

/** Tiers reales de Yu-Gi-Oh! sembrados por la migracion 0002. */
const TIERS_YGO = new Map([
  ['common', 1], ['rare', 4], ['super_rare', 5], ['ultra_rare', 6],
  ['secret_rare', 8], ['quarter_century_secret_rare', 11],
]);

/** Tiers de Magic. */
const TIERS_MTG = new Map([
  ['common', 1], ['uncommon', 2], ['rare', 3], ['mythic', 4],
]);

const carta = (rarity: string, slotIndex: number) => ({ rarity, slotIndex });

describe('orden de revelado', () => {
  it('deja la carta mas escasa para el final', () => {
    const sobre = [
      carta('common', 0), carta('common', 1), carta('common', 2),
      carta('super_rare', 8),
    ];
    const orden = ordenarPorEscasez(sobre, TIERS_YGO);
    expect(orden[orden.length - 1]!.rarity).toBe('super_rare');
  });

  it('NO respeta el orden de los slots cuando destriparia el final', () => {
    // Caso real de Magic: la rara garantizada esta en el slot 10, pero los
    // comodines de los slots 12 y 13 pueden ser miticas. Revelar por posicion
    // mostraria la mitica antes que la rara.
    const playBooster = [
      carta('common', 0), carta('uncommon', 7),
      carta('rare', 10), carta('common', 11),
      carta('mythic', 12), carta('common', 13),
    ];
    const orden = ordenarPorEscasez(playBooster, TIERS_MTG);

    expect(orden.map((c) => c.rarity)).toEqual([
      'common', 'common', 'common', 'uncommon', 'rare', 'mythic',
    ]);
    // La mitica del slot 12 se revela DESPUES de la rara del slot 10.
    expect(orden[orden.length - 1]!.slotIndex).toBe(12);
  });

  it('desempata por slot para que el orden sea estable', () => {
    const sobre = [carta('common', 5), carta('common', 2), carta('common', 8)];
    expect(ordenarPorEscasez(sobre, TIERS_YGO).map((c) => c.slotIndex)).toEqual([2, 5, 8]);
  });

  it('una rareza DESCONOCIDA no se cuela al final como si fuera la mejor', () => {
    // El contrato de P-007 permite insertar rarezas nuevas al vuelo con tier 50.
    // Si el frontend aun no las conoce, tratarlas como lo mas escaso haria que
    // una carta cualquiera robase el momento final del sobre.
    const sobre = [
      carta('common', 0),
      carta('rareza_que_no_conocemos', 1),
      carta('secret_rare', 8),
    ];
    const orden = ordenarPorEscasez(sobre, TIERS_YGO);
    expect(orden[orden.length - 1]!.rarity).toBe('secret_rare');
  });

  it('no modifica el array original', () => {
    const sobre = [carta('super_rare', 8), carta('common', 0)];
    const copia = [...sobre];
    ordenarPorEscasez(sobre, TIERS_YGO);
    expect(sobre).toEqual(copia);
  });

  it('tolera un sobre vacio o de una sola carta', () => {
    expect(ordenarPorEscasez([], TIERS_YGO)).toEqual([]);
    expect(ordenarPorEscasez([carta('common', 0)], TIERS_YGO)).toHaveLength(1);
  });
});
