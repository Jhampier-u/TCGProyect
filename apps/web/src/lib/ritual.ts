import type { GameCode } from '@tcg/shared';
import { nivelDe, type Nivel } from './rareza.js';

/**
 * El ritual de apertura como maquina de estados pura (H9e-4).
 *
 * Sin React a proposito: los tests de este frontend son de logica, sin DOM, y la
 * secuencia es lo que de verdad hay que probar. El componente solo pinta la fase
 * y despacha acciones; los temporizadores (cuanto dura rasgar, cuanto la
 * anticipacion) son suyos.
 *
 * NO DECIDE NADA (D-7): las cartas, su orden y su rareza llegan del servidor.
 * Esto solo cuenta cuantas se han ensenado.
 */
export type Fase = 'sellado' | 'rasgando' | 'mazo' | 'anticipacion' | 'resumen';

export interface EstadoRitual {
  fase: Fase;
  /** El nivel de cada carta, YA en orden de revelado. */
  niveles: readonly Nivel[];
  /** Cuantas van reveladas, desde el principio del orden. */
  reveladas: number;
}

export type Accion =
  | { tipo: 'rasgar' }
  | { tipo: 'rasgado' }
  | { tipo: 'siguiente' }
  | { tipo: 'anticipado' }
  | { tipo: 'saltar' };

/** Desde que nivel una carta se anuncia antes de voltearse (spec, seccion 7). */
export const NIVEL_CON_ANTICIPACION = 4;

export function iniciar(niveles: readonly Nivel[], reducido: boolean): EstadoRitual {
  // Con movimiento reducido no hay ritual: el contenido no puede depender de la
  // animacion (es lo que comprueba T-040).
  return reducido
    ? { fase: 'resumen', niveles, reveladas: niveles.length }
    : { fase: 'sellado', niveles, reveladas: 0 };
}

export function avanzar(e: EstadoRitual, a: Accion): EstadoRitual {
  if (a.tipo === 'saltar') return { ...e, fase: 'resumen', reveladas: e.niveles.length };
  switch (e.fase) {
    case 'sellado':
      return a.tipo === 'rasgar' ? { ...e, fase: 'rasgando' } : e;
    case 'rasgando':
      return a.tipo === 'rasgado' ? { ...e, fase: 'mazo' } : e;
    case 'mazo': {
      if (a.tipo !== 'siguiente') return e;
      const nivel = e.niveles[e.reveladas];
      // Solo se alcanza con un sobre vacio: si no, el estado pasa a resumen al revelar la ultima.
      if (nivel === undefined) return { ...e, fase: 'resumen' };
      return nivel >= NIVEL_CON_ANTICIPACION ? { ...e, fase: 'anticipacion' } : revelarUna(e);
    }
    case 'anticipacion':
      return a.tipo === 'anticipado' ? revelarUna(e) : e;
    case 'resumen':
      return e;
    default: {
      // Una Fase nueva sin tratar aqui es un error de compilacion.
      const exhaustivo: never = e.fase;
      return exhaustivo;
    }
  }
}

function revelarUna(e: EstadoRitual): EstadoRitual {
  const reveladas = e.reveladas + 1;
  return { ...e, reveladas, fase: reveladas >= e.niveles.length ? 'resumen' : 'mazo' };
}

/**
 * Orden de revelado: de menos a mas escaso.
 *
 * La gracia de un sobre real esta en dejar la buena para el final, y el orden
 * de los slots la destriparia. El criterio es, por este orden: el NIVEL de
 * espectaculo (el que decide la anticipacion), el tier y el slot.
 *
 * El nivel va primero porque el orden y el nivel tienen que coincidir: el tier
 * 50 (promos y etiquetas, P-007) es el mayor numero pero tiene nivel 2, y
 * ordenar solo por tier le daria el final del sobre a una carta sin
 * espectaculo. Dentro de su nivel, el 50 cuenta como 0. Una rareza desconocida
 * es tier 0, nivel 1: no se cuela al final como si fuera lo mejor.
 */
export function ordenarPorEscasez<T extends { rarity: string; slotIndex: number }>(
  cards: readonly T[],
  tiers: Map<string, number>,
  game: GameCode,
): T[] {
  const clave = (c: T) => {
    const tier = tiers.get(c.rarity) ?? 0;
    return { nivel: nivelDe(game, tier), tier: tier >= 50 ? 0 : tier };
  };
  return [...cards].sort((a, b) => {
    const ka = clave(a);
    const kb = clave(b);
    if (ka.nivel !== kb.nivel) return ka.nivel - kb.nivel;
    if (ka.tier !== kb.tier) return ka.tier - kb.tier;
    return a.slotIndex - b.slotIndex;
  });
}

/**
 * Orden y niveles de un sobre, calculados JUNTOS.
 *
 * El componente debe usar este unico resultado tanto para pintar las cartas
 * como para llamar a `iniciar`: asi el orden que se ve y los niveles que
 * deciden la anticipacion no pueden divergir. `niveles[i]` es el de `orden[i]`.
 */
export function prepararSobre<T extends { rarity: string; slotIndex: number }>(
  cards: readonly T[],
  tiers: Map<string, number>,
  game: GameCode,
): { orden: T[]; niveles: Nivel[] } {
  const orden = ordenarPorEscasez(cards, tiers, game);
  return { orden, niveles: orden.map((c) => nivelDe(game, tiers.get(c.rarity) ?? 0)) };
}
