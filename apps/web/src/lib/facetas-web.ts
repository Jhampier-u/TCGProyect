import type { CSSProperties } from 'react';
import type { FacetKey, GameCode } from '@tcg/shared';
import { SIN_VALOR } from '@tcg/shared';
import { ES } from '../i18n/es.js';
import { estiloDeTipo } from './tipos-pokemon.js';
import { estiloDeAtributo, estiloDeMana } from './colores-de-juego.js';

/**
 * Cada clave del perfil, en la pantalla (H9f, F-2).
 *
 * El perfil dice QUE facetas tiene cada juego; esto dice como se llaman y como
 * se leen sus valores. `facetas-web.test.ts` exige las mismas claves que el
 * perfil, en los dos sentidos.
 */
export interface PresentacionDeFaceta {
  /** El nombre de la seccion del rail, que es tambien su nombre accesible. */
  titulo: (juego: GameCode) => string;
  /** Como se lee un valor, en el rail y en su chip. */
  etiqueta: (valor: string) => string;
  /** Si lo tiene, el color del punto de la fila (deja `--tipo` en el estilo). */
  estilo?: (valor: string) => CSSProperties | undefined;
  /** Una nota bajo la fila del valor ("Sin marca"). */
  nota?: (valor: string) => string | undefined;
}

const de = (tabla: Record<string, string>) => (valor: string) => tabla[valor] ?? valor;

export const PRESENTACION: Readonly<Record<FacetKey, PresentacionDeFaceta>> = {
  supertype: { titulo: () => ES.rail.categoria, etiqueta: de(ES.pokemon.supertipo) },
  type: { titulo: () => ES.rail.tipo, etiqueta: de(ES.pokemon.tipo), estilo: estiloDeTipo },
  mark: {
    titulo: () => ES.rail.marca,
    etiqueta: (v) => (v === SIN_VALOR ? ES.rail.sinMarca : ES.pokemon.marca(v)),
    // La ausencia se explica, no se pinta como hueco (spec H9b, seccion 2).
    nota: (v) => (v === SIN_VALOR ? ES.rail.sinMarcaNota : undefined),
  },
  color: { titulo: () => ES.facetas.titulo.color, etiqueta: de(ES.facetas.color), estilo: estiloDeMana },
  // Misma clave en dos juegos, con dos nombres: en Magic es el tipo, en
  // Yu-Gi-Oh! la clase (monstruo, magica, trampa...).
  kind: {
    titulo: (juego) => (juego === 'YGO' ? ES.facetas.titulo.clase : ES.rail.tipo),
    etiqueta: de(ES.facetas.kind),
  },
  cost: { titulo: () => ES.facetas.titulo.coste, etiqueta: ES.facetas.coste },
  frame: { titulo: () => ES.facetas.titulo.marco, etiqueta: de(ES.facetas.frame) },
  attribute: {
    titulo: () => ES.facetas.titulo.atributo, etiqueta: de(ES.facetas.attribute), estilo: estiloDeAtributo,
  },
  level: { titulo: () => ES.facetas.titulo.nivel, etiqueta: ES.facetas.nivel },
  link: { titulo: () => ES.facetas.titulo.link, etiqueta: ES.facetas.link },
};
