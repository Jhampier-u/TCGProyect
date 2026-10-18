import type { FacetDef, FacetKey, RowField } from '@tcg/shared';
import { ROW_FIELDS, SIN_VALOR } from '@tcg/shared';

/**
 * Cada clave del perfil, en SQL (H9f, F-2).
 *
 * El perfil (`@tcg/shared`) dice QUE facetas tiene cada juego; esto dice COMO se
 * filtran y como se cuentan. `facetas-sql.test.ts` exige que las dos listas
 * coincidan en los dos sentidos.
 *
 * Todos los fragmentos son literales de este fichero. Lo unico que viene de
 * fuera es el VALOR, y siempre va como parametro.
 */

/** Una condicion de WHERE con sus parametros, en el orden de sus `?`. */
export interface Condicion {
  sql: string;
  params: unknown[];
}

/**
 * La condicion que no casa con nada. Un valor desconocido de una faceta conocida
 * da un resultado vacio, no un error: puede ser legitimo y no estar aun en la
 * lista (spec 7).
 */
export const NADA: Condicion = { sql: '1 = 0', params: [] };

export interface FacetSql {
  /** La condicion de WHERE para un valor. */
  filtro: (valor: string) => Condicion;
  /** La de "sin valor", solo en las facetas que la admiten. */
  sinValor?: string;
  /** La expresion por la que se agrupa al contar. NULL es "sin valor". */
  grupo: string;
  /**
   * De la clave de un grupo a los valores de faceta en que cuenta: ninguno, uno
   * o varios. Varios es el color: una carta azul y negra cuenta en los dos y
   * en multicolor.
   */
  valores: (crudo: string) => string[];
}

const NUMERO = /^\d+$/;

function porColumna(columna: string, opciones: { numerica?: boolean; sinValor?: boolean } = {}): FacetSql {
  return {
    filtro: (valor) => {
      if (opciones.numerica && !NUMERO.test(valor)) return NADA;
      return { sql: `${columna} = ?`, params: [opciones.numerica ? Number(valor) : valor] };
    },
    ...(opciones.sinValor ? { sinValor: `${columna} IS NULL` } : {}),
    grupo: columna,
    valores: (crudo) => [crudo],
  };
}

const COLORES = ['W', 'U', 'B', 'R', 'G'];

const color: FacetSql = {
  filtro: (valor) => {
    // LA MISMA EXPRESION QUE EL INDICE MULTIVALUADO de la 0001
    // (`CAST(game_data->'$.colors' AS CHAR(2) ARRAY)`): con otra forma MySQL no
    // lo reconoce y recorre Magic entero. Comprobado con EXPLAIN en T-109.
    if (COLORES.includes(valor)) return { sql: "? MEMBER OF (c.game_data->'$.colors')", params: [valor] };
    // Incolora es "sin colores Y no es un reverso" (F-5): las 2.675 "Card //
    // Card" no traen colores, y contarlas aqui triplicaria la seccion.
    if (valor === 'C') return { sql: "c.color_count = 0 AND c.kind <> 'other'", params: [] };
    if (valor === 'M') return { sql: 'c.color_count >= 2', params: [] };
    return NADA;
  },
  // Se agrupa por tipo y lista de colores a la vez: unas cien combinaciones,
  // y de cada una salen los valores en que cuenta. Una sola pasada.
  // COALESCE porque CONCAT_WS se salta los NULL: un `kind` nulo perderia el
  // separador y su lista de colores se leeria como el tipo. Con '' el tipo
  // vacio no es incoloro, igual que en el filtro, que descarta el NULL.
  grupo: "CONCAT_WS('|', COALESCE(c.kind, ''), CAST(JSON_EXTRACT(c.game_data, '$.colors') AS CHAR))",
  valores: (crudo) => {
    const corte = crudo.indexOf('|');
    const kind = corte < 0 ? crudo : crudo.slice(0, corte);
    const lista = corte < 0 ? [] : (JSON.parse(crudo.slice(corte + 1)) as string[]);
    const fuera = lista.filter((c) => COLORES.includes(c));
    if (lista.length === 0 && kind !== 'other' && kind !== '') fuera.push('C');
    if (lista.length >= 2) fuera.push('M');
    return fuera;
  },
};

/** El tramo final, abierto: "7+". Recoge la carta de broma de coste 1.000.000. */
const TOPE_DE_COSTE = 7;

const cost: FacetSql = {
  filtro: (valor) => {
    // Los reversos tienen coste 0 y no es un coste: la faceta los aparta (F-5).
    // Por eso la suma de los tramos es menor que el total, y el rail lo dice.
    if (valor === `${TOPE_DE_COSTE}+`) {
      return { sql: "c.cmc >= ? AND c.kind <> 'other'", params: [TOPE_DE_COSTE] };
    }
    if (!NUMERO.test(valor) || Number(valor) >= TOPE_DE_COSTE) return NADA;
    const n = Number(valor);
    // Semiabierto: los costes de 0,5 de los Un-sets caen en el tramo 0.
    return { sql: "c.cmc >= ? AND c.cmc < ? AND c.kind <> 'other'", params: [n, n + 1] };
  },
  grupo:
    `CASE WHEN c.kind = 'other' OR c.cmc IS NULL THEN NULL ` +
    `WHEN c.cmc >= ${TOPE_DE_COSTE} THEN '${TOPE_DE_COSTE}+' ` +
    `ELSE CAST(FLOOR(c.cmc) AS CHAR) END`,
  valores: (crudo) => [crudo],
};

