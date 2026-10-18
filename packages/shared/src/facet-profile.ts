import type { GameCode } from './game.js';

/**
 * El perfil de facetas de cada juego (H9f, F-1).
 *
 * DATOS, NI SQL NI JSX. La API asocia cada clave con su SQL
 * (`apps/api/src/db/facetas-sql.ts`) y la web con su etiqueta y su forma de
 * pintarse (`apps/web/src/lib/facetas-web.ts`, `components/celdas.tsx`). Un test
 * por lado exige que cubran EXACTAMENTE estas claves, en los dos sentidos (F-2):
 * una faceta que falta en un lado rompe `npm test`, no la pantalla.
 *
 * Un juego nuevo es una entrada en `FACET_PROFILES`, no tres ficheros.
 */

/** Las claves que viajan en la URL y en la API, de los tres juegos. */
export const FACET_KEYS = [
  'supertype', 'type', 'mark',
  'color', 'kind', 'cost',
  'frame', 'attribute', 'level', 'link',
] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export function isFacetKey(value: string): value is FacetKey {
  return (FACET_KEYS as readonly string[]).includes(value);
}

/**
 * Como se filtra una faceta:
 *  - `valor`: igualdad sobre una columna;
 *  - `contiene`: pertenencia a una lista JSON, por el indice multivaluado;
 *  - `tramo`: numeros agrupados en tramos, con uno final abierto ("7+");
 *  - `propio`: un fragmento a medida, cuando ninguno de los tres cabe (F-3).
 */
export type FacetMode = 'valor' | 'contiene' | 'tramo' | 'propio';

/**
 * El valor que pide las cartas SIN valor. Hoy solo lo usa la marca de Pokemon:
 * 12.250 cartas anteriores a 2019 no la tienen y nunca la tendran, y pedirlas
 * es tan legitimo como pedir las de la marca I. Antes se llamaba `SIN_MARCA` y
 * vale lo mismo, asi que los enlaces viejos siguen sirviendo.
 */
export const SIN_VALOR = 'ninguna';

export interface FacetDef {
  key: FacetKey;
  mode: FacetMode;
  /** Valores conocidos, EN EL ORDEN DEL RAIL. Uno que no este se pinta al final. */
  values: readonly string[];
  /** Si existe el grupo "sin valor" (`SIN_VALOR`). */
  allowsNone: boolean;
}

export type FacetValues = Partial<Record<FacetKey, string>>;

/**
 * Los datos que una fila del catalogo lleva bajo `facetas`.
 *
 * NO SON LAS FACETAS: el coste en mana, la fuerza o el ATK se pintan pero no se
 * filtran, y el tramo de coste se filtra pero no es un dato de la carta. Una
 * fila lleva exactamente los datos que leen las celdas de su juego.
 */
export const ROW_FIELDS = [
  'type', 'hp', 'mark',
  'manaCost', 'kind', 'power', 'toughness', 'loyalty',
  'attribute', 'frame', 'level', 'linkVal', 'race', 'atk', 'def',
] as const;
export type RowField = (typeof ROW_FIELDS)[number];

/** Si el dato llega como numero o como texto. El esquema de la API sale de aqui. */
export const ROW_FIELD_KIND: Readonly<Record<RowField, 'text' | 'int'>> = {
  type: 'text', hp: 'int', mark: 'text',
  manaCost: 'text', kind: 'text', power: 'text', toughness: 'text', loyalty: 'text',
  attribute: 'text', frame: 'text', level: 'int', linkVal: 'int', race: 'text', atk: 'int', def: 'int',
};

export type RowFacets = Partial<Record<RowField, string | number | null>>;

/** Las celdas que una fila puede tener. La web sabe pintar cada una. */
export const CELL_KEYS = [
  'number', 'card', 'rarity', 'owned',
  'ptcgType', 'hp', 'mark',
  'manaCost', 'mtgKind', 'powerToughness',
  'attribute', 'levelRankLink', 'ygoType', 'atkDef',
] as const;
export type CellKey = (typeof CELL_KEYS)[number];

