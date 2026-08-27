/**
 * Utilidades de normalizacion de la capa anticorrupcion.
 *
 * Cada funcion de aqui existe porque una API real devolvio datos sucios. No son
 * defensa preventiva: son cicatrices. Ver P-007 y 005Registro/S003.
 */

/**
 * Longitud maxima de `rarities.code`. Es VARCHAR(48) en el DDL, no 32: Yu-Gi-Oh!
 * tiene rarezas como `duel_terminal_normal_parallel_rare` (34 caracteres) que
 * desbordaban la columna con error 1406 (P-009).
 */
export const RARITY_CODE_MAX_LENGTH = 48;

/** Rareza de respaldo cuando el origen es irrecuperable. Existe en los tres juegos. */
export const FALLBACK_RARITY_CODE = 'common';

/**
 * Marcas diacriticas combinantes, via propiedad Unicode.
 *
 * Se usa `\p{M}` y no un rango de caracteres literales por una razon practica:
 * un combinante suelto en el codigo fuente se pega visualmente al corchete
 * anterior y cualquier herramienta que reescriba el fichero puede destruirlo sin
 * que se note. Ademas `\p{M}` cubre todas las marcas, no solo el bloque latino.
 */
const COMBINING_MARKS = /\p{M}/gu;

/**
 * Apostrofo recto, tipografico (U+2019) y modificador (U+02BC).
 * Construido con `String.fromCharCode` por el mismo motivo: mantener el fuente
 * en ASCII puro y que los caracteres no dependan de la codificacion del fichero.
 */
const APOSTROPHES = new RegExp(`['${String.fromCharCode(0x2019, 0x02bc)}]`, 'g');

/**
 * Signos de genero de Pokemon. NO se pueden borrar sin mas: Nidoran(macho) y
 * Nidoran(hembra) son dos Pokemon DISTINTOS con el mismo nombre base. Si el
 * simbolo se elimina, ambos colapsan en el mismo oracleKey y la ingesta fusiona
 * dos cartas en una, perdiendo una de ellas para siempre.
 * Se mapean a sufijos "-m" y "-f" para mantenerlos separados.
 */
const MALE_SIGN = String.fromCharCode(0x2642);
const FEMALE_SIGN = String.fromCharCode(0x2640);
const GENDER_SIGNS = new RegExp(`[${MALE_SIGN}${FEMALE_SIGN}]`, 'g');

/**
 * Cadenas que el origen mete en el campo de rareza y NO son rarezas (T-081).
 *
 * YGOPRODeck usa `set_rarity` para dos cosas distintas: la rareza de verdad y,
 * a veces, el ESTADO de la carta en ese set. Medido sobre el catalogo completo:
 *
 *   new                       80 impresiones
 *   reprint                   11
 *   new_artwork                9
 *   european_oceanian_debut    6
 *   force_smw / european_debut / oceanian_debut   1 cada una
 *
 * "New" no dice que la carta sea comun: dice que no es una reimpresion. Dejarlas
 * pasar creaba rarezas fantasma que ninguna plantilla podia nombrar -- ni debia
 * --, y por eso 16 sets salian en el informe de cobertura como si les faltara
 * una plantilla cuando lo que falta es el dato en el origen.
 *
 * Se tratan como rareza IRRECUPERABLE, que es el caso que el contrato de T-007
 * ya cubre: `null` aqui, el adaptador cae a `FALLBACK_RARITY_CODE` y emite un
 * aviso.
 *
 * EL PRECIO, DICHO: esas cartas quedan registradas como comunes, y algunas no lo
 * son -- las 22 de `Battles of Legend: Monster Mayhem` conviven con secret y
 * starlight. Se acepta porque la alternativa es peor: sin rareza utilizable son
 * INOBTENIBLES para siempre, y P-021 enseno lo que cuesta un set que el
 * coleccionista no puede cerrar. El aviso deja constancia de cada una.
 */
const NO_SON_RAREZAS = new Set([
  'new',
  'reprint',
  'new_artwork',
  'european_debut',
  'oceanian_debut',
  'european_oceanian_debut',
  'force_smw',
]);

