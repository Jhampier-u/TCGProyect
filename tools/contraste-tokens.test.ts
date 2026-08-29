import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * T-088 - el contraste de la paleta, comprobado contra `tokens.css`.
 *
 * POR QUE ES UN TEST Y NO UN SCRIPT. Lo primero que escribi fue un script
 * suelto con los colores copiados dentro. Funciono, dijo lo que tenia que
 * decir... y a los diez minutos, al afinar los tonos de tipo, seguia
 * reportando los fallos de la version anterior: **tenia los valores viejos
 * dentro**. Una comprobacion que guarda su propia copia de lo que vigila
 * miente en cuanto lo vigilado cambia.
 *
 * Este lee el fichero. No puede quedarse viejo.
 *
 * QUE COMPRUEBA
 *  - Que cada pareja real de la interfaz llega al minimo de WCAG AA, en los
 *    DOS temas: 4,5:1 para texto normal, 3:1 para texto grande y bordes.
 *  - Que los once tipos de Pokemon se leen sobre su superficie en los dos.
 *  - Que los dos bloques de tema claro -- el del media query y el del
 *    conmutador -- dicen EXACTAMENTE lo mismo. Estan duplicados por como
 *    funciona la cascada, y actualizar uno y olvidar el otro es el fallo mas
 *    facil de cometer en este fichero.
 */

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const CSS = readFileSync(join(RAIZ, 'apps/web/src/styles/tokens.css'), 'utf8');

/** Los `--token: valor;` de un bloque, dado el texto que lo abre. */
function bloque(apertura: string): Map<string, string> {
  const i = CSS.indexOf(apertura);
  if (i < 0) throw new Error(`no encuentro el bloque que abre con "${apertura}"`);
  const cuerpo = CSS.slice(i + apertura.length, CSS.indexOf('\n}', i));
  const tokens = new Map<string, string>();
  for (const m of cuerpo.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(m[1]!, m[2]!.trim());
  }
  return tokens;
}

const OSCURO = bloque(':root {');
const CLARO_MEDIA = bloque(':root:not([data-tema="oscuro"]) {');
const CLARO_ATRIBUTO = bloque(':root[data-tema="claro"] {');

/** El claro hereda del oscuro lo que no redefine, igual que en la cascada. */
const CLARO = new Map([...OSCURO, ...CLARO_ATRIBUTO]);

const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminancia(hex: string): number {
  const n = hex.replace('#', '').trim();
  const partes = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  return 0.2126 * canal(partes[0]!) + 0.7152 * canal(partes[1]!) + 0.0722 * canal(partes[2]!);
}

function razon(a: string, b: string): number {
  const [alta, baja] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alta! + 0.05) / (baja! + 0.05);
}

function valor(tema: Map<string, string>, token: string): string {
  const v = tema.get(token);
  if (!v) throw new Error(`el token --${token} no existe en este tema`);
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`--${token} no es un hex de 6 digitos: ${v}`);
  return v;
}

/** [frente, fondo, minimo]. 4,5 texto normal · 3 texto grande y bordes. */
const PAREJAS: ReadonlyArray<readonly [string, string, number]> = [
  ['texto', 'fondo', 4.5],
  ['texto', 'fondo-alt', 4.5],
  ['texto', 'superficie', 4.5],
  ['texto-tenue', 'fondo', 4.5],
  ['texto-tenue', 'superficie', 4.5],
  ['acento', 'fondo', 4.5],
  ['acento', 'fondo-alt', 4.5],
  ['acento', 'superficie', 4.5],
  ['sobre-acento', 'acento', 4.5],
  ['peligro-texto', 'peligro-fondo', 4.5],
  ['peligro', 'fondo', 3],
  ['exito', 'fondo', 3],
  // WCAG 1.4.11: el limite de un elemento interactivo pide 3:1.
  ['borde-control', 'fondo', 3],
  ['borde-control', 'superficie', 3],
  // `--borde` a secas NO se comprueba, y es deliberado: es un separador
  // decorativo entre superficies que ya se distinguen solas, y ninguna norma le
  // pone un minimo. La primera version de este test le invento un 1,4:1, fallo
  // con 1,25:1, y la tentacion fue bajar el umbral hasta que pasara. Eso es
  // ajustar la prueba al resultado. Lo correcto era separar el borde que SI
  // tiene norma -- el de los controles -- y dejar de medir el que no.
];

const TIPOS = [
  'agua', 'planta', 'psiquico', 'incoloro', 'lucha', 'fuego',
  'rayo', 'oscuro', 'metal', 'dragon', 'hada',
] as const;

describe.each([
  ['oscuro', OSCURO],
  ['claro', CLARO],
])('contraste en el tema %s', (_nombre, tema) => {
  it.each(PAREJAS)('%s sobre %s llega a %s:1', (frente, fondo, minimo) => {
    const r = razon(valor(tema, frente), valor(tema, fondo));
    expect(Number(r.toFixed(2)), `--${frente} sobre --${fondo}`).toBeGreaterThanOrEqual(minimo);
  });

  it('los once tipos de Pokemon se leen sobre la superficie', () => {
    const flojos = TIPOS.map((t) => ({ t, r: razon(valor(tema, `tipo-${t}`), valor(tema, 'superficie')) }))
      .filter((x) => x.r < 3)
      .map((x) => `${x.t} ${x.r.toFixed(2)}:1`);
    expect(flojos).toEqual([]);
  });
});

describe('los dos bloques de tema claro', () => {
  it('dicen exactamente lo mismo', () => {
    // Duplicados por la cascada, no por descuido: uno responde al ajuste del
    // sistema y el otro a la eleccion explicita. Que se separen es silencioso.
    const discrepancias = [...CLARO_ATRIBUTO.entries()]
      .filter(([k, v]) => CLARO_MEDIA.get(k) !== v)
      .map(([k, v]) => `--${k}: media dice "${CLARO_MEDIA.get(k)}", atributo dice "${v}"`);
    expect(discrepancias).toEqual([]);
    expect(CLARO_MEDIA.size, 'un bloque define tokens que el otro no').toBe(CLARO_ATRIBUTO.size);
  });
});

describe('ningun token de color se define SOLO en un tema', () => {
  it('todo lo que el claro redefine existe ya en el oscuro', () => {
    // El fallo clasico: un color cuya unica definicion vive dentro del media
    // query. En el tema base queda sin valor y la pagina pinta el texto de un
    // tema sobre el fondo del otro.
    const huerfanos = [...CLARO_ATRIBUTO.keys()].filter((k) => !OSCURO.has(k));
    expect(huerfanos).toEqual([]);
  });
});
