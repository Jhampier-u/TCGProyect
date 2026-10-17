import { describe, it, expect } from 'vitest';
import { leerCoste, partirCoste, tieneSimbolos } from './mana.js';
import { ES } from '../i18n/es.js';

describe('el coste en mana de Magic, de "{2}{B}" a simbolos (H9f, F-9)', () => {
  it('cada simbolo es un circulo: generico con su cifra, de color con su letra', () => {
    expect(partirCoste('{2}{B}')).toEqual([[
      { crudo: '2', texto: '2', colores: [] },
      { crudo: 'B', texto: 'B', colores: ['b'] },
    ]]);
  });

  it('una carta de dos caras da dos costes, separados (spec 6)', () => {
    const caras = partirCoste('{1}{R}{R} // {1}{R}');
    expect(caras).toHaveLength(2);
    expect(caras[1]!.map((s) => s.crudo)).toEqual(['1', 'R']);
  });

  it('hibrido de dos colores: circulo partido sin letra; pirexiano: el color con su P', () => {
    expect(partirCoste('{G/W}')[0]![0]).toEqual({ crudo: 'G/W', texto: '', colores: ['g', 'w'] });
    expect(partirCoste('{B/P}')[0]![0]).toEqual({ crudo: 'B/P', texto: 'P', colores: ['b'] });
    expect(partirCoste('{2/W}')[0]![0]).toEqual({ crudo: '2/W', texto: '2', colores: ['w'] });
  });

  it('sin coste no hay simbolos', () => {
    expect(partirCoste(null)).toEqual([]);
    expect(partirCoste('')).toEqual([]);
  });

  it('se lee en voz alta, cara a cara', () => {
    expect(leerCoste(partirCoste('{2}{B}'))).toEqual([ES.mana.generico('2'), ES.mana.nombre.B]);
    expect(leerCoste(partirCoste('{G/W}'))).toEqual([`${ES.mana.nombre.G}${ES.mana.o}${ES.mana.nombre.W}`]);
    expect(leerCoste(partirCoste('{B/P}'))).toEqual([ES.mana.pirexiano(ES.mana.nombre.B!)]);
    expect(leerCoste(partirCoste('{1}{R} // {R}'))).toEqual([ES.mana.generico('1'), ES.mana.nombre.R, ES.mana.otraCara, ES.mana.nombre.R]);
  });

  it('una cara vacia no deja separador ni "y en la otra cara" colgando', () => {
    expect(partirCoste('{1}{R} // ')).toHaveLength(1);
    expect(partirCoste(' // {R}')).toHaveLength(1);
    expect(leerCoste(partirCoste('{1}{R} // '))).toEqual([ES.mana.generico('1'), ES.mana.nombre.R]);
  });

  it('lo mal formado no es un simbolo: "{", "{}", "{{B}" y la llave sin cerrar', () => {
    expect(partirCoste('{')).toEqual([]);
    expect(partirCoste('{}')).toEqual([]);
    expect(partirCoste('{{B}').flat().map((s) => s.crudo)).toEqual(['B']);
    expect(partirCoste('{2}{B').flat().map((s) => s.crudo)).toEqual(['2']);
  });

  it('tieneSimbolos dice si hay algo que dibujar', () => {
    expect(tieneSimbolos('{2}{B}')).toBe(true);
    expect(tieneSimbolos('{2}{B')).toBe(true);
    expect(tieneSimbolos('{')).toBe(false);
    expect(tieneSimbolos('{}')).toBe(false);
    expect(tieneSimbolos(' // ')).toBe(false);
    expect(tieneSimbolos(null)).toBe(false);
  });

  it('el coste tiene su propio nombre accesible', () => {
    expect(ES.mana.coste([ES.mana.generico('2'), ES.mana.nombre.B!])).toBe(
      `Coste: ${ES.mana.generico('2')}, ${ES.mana.nombre.B}`,
    );
  });
});
