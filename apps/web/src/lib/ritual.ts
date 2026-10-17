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
  /**
   * La carta que esta EN EL FOCO: revelada, en grande, en el centro de la
   * escena, esperando a que el usuario avance. Es un indice del orden (siempre
   * `reveladas - 1` cuando no es null). Null: no hay ninguna en grande.
   *
   * Avanzar ('siguiente') la manda a la bandeja y revela la siguiente. La
   * ULTIMA tambien espera a un avance mas antes del resumen: es la mejor del
   * sobre (el orden va de menos a mas escasa) y quitarsela al usuario con un
   * temporizador le robaria justo el momento que el ritual prepara.
   */
  foco: number | null;
  /** Modo rapido (sobres 2 y siguientes de un lote): solo van al foco los niveles 4 y 5. */
  rapido: boolean;
}

export type Accion =
  | { tipo: 'rasgar' }
  | { tipo: 'rasgado' }
  | { tipo: 'siguiente' }
  | { tipo: 'anticipado' }
  | { tipo: 'saltar' };

/** Desde que nivel una carta se anuncia antes de voltearse (spec, seccion 7). */
export const NIVEL_CON_ANTICIPACION = 4;

export function iniciar(niveles: readonly Nivel[], reducido: boolean, rapido = false): EstadoRitual {
  // Con movimiento reducido no hay ritual ni foco: el contenido no puede
  // depender de la animacion (es lo que comprueba T-040).
  return reducido
    ? { fase: 'resumen', niveles, reveladas: niveles.length, foco: null, rapido }
    : { fase: 'sellado', niveles, reveladas: 0, foco: null, rapido };
}

export function avanzar(e: EstadoRitual, a: Accion): EstadoRitual {
  // Saltar no pasa por el foco: quien salta quiere el resumen, no el espectaculo.
  if (a.tipo === 'saltar') return { ...e, fase: 'resumen', reveladas: e.niveles.length, foco: null };
  switch (e.fase) {
    case 'sellado':
      return a.tipo === 'rasgar' ? { ...e, fase: 'rasgando' } : e;
    case 'rasgando':
      return a.tipo === 'rasgado' ? { ...e, fase: 'mazo' } : e;
    case 'mazo': {
      if (a.tipo !== 'siguiente') return e;
      // Avanzar SIEMPRE vacia el foco primero: la carta en grande vuela a la bandeja.
      const sinFoco = { ...e, foco: null };
      const nivel = e.niveles[e.reveladas];
      // Mazo vacio: o la ultima carta deja el foco, o el sobre estaba vacio.
      if (nivel === undefined) return { ...sinFoco, fase: 'resumen' };
      return nivel >= NIVEL_CON_ANTICIPACION ? { ...sinFoco, fase: 'anticipacion' } : revelarUna(sinFoco);
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
  const indice = e.reveladas;
  const reveladas = indice + 1;
  const alFoco = !e.rapido || e.niveles[indice]! >= NIVEL_CON_ANTICIPACION;
  const foco = alFoco ? indice : null;
  // Con la ultima en el foco aun no hay resumen: espera a su avance.
  const fase = reveladas >= e.niveles.length && foco === null ? 'resumen' : 'mazo';
  return { ...e, reveladas, foco, fase };
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
  return clasificar(cards, tiers, game).map((k) => k.carta);
}

/** Cada carta con su nivel y su tier de orden, YA ordenadas: se calculan una vez. */
function clasificar<T extends { rarity: string; slotIndex: number }>(
  cards: readonly T[],
  tiers: Map<string, number>,
  game: GameCode,
): Array<{ carta: T; nivel: Nivel; tier: number }> {
  return cards
    .map((carta) => {
      const tier = tiers.get(carta.rarity) ?? 0;
      return { carta, nivel: nivelDe(game, tier), tier: tier >= 50 ? 0 : tier };
    })
    .sort((a, b) => {
      if (a.nivel !== b.nivel) return a.nivel - b.nivel;
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.carta.slotIndex - b.carta.slotIndex;
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
  const clasificadas = clasificar(cards, tiers, game);
  return { orden: clasificadas.map((k) => k.carta), niveles: clasificadas.map((k) => k.nivel) };
}
