import { describe, it, expect } from 'vitest';
import { juegoDeRuta } from './juegos.js';

describe('el juego de una ruta (H9f)', () => {
  it('lo dice el primer segmento', () => {
    expect(juegoDeRuta('/mtg')).toBe('MTG');
    expect(juegoDeRuta('/ygo/catalogo')).toBe('YGO');
    expect(juegoDeRuta('/ptcg/catalogo')).toBe('PTCG');
  });

  it('fuera de un juego no hay juego', () => {
    expect(juegoDeRuta('/')).toBeNull();
    expect(juegoDeRuta('/mazos')).toBeNull();
    expect(juegoDeRuta('/mtgx')).toBeNull();
  });
});
