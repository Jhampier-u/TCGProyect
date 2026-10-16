import { describe, it, expect } from 'vitest';
import { acabadoDe, nivelDe } from './rareza.js';

/**
 * Los tiers REALES de la base el 2026-10-15 (S037), por juego. Si una migracion
 * anade un tier, esta lista lo dira al no encontrarle nivel.
 */
const TIERS = {
  PTCG: [1, 2, 3, 4, 5, 6, 7, 8, 9, 50],
  MTG: [1, 2, 3, 4, 5, 6],
  YGO: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 50],
} as const;

describe('nivel de espectaculo por rareza (H9e)', () => {
  it('ningun tier real se queda sin nivel', () => {
    for (const [juego, tiers] of Object.entries(TIERS)) {
      for (const t of tiers) {
        expect([1, 2, 3, 4, 5], `${juego} tier ${t}`).toContain(nivelDe(juego as 'PTCG', t));
      }
    }
  });

  it('Pokemon: comun 1, rara 2, ex 3, Illustration Rare 4, SIR e Hyper 5', () => {
    expect([1, 2, 3, 5, 7, 8, 9].map((t) => nivelDe('PTCG', t))).toEqual([1, 1, 2, 3, 4, 5, 5]);
  });

  it('Magic: la mitica es holo y no un destello', () => {
    // Con una tabla unica para los tres juegos, tier 4 seria nivel 2.
    expect(nivelDe('MTG', 3)).toBe(2);
    expect(nivelDe('MTG', 4)).toBe(3);
    expect(nivelDe('MTG', 5)).toBe(4);
  });

  it('Yu-Gi-Oh!: Starlight y Quarter Century son leyenda', () => {
    expect(nivelDe('YGO', 13)).toBe(5);
    expect(nivelDe('YGO', 11)).toBe(5);
    expect(nivelDe('YGO', 8)).toBe(4);
  });

  it('el tier 50 no es lo mejor del sobre: promo y etiquetas son nivel 2', () => {
    expect(nivelDe('PTCG', 50)).toBe(2);
    expect(nivelDe('YGO', 50)).toBe(2);
  });

  it('un tier desconocido es comun, como en el orden de revelado (P-007)', () => {
    expect(nivelDe('PTCG', 0)).toBe(1);
    expect(nivelDe('MTG', 99)).toBe(1);
  });

  it('el acabado va aparte: foil o normal', () => {
    expect(acabadoDe('foil')).toBe('foil');
    expect(acabadoDe('nonfoil')).toBe('normal');
    expect(acabadoDe('lo que sea')).toBe('normal');
  });
});
