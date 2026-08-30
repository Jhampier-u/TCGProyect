import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

/**
 * T-089 - la regla de ASCII puro, comprobada por lo que DICE que protege.
 *
 * `Claude.md` la exige desde S008 y hasta hoy no la comprobaba nadie. No es
 * cosmetica: en S032 un heredoc convirtio un `\b` en un byte 0x08 de verdad
 * dentro de una expresion regular, que no casa con nada y **no se ve al leer**.
 * La comprobacion que lo contenia nacio muerta y paso en verde.
 *
 * QUE PROTEGE LA REGLA, segun ella misma: "un combinante suelto en el fuente se
 * pega visualmente al caracter anterior y cualquier herramienta que reescriba el
 * fichero puede destruirlo sin que se note". El peligro son los caracteres
 * INVISIBLES O FRAGILES, no los acentos: la propia regla remata con "los
 * comentarios en espanol si llevan acentos con normalidad".
 *
 * POR ESO ESTE TEST NO BUSCA BYTES ALTOS A SECAS. Al escribirlo asi la primera
 * vez marco 19 ficheros, y al mirarlos uno a uno solo UNO era una infraccion de
 * verdad. Los demas eran:
 *
 *   - Datos de prueba que SON lo que se prueba: `normalizeRarityCode` recibe
 *     `Collector's Rare` con apostrofo tipografico y `Flabebe` con acentos
 *     porque normalizarlos es su trabajo. Construirlos con `String.fromCharCode`
 *     esconderia justo lo que la prueba verifica.
 *   - Puntuacion en texto de salida (`-`, `.`) de la CLI y de la interfaz.
 *   - Cadenas que tienen que coincidir LITERALMENTE con un documento del Vault
 *     que las lleva. Ofuscarlas romperia la coincidencia o la haria ilegible.
 *
 * Ajustar el codigo a la version estricta habria empeorado el proyecto para
 * satisfacer una lectura de la regla que la regla no pide. Asi que se comprueban
 * las TRES cosas que si son siempre un fallo:
 *
 *   1. Caracteres de CONTROL en cualquier sitio, comentarios incluidos. Es lo
 *      que paso en S032: un 0x08 dentro de una expresion regular que no casaba
 *      con nada y no se veia al leer.
 *   2. COMBINANTES sueltos (`\p{M}`), que es literalmente lo que la regla
 *      nombra. Una `e` precompuesta es inofensiva; una `e` seguida de U+0301 es
 *      la trampa.
 *   3. No-ASCII en el CODIGO propiamente dicho -- identificadores, operadores --
 *      fuera de cadenas y comentarios. Es el caso de `let senuelo`, que llevaba
 *      una enye en un nombre de variable sin ninguna necesidad.
 */

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

const CARPETAS = ['apps', 'packages', 'e2e', 'tools'];
const IGNORAR = ['node_modules', 'dist', 'dist-types', 'artefactos', '.vite'];
const EXTENSIONES = ['.ts', '.tsx', '.mjs', '.css'];
/** El modulo de cadenas: datos con acentos a proposito (T-089). */
const EXENTOS = ['apps/web/src/i18n/'];

function ficheros(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    if (IGNORAR.includes(entrada.name)) continue;
    const rel = `${dir}/${entrada.name}`;
    if (entrada.isDirectory()) ficheros(rel, salida);
    else if (EXTENSIONES.some((e) => entrada.name.endsWith(e))) salida.push(rel);
  }
  return salida;
}

const NO_ASCII = /[^\t\n\r\x20-\x7e]/;