const level: FacetSql = {
  // F-6: 110 monstruos Link traen `level` ademas de `link_val`. Sin apartarlos
  // saldrian en "nivel 4" sin serlo. Es el modo `propio` (F-3).
  filtro: (valor) =>
    NUMERO.test(valor) ? { sql: "c.lvl = ? AND NOT (c.frame <=> 'link')", params: [Number(valor)] } : NADA,
  grupo: "CASE WHEN c.frame <=> 'link' THEN NULL ELSE c.lvl END",
  valores: (crudo) => [crudo],
};

export const FACET_SQL: Readonly<Record<FacetKey, FacetSql>> = {
  // Pokemon: las columnas de la 0027, con los mismos fragmentos que antes.
  supertype: porColumna('c.supertype'),
  type: porColumna('c.elem_type'),
  mark: porColumna('c.reg_mark', { sinValor: true }),
  // Magic y Yu-Gi-Oh!: las de la 0029, mas `cmc` y `lvl` de la 0001.
  color,
  kind: porColumna('c.kind'),
  cost,
  frame: porColumna('c.frame'),
  attribute: porColumna('c.attribute'),
  level,
  link: porColumna('c.link_val', { numerica: true }),
};

/** La condicion de una faceta del perfil para un valor, "sin valor" incluido. */
export function condicionDeFaceta(def: FacetDef, valor: string): Condicion {
  const sql = FACET_SQL[def.key];
  if (valor === SIN_VALOR) {
    return def.allowsNone && sql.sinValor ? { sql: sql.sinValor, params: [] } : NADA;
  }
  return sql.filtro(valor);
}

const deJson = (ruta: string) => `JSON_UNQUOTE(JSON_EXTRACT(c.game_data, '$.${ruta}'))`;

/** De donde sale cada dato de fila. */
export const ROW_FIELD_SQL: Readonly<Record<RowField, string>> = {
  type: 'c.elem_type',
  hp: 'c.hp',
  mark: 'c.reg_mark',
  manaCost: deJson('mana_cost'),
  kind: 'c.kind',
  power: deJson('power'),
  toughness: deJson('toughness'),
  loyalty: deJson('loyalty'),
  attribute: 'c.attribute',
  frame: 'c.frame',
  level: 'c.lvl',
  linkVal: 'c.link_val',
  race: deJson('race'),
  atk: 'c.atk',
  def: 'c.def',
};

/**
 * Las columnas de fila con su alias `ff_<dato>`, UNA SOLA LISTA para la busqueda
 * y para la ficha. Cada consulta tenia la suya y por eso la ficha devolvio un
 * 500 en T-092: se anadieron las facetas a una y no a la otra.
 */
export const COLUMNAS_DE_FILA = ROW_FIELDS.map((f) => `${ROW_FIELD_SQL[f]} AS ff_${f}`).join(',\n              ');

/** Un valor de faceta y cuantas cartas lo tienen, para el rail (T-092). */
export interface FacetCount {
  value: string;
  count: number;
  /** Cuantas de esas tiene el usuario. `null` sin sesion: no es un cero. */
  owned: number | null;
}

/** Una fila cruda del GROUP BY. `SUM` llega como cadena DECIMAL por mysql2. */
export interface FilaDeRecuento {
  valor: string | number | null;
  n: number | string;
  tengo?: number | string | null;
}

/**
 * De los grupos crudos a la lista del rail: reparte, acumula y ordena.
 *
 * EL ORDEN SALE DEL PERFIL, NO DEL RECUENTO: que las filas del rail no bailen
 * al cambiar de set. Un valor que el perfil no conoce se pinta igual, detras y
 * por orden alfabetico; "sin valor", el ultimo.
 */
export function repartir(filas: readonly FilaDeRecuento[], def: FacetDef, conTenencia: boolean): FacetCount[] {
  const acumulado = new Map<string, { count: number; owned: number }>();
  for (const f of filas) {
    const valores =
      f.valor === null ? (def.allowsNone ? [SIN_VALOR] : []) : FACET_SQL[def.key].valores(String(f.valor));
    for (const v of valores) {
      const previo = acumulado.get(v) ?? { count: 0, owned: 0 };
      acumulado.set(v, { count: previo.count + Number(f.n), owned: previo.owned + Number(f.tengo ?? 0) });
    }
  }
  const rango = (v: string): number => {
    if (v === SIN_VALOR) return Number.MAX_SAFE_INTEGER;
    const i = def.values.indexOf(v);
    return i < 0 ? def.values.length : i;
  };
  return [...acumulado.entries()]
    .sort(([a], [b]) => rango(a) - rango(b) || a.localeCompare(b))
    .map(([value, x]) => ({ value, count: x.count, owned: conTenencia ? x.owned : null }));
}
