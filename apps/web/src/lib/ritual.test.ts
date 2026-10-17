import { describe, it, expect } from 'vitest';
import { avanzar, iniciar, ordenarPorEscasez, type Accion, type EstadoRitual } from './ritual.js';
import type { Nivel } from './rareza.js';

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
    const orden = ordenarPorEscasez(sobre, TIERS_YGO, 'YGO');
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
    const orden = ordenarPorEscasez(playBooster, TIERS_MTG, 'MTG');

    expect(orden.map((c) => c.rarity)).toEqual([
      'common', 'common', 'common', 'uncommon', 'rare', 'mythic',
    ]);
    // La mitica del slot 12 se revela DESPUES de la rara del slot 10.
    expect(orden[orden.length - 1]!.slotIndex).toBe(12);
  });

  it('desempata por slot para que el orden sea estable', () => {
    const sobre = [carta('common', 5), carta('common', 2), carta('common', 8)];
    expect(ordenarPorEscasez(sobre, TIERS_YGO, 'YGO').map((c) => c.slotIndex)).toEqual([2, 5, 8]);
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
    const orden = ordenarPorEscasez(sobre, TIERS_YGO, 'YGO');
    expect(orden[orden.length - 1]!.rarity).toBe('secret_rare');
  });

  it('una rareza de tier 50 no se queda el final: su nivel es 2', () => {
    const tiers = new Map([...TIERS_YGO, ['normal_parallel_rare', 50]]);
    const sobre = [
      carta('common', 0), carta('common', 1),
      carta('super_rare', 7), carta('normal_parallel_rare', 8),
    ];
    const orden = ordenarPorEscasez(sobre, tiers, 'YGO');
    expect(orden[orden.length - 1]!.rarity).toBe('super_rare');
  });

  it('no modifica el array original', () => {
    const sobre = [carta('super_rare', 8), carta('common', 0)];
    const copia = [...sobre];
    ordenarPorEscasez(sobre, TIERS_YGO, 'YGO');
    expect(sobre).toEqual(copia);
  });

  it('tolera un sobre vacio o de una sola carta', () => {
    expect(ordenarPorEscasez([], TIERS_YGO, 'YGO')).toEqual([]);
    expect(ordenarPorEscasez([carta('common', 0)], TIERS_YGO, 'YGO')).toHaveLength(1);
  });
});

const pasar = (e: EstadoRitual, ...acciones: Accion['tipo'][]) =>
  acciones.reduce((s, tipo) => avanzar(s, { tipo } as Accion), e);

const SOBRE: Nivel[] = [1, 1, 2, 3, 5];

describe('el ritual de apertura (H9e-4)', () => {
  it('empieza sellado y nada revelado', () => {
    expect(iniciar(SOBRE, false)).toEqual({ fase: 'sellado', niveles: SOBRE, reveladas: 0 });
  });

  it('con movimiento reducido no hay ritual: todo revelado y al resumen', () => {
    expect(iniciar(SOBRE, true)).toMatchObject({ fase: 'resumen', reveladas: 5 });
  });

  it('rasgar, terminar de rasgar, y el mazo', () => {
    expect(pasar(iniciar(SOBRE, false), 'rasgar').fase).toBe('rasgando');
    expect(pasar(iniciar(SOBRE, false), 'rasgar', 'rasgado').fase).toBe('mazo');
  });

  it('rasgar es idempotente y no hace nada fuera de sellado', () => {
    const uno = pasar(iniciar(SOBRE, false), 'rasgar');
    expect(pasar(iniciar(SOBRE, false), 'rasgar', 'rasgar')).toEqual(uno);
    const mazo = pasar(iniciar(SOBRE, false), 'rasgar', 'rasgado');
    expect(pasar(mazo, 'rasgar')).toEqual(mazo);
    const resumen = iniciar(SOBRE, true);
    expect(pasar(resumen, 'rasgar')).toEqual(resumen);
  });

  it('pedir carta sin haber rasgado no hace nada', () => {
    expect(pasar(iniciar(SOBRE, false), 'siguiente')).toEqual(iniciar(SOBRE, false));
  });

  it('las de nivel 1 a 3 se revelan al pedirlas', () => {
    const e = pasar(iniciar(SOBRE, false), 'rasgar', 'rasgado', 'siguiente', 'siguiente', 'siguiente', 'siguiente');
    expect(e).toMatchObject({ fase: 'mazo', reveladas: 4 });
  });

  it('una de nivel 4 o 5 pasa ANTES por la anticipacion', () => {
    const antes = pasar(iniciar(SOBRE, false), 'rasgar', 'rasgado', 'siguiente', 'siguiente', 'siguiente', 'siguiente', 'siguiente');
    expect(antes).toMatchObject({ fase: 'anticipacion', reveladas: 4 });
    expect(pasar(antes, 'anticipado')).toMatchObject({ fase: 'resumen', reveladas: 5 });
  });

  it('durante la anticipacion, pedir otra carta no se la salta', () => {
    const antes = pasar(iniciar([5], false), 'rasgar', 'rasgado', 'siguiente');
    expect(pasar(antes, 'siguiente')).toEqual(antes);
  });

  it('saltar lleva al resumen desde cualquier fase', () => {
    for (const pasos of [[], ['rasgar'], ['rasgar', 'rasgado'], ['rasgar', 'rasgado', 'siguiente']] as Accion['tipo'][][]) {
      expect(pasar(pasar(iniciar(SOBRE, false), ...pasos), 'saltar')).toMatchObject({ fase: 'resumen', reveladas: 5 });
    }
  });

  it('un sobre vacio rasgado acaba en el resumen al pedir carta', () => {
    expect(pasar(iniciar([], false), 'rasgar', 'rasgado', 'siguiente').fase).toBe('resumen');
  });
});