/**
 * Recorre el fichero y devuelve el no-ASCII que hay en CODIGO: ni en comentario
 * ni dentro de una cadena.
 *
 * Sigue el estado del lexer a mano -- cadena, plantilla, comentario de linea,
 * comentario de bloque -- porque quitar comentarios con una expresion regular
 * se traga la mitad de una URL en cuanto aparece un `//` dentro de una cadena.
 *
 * LAS EXPRESIONES REGULARES TAMBIEN CUENTAN COMO CODIGO, y esto SI es un limite
 * del lexer: distinguir `/` de division de `/` de expresion regular necesita un
 * analizador de verdad. Ha saltado dos veces, y las dos el arreglo mejoro el
 * codigo -- un escape `·` en la comprobacion del Vault, y un
 * `{ exact: false }` en vez de una regex en la suite E2E -- asi que el falso
 * positivo se deja a proposito en vez de complicar el lexer.
 *
 * EL TEXTO SUELTO DE JSX CUENTA COMO CODIGO, y eso no es un limite sino el
 * comportamiento que se quiere. `<span>3 . 4</span>` no esta
 * dentro de comillas, asi que cae aqui -- y esta bien que caiga, porque el
 * texto que lee el usuario no debe estar incrustado en un componente. Su sitio
 * es `i18n/`, que es exactamente lo que hace T-089.
 */
function noAsciiEnCodigo(texto: string): Array<{ linea: number; muestra: string }> {
  const fallos: Array<{ linea: number; muestra: string }> = [];
  let linea = 1;
  let estado: 'codigo' | 'linea' | 'bloque' | "'" | '"' | '`' = 'codigo';

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i]!;
    const siguiente = texto[i + 1];

    if (c === '\n') {
      if (estado === 'linea') estado = 'codigo';
      linea += 1;
      continue;
    }

    if (estado === 'linea') continue;
    if (estado === 'bloque') {
      if (c === '*' && siguiente === '/') { estado = 'codigo'; i += 1; }
      continue;
    }

    if (estado === "'" || estado === '"' || estado === '`') {
      if (c === '\\') { i += 1; continue; }
      // Dentro de una cadena NO se reporta: es texto, no codigo. Lo fragil de
      // una cadena -- control y combinantes -- lo cazan las otras dos pruebas.
      if (c === estado) estado = 'codigo';
      continue;
    }

    // estado === 'codigo'
    if (c === '/' && siguiente === '/') { estado = 'linea'; i += 1; continue; }
    if (c === '/' && siguiente === '*') { estado = 'bloque'; i += 1; continue; }
    if (c === "'" || c === '"' || c === '`') { estado = c; continue; }
    if (NO_ASCII.test(c)) fallos.push({ linea, muestra: c });
  }

  return fallos;
}

describe('la regla de ASCII puro del codigo fuente', () => {
  const TODOS = CARPETAS.flatMap((c) => ficheros(c));

  it('encuentra ficheros que mirar', () => {
    // Sin esto, un error en el recorrido dejaria el test en verde por vacio.
    expect(TODOS.length).toBeGreaterThan(80);
  });

  it('ningun fichero lleva no-ASCII en el codigo (identificadores, operadores)', () => {
    const infractores = TODOS
      .filter((f) => !EXENTOS.some((e) => f.startsWith(e)))
      .map((f) => ({ f, fallos: noAsciiEnCodigo(readFileSync(join(RAIZ, f), 'utf8')) }))
      .filter((x) => x.fallos.length > 0)
      .map((x) => `${x.f}: linea ${x.fallos[0]!.linea} y ${x.fallos.length - 1} mas`);

    expect(infractores).toEqual([]);
  });

  it('ningun fichero lleva un caracter de CONTROL, ni en un comentario', () => {
    // Esta si es absoluta: un 0x08 dentro de un comentario tampoco se ve, y es
    // exactamente lo que paso en S032.
    const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
    const infractores = TODOS
      .filter((f) => CONTROL.test(readFileSync(join(RAIZ, f), 'utf8')))
      .map((f) => relative('.', f));

    expect(infractores).toEqual([]);
  });

  it('ningun fichero lleva un COMBINANTE suelto', () => {
    // Lo que la regla nombra por su nombre. Una vocal precompuesta es
    // inofensiva; la misma vocal seguida de U+0301 se pega a lo anterior al
    // pintarse y desaparece en cuanto una herramienta reescribe el fichero.
    const COMBINANTE = /\p{M}/u;
    const infractores = TODOS
      .filter((f) => COMBINANTE.test(readFileSync(join(RAIZ, f), 'utf8')))
      .map((f) => relative('.', f));

    expect(infractores).toEqual([]);
  });
});
