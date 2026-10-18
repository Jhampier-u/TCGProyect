import type { GameCode } from '@tcg/shared';
import { ES } from '../i18n/es.js';

/**
 * Los cinco niveles de espectaculo de H9e (spec, seccion 6).
 *
 * POR JUEGO Y NO POR TIER A SECAS: los tiers no significan lo mismo en cada
 * juego. Magic acaba en 6, Yu-Gi-Oh! llega a 15, y el 50 de los dos agrupa
 * promos y etiquetas que no son rarezas (P-007). Con una tabla unica, una
 * mitica de Magic seria un "destello" y una Starlight no tendria nivel.
 */
export type Nivel = 1 | 2 | 3 | 4 | 5;
export type Acabado = 'normal' | 'foil';

const TABLA: Record<GameCode, Readonly<Record<number, Nivel>>> = {
  PTCG: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 50: 2 },
  MTG: { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 4 },
  YGO: {
    1: 1, 2: 1, 3: 1, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4,
    9: 5, 10: 5, 11: 5, 12: 5, 13: 5, 14: 5, 15: 5, 50: 2,
  },
};

/** Un tier desconocido es comun: lo mismo que hace el orden de revelado. */
export function nivelDe(juego: GameCode, tier: number): Nivel {
  return TABLA[juego][tier] ?? 1;
}

/** Los tiers con nivel propio, por juego. Lo usa la prueba para detectar uno que falte. */
export function tiersConNivel(juego: GameCode): number[] {
  return Object.keys(TABLA[juego]).map(Number).sort((a, b) => a - b);
}

/** `foil` es una propiedad fisica, no de rareza: no sube el nivel. */
export function acabadoDe(finish: string): Acabado {
  return finish === 'foil' ? 'foil' : 'normal';
}

/**
 * El nombre que se ensena de una rareza (H9f). Su etiqueta de la base, salvo
 * cuando la etiqueta es el codigo en bruto (Magic, 0002): entonces su
 * presentacion, y si no la hay, el codigo tal cual.
 */
export function etiquetaDeRareza(r: { code: string; label: string }): string {
  if (r.label !== r.code) return r.label;
  return ES.rarezaPresentacion[r.code] ?? r.code;
}

/** Codigo -> nombre, para la fila, el rail y la ficha. */
export function nombresDeRareza(rarezas: readonly { code: string; label: string }[]): Map<string, string> {
  return new Map(rarezas.map((r) => [r.code, etiquetaDeRareza(r)]));
}