/**
 * Abreviaturas que el origen usa para una rareza que SI existe (T-081).
 *
 * `cr` aparece una vez en `Quarter Century Stampede`, un set que ademas tiene
 * `collectors_rare`: es la misma rareza escrita corta. Traducirla es lo
 * contrario de inventar -- crear `cr` como rareza propia habria partido en dos
 * algo que es uno.
 */
const ALIAS: ReadonlyMap<string, string> = new Map([['cr', 'collectors_rare']]);

/**
 * Convierte la cadena de rareza de una API en un `rarities.code`.
 *
 * Reglas (contrato de T-007):
 *  1. minusculas, sin acentos, sin apostrofos
 *  2. cualquier run de caracteres no alfanumericos -> "_"
 *  3. devuelve null si queda vacia, si es puramente numerica, si excede 48 o si
 *     es una ETIQUETA DE ESTADO disfrazada de rareza (T-081)
 *  4. traduce las abreviaturas conocidas a la rareza que nombran
 *
 * El paso 1 es el que salva el caso real de YGOPRODeck: "PLatinum Secret Rare"
 * (con L intercalada, errata del origen) cae correctamente en
 * 'platinum_secret_rare' en vez de crear una rareza fantasma.
 *
 * El paso 3 descarta la otra basura real del mismo origen: los literales "2" y "3".
 *
 * Devolver null NO significa descartar la carta. El adaptador debe caer a
 * FALLBACK_RARITY_CODE y emitir un IngestWarning.
 */
export function normalizeRarityCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;

  const code = raw
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(APOSTROPHES, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (code === '') return null;
  if (/^\d+$/.test(code)) return null; // "2" y "3" no son rarezas
  if (code.length > RARITY_CODE_MAX_LENGTH) return null;
  if (NO_SON_RAREZAS.has(code)) return null; // T-081: es un estado, no una rareza

  return ALIAS.get(code) ?? code;
}

/**
 * Convierte un valor de la API en un numero apto para `game_data`.
 *
 * Existe por Yu-Gi-Oh!: las cartas de ATK variable (Slifer y compania) traen
 * `"atk": "?"`. Persistir ese "?" hace que la columna generada `atk` intente un
 * CAST que en modo estricto **aborta el INSERT** y tumba la ingesta del set.
 *
 * El DDL lleva una guarda JSON_TYPE defensiva, pero el sitio correcto para
 * normalizar es aqui, en la capa anticorrupcion.
 *
 * Devuelve `undefined` (no null) para que la clave se OMITA al serializar, que
 * es lo que exige el contrato de game_data.
 */
export function toJsonNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Convierte un valor de la API en un array de cadenas apto para `game_data`.
 *
 * Critico para `colors` de MTG: el indice multivaluado
 * `CAST(game_data->'$.colors' AS CHAR(2) ARRAY)` exige un array. Un escalar ahi
 * rompe el INSERT.
 *
 * Devuelve `undefined` si no hay nada util, para que la clave se omita.
 */
export function toStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return values.length > 0 ? values : undefined;
}

/**
 * Elimina las claves `undefined` de un objeto plano.
 *
 * `JSON.stringify` ya las omite, pero esta funcion permite comparar objetos
 * game_data en los tests y garantiza que no se escriben claves vacias si el
 * driver de MySQL serializa por su cuenta.
 *
 * SOBRE LA FIRMA: el parametro es un tipo mapeado homomorfico y no `T` a secas.
 * Con `exactOptionalPropertyTypes: true`, TypeScript distingue "clave ausente"
 * de "clave presente con valor undefined", asi que un objeto construido a base
 * de `toJsonNumber(...)` (que devuelve `number | undefined`) NO es asignable a
 * un tipo cuyas propiedades opcionales son `number`. El tipo mapeado admite
 * explicitamente el undefined en la entrada, que es justo lo que esta funcion
 * se encarga de eliminar.
 */
export function stripUndefined<T extends object>(obj: { [K in keyof T]: T[K] | undefined }): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * Normaliza un nombre de carta para usarlo como `oracleKey`.
 *
 * Solo lo necesita Pokemon TCG: su API no expone un identificador conceptual
 * (para ella todas las impresiones de Charizard son cartas distintas), asi que
 * la identidad conceptual hay que construirla desde el nombre.
 */
export function normalizeOracleKeyFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(APOSTROPHES, '')
    .replace(GENDER_SIGNS, (sign) => (sign === MALE_SIGN ? '-m' : '-f'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
