import { describe, it, expect } from 'vitest';
import { cifraDeCombate, flechasDeLink, marcaDeNivel } from './ygo.js';
import { ES } from '../i18n/es.js';

describe('nivel, rango y link de Yu-Gi-Oh! (H9f)', () => {
  it('un Link es link aunque traiga nivel (F-6: hay 110 asi)', () => {
    expect(marcaDeNivel('link', 4, 2)).toEqual({ clase: 'link', valor: 2 });
  });

  it('el rango de los Xyz va en `level`, y se pinta como rango', () => {
    expect(marcaDeNivel('xyz', 4, null)).toEqual({ clase: 'rango', valor: 4 });
    expect(marcaDeNivel('effect', 4, null)).toEqual({ clase: 'nivel', valor: 4 });
  });

  it('una magica o una trampa no tiene ninguno', () => {
    expect(marcaDeNivel(null, null, null)).toBeNull();
    expect(marcaDeNivel('spell', null, null)).toBeNull();
    expect(marcaDeNivel('trap', null, null)).toBeNull();
  });

  it('un Link sin `link_val` no cae a las estrellas aunque traiga nivel', () => {
    expect(marcaDeNivel('link', null, null)).toBeNull();
    expect(marcaDeNivel('link', 4, null)).toBeNull();
  });

  it('el ATK -1 es el "?" (85 cartas)', () => {
    expect(cifraDeCombate(-1)).toBe(ES.simbolo.desconocido);
    expect(cifraDeCombate(2500)).toBe('2500');
    expect(cifraDeCombate(0)).toBe('0');
    expect(cifraDeCombate(null)).toBeNull();
    expect(cifraDeCombate(undefined)).toBeNull();
  });

  it('la DEF de un Link no existe: no sale como "?" ni como 0', () => {
    expect(cifraDeCombate(undefined)).toBeNull();
  });

  it('las flechas de un Link: solo las conocidas, en el orden de la rejilla', () => {
    expect(flechasDeLink(['Bottom', 'Top-Left', 'Top-Left', 'Nada'])).toEqual(['Top-Left', 'Bottom']);
    expect(flechasDeLink([])).toEqual([]);
    expect(flechasDeLink(undefined)).toEqual([]);
    expect(flechasDeLink(null)).toEqual([]);
  });

  it('cada flecha conocida tiene su lectura', () => {
    const sinTexto = flechasDeLink([
      'Top-Left', 'Top', 'Top-Right', 'Left', 'Right', 'Bottom-Left', 'Bottom', 'Bottom-Right',
    ]).filter((f) => !ES.ygo.flecha[f]);
    expect(sinTexto).toEqual([]);
  });
});
