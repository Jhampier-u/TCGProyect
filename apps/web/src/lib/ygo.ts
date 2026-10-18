import { ES } from '../i18n/es.js';

/** Que marca lleva un monstruo: nivel (estrellas), rango (Xyz) o link. */
export type ClaseDeNivel = 'nivel' | 'rango' | 'link';

export interface MarcaDeNivel {
  clase: ClaseDeNivel;
  valor: number;
}

/**
 * La marca de un monstruo a partir de su marco.
 *
 * EL LINK MANDA SOBRE `level`: 110 monstruos Link traen tambien `level`, y sin
 * este orden saldrian con estrellas (F-6). El RANGO de los Xyz llega en
 * `level`: YGOPRODeck usa el mismo campo para los dos.
 */
export function marcaDeNivel(frame: string | null, level: number | null, linkVal: number | null): MarcaDeNivel | null {
  if (frame === 'link') return linkVal === null ? null : { clase: 'link', valor: linkVal };
  if (level === null) return null;
  return { clase: frame === 'xyz' ? 'rango' : 'nivel', valor: level };
}

/** ATK o DEF como se leen: -1 es el "?" de las cartas de ATK variable. */
export function cifraDeCombate(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  return n === -1 ? ES.simbolo.desconocido : String(n);
}

/** Las ocho flechas de un Link, en el orden de una rejilla de 3x3; el centro es null. */
export const FLECHAS = [
  'Top-Left', 'Top', 'Top-Right',
  'Left', null, 'Right',
  'Bottom-Left', 'Bottom', 'Bottom-Right',
] as const;

/**
 * Las flechas activas de un Link, sin repetir, sin las que no se conocen y en
 * el orden de la rejilla. Sin lista (o vacia) no hay flechas que dibujar.
 */
export function flechasDeLink(markers: readonly string[] | null | undefined): string[] {
  if (!markers) return [];
  return FLECHAS.filter((f): f is NonNullable<typeof f> => f !== null && markers.includes(f));
}

/**
 * La raza de un monstruo, o el subtipo de una magica o trampa, en castellano
 * (H9f). Lo que no tiene nombre -- el personaje de una habilidad -- sale tal cual.
 */
export function nombreDeRaza(raza: string | null): string | null {
  if (raza === null) return null;
  return ES.facetas.raza[raza] ?? raza;
}
