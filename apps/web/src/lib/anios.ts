import type { SetSummary } from './api.js';

/**
 * Los sets de un juego agrupados por anio de salida (H9f, F-8).
 *
 * En Magic las epocas de `pack_templates` describen el PRODUCTO -- clasico,
 * Draft Booster, Play Booster -- y no le dicen a nadie donde esta un set; el
 * anio si. Pokemon conserva su portada por epocas.
 *
 * Comparacion de cadenas `YYYY`, como `epocas.ts`: sin husos horarios. Dentro
 * de cada anio se respeta el orden de la API (del mas reciente al mas antiguo).
 */
export interface AnioConSets {
  /** `YYYY`, o null para los sets sin fecha. */
  anio: string | null;
  sets: SetSummary[];
}

export function agruparPorAnio(sets: readonly SetSummary[]): AnioConSets[] {
  const grupos = new Map<string | null, SetSummary[]>();
  for (const s of sets) {
    const anio = s.releasedAt ? s.releasedAt.slice(0, 4) : null;
    grupos.set(anio, [...(grupos.get(anio) ?? []), s]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b.localeCompare(a)))
    .map(([anio, delAnio]) => ({ anio, sets: delAnio }));
}

/** Cuantos anios hay de verdad: el grupo de los sets sin fecha no es un anio. */
export function cuantosAnios(grupos: readonly AnioConSets[]): number {
  return grupos.filter((g) => g.anio !== null).length;
}
