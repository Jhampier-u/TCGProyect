import { describe, it, expect } from 'vitest';
import { acabadoDe, etiquetaDeRareza, nivelDe, nombresDeRareza, tiersConNivel } from './rareza.js';

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
  it('cada tier real tiene nivel propio y la tabla no guarda tiers que ya no existen', () => {
    for (const juego of ['PTCG', 'MTG', 'YGO'] as const) {
      expect(tiersConNivel(juego), juego).toEqual([...TIERS[juego]]);
    }
  });

  it('Pokemon: comun 1, rara 2, ex 3, Illustration Rare 4, SIR e Hyper 5; el 50 (promo) es 2', () => {
    expect(TIERS.PTCG.map((t) => nivelDe('PTCG', t))).toEqual([1, 1, 2, 2, 3, 3, 4, 5, 5, 2]);
  });

  it('Magic: la mitica es holo y no un destello', () => {
    // Con una tabla unica para los tres juegos, tier 4 seria nivel 2.
    expect(TIERS.MTG.map((t) => nivelDe('MTG', t))).toEqual([1, 1, 2, 3, 4, 4]);
  });

  it('Yu-Gi-Oh!: Starlight y Quarter Century son leyenda; el 50 (etiquetas) no es lo mejor del sobre', () => {
    expect(TIERS.YGO.map((t) => nivelDe('YGO', t))).toEqual([1, 1, 1, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 2]);
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

describe('el nombre de una rareza (H9f)', () => {
  it('una etiqueta de verdad se respeta tal cual (Pokemon, Yu-Gi-Oh!)', () => {
    expect(etiquetaDeRareza({ code: 'double_rare', label: 'Double Rare' })).toBe('Double Rare');
    expect(etiquetaDeRareza({ code: 'common', label: 'Common' })).toBe('Common');
  });

  it('una etiqueta que es el codigo en bruto se presenta (Magic, 0002)', () => {
    expect(etiquetaDeRareza({ code: 'rare', label: 'rare' })).toBe('Rare');
    expect(etiquetaDeRareza({ code: 'mythic', label: 'mythic' })).toBe('Mythic Rare');
  });

  it('un codigo sin presentacion sale como llega', () => {
    expect(etiquetaDeRareza({ code: 'rara_nueva', label: 'rara_nueva' })).toBe('rara_nueva');
  });

  it('las seis de Magic, tal como estan en la base, tienen nombre presentable', () => {
    const mtg = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'];
    const nombres = nombresDeRareza(mtg.map((code) => ({ code, label: code })));
    for (const code of mtg) expect(nombres.get(code)).not.toBe(code);
  });
});