/** Que datos lee cada celda. Las comunes salen de campos fijos del resumen. */
export const CELL_FIELDS: Readonly<Record<CellKey, readonly RowField[]>> = {
  number: [], card: [], rarity: [], owned: [],
  ptcgType: ['type'], hp: ['hp'], mark: ['mark'],
  manaCost: ['manaCost'], mtgKind: ['kind'], powerToughness: ['power', 'toughness', 'loyalty'],
  attribute: ['attribute'], levelRankLink: ['frame', 'level', 'linkVal'], ygoType: ['race', 'kind'],
  atkDef: ['atk', 'def'],
};

export interface FacetProfile {
  /** Las secciones del rail, en orden. La tenencia y la rareza son de todos y no van aqui. */
  facets: readonly FacetDef[];
  /** Las celdas de la fila, en orden. */
  cells: readonly CellKey[];
}

/** Niveles y rangos que existen: del 0 al 13 (medido el 2026-10-18). */
const NIVELES = Array.from({ length: 14 }, (_, i) => String(i));

export const FACET_PROFILES: Readonly<Record<GameCode, FacetProfile>> = {
  PTCG: {
    facets: [
      // El valor de la base lleva la e acentuada, escrita con su escape: el
      // fuente es ASCII puro (Claude.md).
      { key: 'supertype', mode: 'valor', values: ['Pok\u00e9mon', 'Trainer', 'Energy'], allowsNone: false },
      {
        key: 'type', mode: 'valor', allowsNone: false,
        values: ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless'],
      },
      { key: 'mark', mode: 'valor', values: ['D', 'E', 'F', 'G', 'H', 'I', 'J'], allowsNone: true },
    ],
    cells: ['number', 'card', 'ptcgType', 'hp', 'rarity', 'mark', 'owned'],
  },
  MTG: {
    facets: [
      { key: 'color', mode: 'contiene', values: ['W', 'U', 'B', 'R', 'G', 'C', 'M'], allowsNone: false },
      {
        key: 'kind', mode: 'valor', allowsNone: false,
        values: ['creature', 'planeswalker', 'land', 'artifact', 'enchantment', 'instant', 'sorcery', 'battle', 'other'],
      },
      { key: 'cost', mode: 'tramo', values: ['0', '1', '2', '3', '4', '5', '6', '7+'], allowsNone: false },
    ],
    cells: ['manaCost', 'card', 'mtgKind', 'powerToughness', 'rarity', 'owned'],
  },
  YGO: {
    facets: [
      { key: 'kind', mode: 'valor', values: ['monster', 'spell', 'trap', 'skill', 'token'], allowsNone: false },
      {
        key: 'frame', mode: 'valor', allowsNone: false,
        values: ['normal', 'effect', 'ritual', 'fusion', 'synchro', 'xyz', 'pendulum', 'link', 'token'],
      },
      {
        key: 'attribute', mode: 'valor', allowsNone: false,
        values: ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'],
      },
      { key: 'level', mode: 'propio', values: NIVELES, allowsNone: false },
      { key: 'link', mode: 'valor', values: ['1', '2', '3', '4', '5', '6'], allowsNone: false },
    ],
    cells: ['attribute', 'levelRankLink', 'card', 'ygoType', 'atkDef', 'rarity', 'owned'],
  },
};

/** La definicion de una faceta EN UN JUEGO, o undefined si ese juego no la tiene. */
export function facetOf(game: GameCode, key: string): FacetDef | undefined {
  return FACET_PROFILES[game].facets.find((f) => f.key === key);
}

/** Los datos de fila de un juego, en el orden de `ROW_FIELDS`. */
export function rowFieldsOf(game: GameCode): RowField[] {
  const leidos = new Set(FACET_PROFILES[game].cells.flatMap((c) => CELL_FIELDS[c]));
  return ROW_FIELDS.filter((f) => leidos.has(f));
}
