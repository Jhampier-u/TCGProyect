import { ES } from '../i18n/es.js';

/**
 * El coste en mana de Magic, de la notacion de Scryfall ("{2}{B} // {B}") a
 * simbolos que el CSS pinta como circulos (H9f, F-9). Nada de imagenes: P-001.
 */
export type ColorDeMana = 'w' | 'u' | 'b' | 'r' | 'g';

export interface SimboloDeMana {
  /** El simbolo tal como llega, sin llaves: "2", "B", "G/W", "B/P". */
  crudo: string;
  /** Lo que se escribe dentro del circulo. Vacio en un hibrido de dos colores. */
  texto: string;
  /** Sus colores: ninguno (generico), uno, o dos (hibrido, circulo partido). */
  colores: ColorDeMana[];
}

const COLOR: Readonly<Record<string, ColorDeMana>> = { W: 'w', U: 'u', B: 'b', R: 'r', G: 'g' };

/**
 * Una lista de simbolos por cara. Las de dos caras traen " // " entre costes.
 * Una cara sin simbolos se descarta: si no, dejaria un separador colgando. Lo
 * mal formado ("{", "{}", una llave sin cerrar) no es un simbolo.
 */
export function partirCoste(coste: string | null | undefined): SimboloDeMana[][] {
  if (!coste) return [];
  return coste
    .split(' // ')
    .map((cara) => [...cara.matchAll(/\{([^{}]+)\}/g)].map((m) => simbolo(m[1]!)))
    .filter((cara) => cara.length > 0);
}

/** Si el coste tiene algo que dibujar. Sin esto, la celda quedaria en blanco. */
export function tieneSimbolos(coste: string | null | undefined): boolean {
  return partirCoste(coste).length > 0;
}

function simbolo(crudo: string): SimboloDeMana {
  const partes = crudo.split('/');
  const colores = partes.map((p) => COLOR[p]).filter((c): c is ColorDeMana => c !== undefined);
  const resto = partes.filter((p) => COLOR[p] === undefined);
  // Monocolor: su letra. Hibrido de dos colores: el circulo partido ya lo dice.
  // Pirexiano o hibrido con generico: lo que no es color ("P", "2").
  const texto = colores.length === 2 ? '' : colores.length === 1 && resto.length === 0 ? crudo : resto.join('/');
  return { crudo, texto, colores };
}

/** La lectura de cada simbolo, para el nombre accesible del coste. */
export function leerCoste(caras: SimboloDeMana[][]): string[] {
  return caras.flatMap((cara, i) => [...(i > 0 ? [ES.mana.otraCara] : []), ...cara.map(leerSimbolo)]);
}

function leerSimbolo(s: SimboloDeMana): string {
  const partes = s.crudo.split('/');
  const nombres = partes
    .filter((p) => p !== 'P')
    .map((p) => (/^[0-9]+$/.test(p) ? ES.mana.generico(p) : ES.mana.nombre[p] ?? p));
  const base = nombres.join(ES.mana.o);
  return partes.includes('P') ? ES.mana.pirexiano(base) : base;
}
