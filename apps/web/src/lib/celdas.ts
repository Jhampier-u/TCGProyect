import type { CellKey } from '@tcg/shared';
import { ES } from '../i18n/es.js';

/**
 * Cabecera y clase de cada celda de la fila (H9f). La clase es la misma en la
 * cabecera y en la celda: es lo que fija su ancho y la oculta en estrecho.
 */
export const CABECERAS: Readonly<Record<CellKey, { etiqueta: string; clase: string }>> = {
  number: { etiqueta: ES.catalogo.columnas.numero, clase: 'col-numero' },
  card: { etiqueta: ES.catalogo.columnas.carta, clase: 'col-carta' },
  rarity: { etiqueta: ES.catalogo.columnas.rareza, clase: 'col-rareza' },
  owned: { etiqueta: ES.catalogo.columnas.tienes, clase: 'col-tienes' },
  ptcgType: { etiqueta: ES.catalogo.columnas.tipo, clase: 'col-tipo' },
  hp: { etiqueta: ES.catalogo.columnas.ps, clase: 'col-ps' },
  mark: { etiqueta: ES.catalogo.columnas.marca, clase: 'col-marca' },
  manaCost: { etiqueta: ES.catalogo.columnas.coste, clase: 'col-mana' },
  mtgKind: { etiqueta: ES.catalogo.columnas.tipo, clase: 'col-tipo' },
  powerToughness: { etiqueta: ES.catalogo.columnas.fr, clase: 'col-fr' },
  attribute: { etiqueta: ES.catalogo.columnas.atributo, clase: 'col-atributo' },
  levelRankLink: { etiqueta: ES.catalogo.columnas.nivel, clase: 'col-nivel' },
  ygoType: { etiqueta: ES.catalogo.columnas.tipo, clase: 'col-tipo' },
  atkDef: { etiqueta: ES.catalogo.columnas.atkDef, clase: 'col-atkdef' },
};
