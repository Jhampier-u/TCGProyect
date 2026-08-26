import { describe, it, expect } from 'vitest';
import { validateDeck, DECK_VALIDATORS } from './index.js';
import { GAME_CODES } from '../game.js';

describe('validateDeck', () => {
  it('hay una estrategia por juego, sin huecos', () => {
    for (const game of GAME_CODES) {
      expect(DECK_VALIDATORS[game]?.game).toBe(game);
    }
    expect(Object.keys(DECK_VALIDATORS).sort()).toEqual([...GAME_CODES].sort());
  });

  it('delega en la estrategia del juego pedido', () => {
    // 45 cartas discriminan los tres juegos de una vez: Magic exige 60 como
    // minimo, Yu-Gi-Oh! admite entre 40 y 60, y Pokemon exige 60 exactas.
    const entries = Array.from({ length: 45 }, (_, i) => ({
      oracleKey: `c-${i}`,
      name: `C ${i}`,
      typeLine: null,
      gameData: {},
      zone: 'main' as const,
      quantity: 1,
    }));
    expect(validateDeck('MTG', entries).valid).toBe(false);
    expect(validateDeck('YGO', entries).valid).toBe(true);
    expect(validateDeck('PTCG', entries).valid).toBe(false);
  });

  it('el mazo vacio devuelve conteos a cero en los tres juegos', () => {
    for (const game of GAME_CODES) {
      const resultado = validateDeck(game, []);
      expect(resultado.counts).toEqual({ main: 0, extra: 0, side: 0, commander: 0 });
      expect(resultado.valid).toBe(false);
    }
  });
});
