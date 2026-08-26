import type { PtcgGameData, YgoGameData } from '../game-data.js';

/**
 * Separador de Scryfall entre supertipos/tipos y subtipos: un guion largo
 * (U+2014). El codigo fuente se mantiene en ASCII puro, asi que se construye en
 * vez de escribirse como literal.
 */
const EM_DASH = String.fromCharCode(0x2014);

/**
 * Parte de TIPOS de un `type_line`, sin los subtipos.
 *
 * Yu-Gi-Oh! nunca trae separador (`humanReadableCardType` es una frase suelta) y
 * en Magic tampoco lo traen los hechizos: cuando falta, la linea entera son
 * tipos.
 */
export function typesOf(typeLine: string | null | undefined): string {
  if (!typeLine) return '';
  const corte = typeLine.indexOf(EM_DASH);
  return (corte === -1 ? typeLine : typeLine.slice(0, corte)).trim();
}

/** Palabras del texto, en minusculas y sin puntuacion. */
function tokens(texto: string): string[] {
  return texto
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((token) => token !== '');
}

/**
 * Magic: una carta con el supertipo `Basic` no tiene limite de copias.
 *
 * El predicado es el SUPERTIPO, no la subcadena "Basic Land": la tierra nevada
 * es `Basic Snow Land` y no contiene esa cadena. Mirar solo la parte de tipos
 * evita ademas confundir un subtipo con un supertipo.
 */
export function isMtgBasicLand(typeLine: string | null | undefined): boolean {
  return tokens(typesOf(typeLine)).includes('basic');
}

/** Familias que viven en el Extra Deck de Yu-Gi-Oh!. */
const YGO_EXTRA_TOKENS = ['fusion', 'synchro', 'xyz', 'link'] as const;

/**
 * Yu-Gi-Oh!: si la carta pertenece al Extra Deck.
 *
 * La comparacion es por PALABRA y en minusculas. El catalogo real dice
 * `Xyz Effect Monster`, no `XYZ`: un `includes('XYZ')` dejaria todos los Xyz en
 * el Main Deck sin producir ningun error.
 *
 * Se exige ademas la palabra `monster` porque las cuatro familias son siempre
 * monstruos; sin ella, cualquier tipo futuro que contuviera una de las palabras
 * caeria en el Extra Deck por accidente.
 */
export function isYgoExtraDeckCard(typeLine: string | null | undefined): boolean {
  const palabras = tokens(typesOf(typeLine));
  if (!palabras.includes('monster')) return false;
  return YGO_EXTRA_TOKENS.some((token) => palabras.includes(token));
}

/** Copias permitidas de una carta de Yu-Gi-Oh! cuando la banlist no dice nada. */
export const YGO_DEFAULT_COPY_LIMIT = 3;

/**
 * Copias permitidas segun la banlist vigente del TCG.
 *
 * `banlist_info` SOLO existe en las cartas restringidas: el adaptador omite el
 * campo cuando el origen no lo trae. Por eso la ausencia significa "3 copias",
 * nunca "desconocido".
 *
 * Es el snapshot ingestado, no una consulta en vivo (RN-05).
 */
export function ygoCopyLimit(gameData: YgoGameData): number {
  const estado = gameData.banlist_info?.ban_tcg?.trim().toLowerCase();
  if (estado === 'banned') return 0;
  if (estado === 'limited') return 1;
  if (estado === 'semi-limited') return 2;
  return YGO_DEFAULT_COPY_LIMIT;
}

/**
 * Pokemon: si la carta es Energia Basica, que no tiene limite de copias.
 *
 * Exige las dos condiciones. `supertype === 'Energy'` a secas incluiria las
 * Energias Especiales, que SI estan limitadas a 4.
 */
export function isPtcgBasicEnergy(gameData: PtcgGameData): boolean {
  if (gameData.supertype?.trim().toLowerCase() !== 'energy') return false;
  return (gameData.subtypes ?? []).some((sub) => sub.trim().toLowerCase() === 'basic');
}
