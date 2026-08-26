import { describe, it, expect } from 'vitest';
import { parseDeck, serializeDeck, DECK_CODECS } from './index.js';
import { GAME_CODES } from '../game.js';

describe('registro de codecs', () => {
  it('hay un codec por juego, sin huecos', () => {
    expect(Object.keys(DECK_CODECS).sort()).toEqual([...GAME_CODES].sort());
  });

  it('delega en el codec del juego pedido', () => {
    // El mismo texto significa cosas distintas segun el juego: en Yu-Gi-Oh! es
    // un passcode suelto; en Magic no se entiende.
    expect(parseDeck('YGO', '89631139').lines[0]?.externalId).toBe('89631139');
    expect(parseDeck('MTG', '89631139').warnings[0]?.reason).toBe('unparsable');
  });

  it('serializa por juego', () => {
    const entrada = {
      name: 'Blue-Eyes White Dragon',
      oracleKey: '89631139',
      setCode: 'LOB',
      collectorNumber: '001',
      zone: 'main' as const,
      quantity: 1,
    };
    expect(serializeDeck('YGO', [entrada])).toContain('89631139');
    expect(serializeDeck('MTG', [entrada])).toBe('1 Blue-Eyes White Dragon');
  });

  it('el texto vacio no lanza en ningun juego', () => {
    for (const game of GAME_CODES) {
      expect(parseDeck(game, '').lines).toEqual([]);
    }
  });
});
