/**
 * Generador pseudoaleatorio sembrado. Implementa la parte determinista de ADR-005.
 *
 * POR QUE NO `Math.random()`. Una apertura de sobre debe ser auditable (RN-01):
 * hay que poder demostrar que el resultado no se manipulo despues. Con
 * `Math.random()` no hay nada que demostrar. Ademas, los tests de Cypress (H8)
 * necesitan que abrir un sobre con la misma semilla de siempre el mismo
 * resultado, y eso es imposible sin sembrar.
 *
 * ALGORITMO: xoshiro128**. Se elige frente a mulberry32 por una razon concreta:
 * la semilla que se persiste son 32 caracteres hexadecimales, es decir 128 bits.
 * mulberry32 tiene estado de 32 bits, asi que habria que comprimir la semilla y
 * tirar tres cuartas partes de su entropia. xoshiro128** tiene estado de 128
 * bits y la aprovecha entera.
 */

export type Rng = () => number;

/** Longitud de la semilla persistida. Coincide con `pack_openings.seed CHAR(32)`. */
export const SEED_LENGTH = 32;

/**
 * xoshiro128** de Blackman y Vigna.
 *
 * Devuelve valores en [0, 1). Toda la aritmetica es de 32 bits con `|0` y `>>>`,
 * que es como JavaScript expresa enteros de 32 bits sin salirse a coma flotante.
 */
export function xoshiro128ss(a: number, b: number, c: number, d: number): Rng {
  let s0 = a >>> 0;
  let s1 = b >>> 0;
  let s2 = c >>> 0;
  let s3 = d >>> 0;

  // Un estado todo a cero es un punto fijo: xoshiro devolveria cero para
  // siempre. Solo puede ocurrir con una semilla degenerada ("000...0"), pero
  // conviene que el motor no se rompa en silencio si alguien la fuerza.
  if ((s0 | s1 | s2 | s3) === 0) {
    s0 = 0x9e3779b9;
    s1 = 0x243f6a88;
    s2 = 0xb7e15162;
    s3 = 0x6a09e667;
  }

  return function next(): number {
    const t = (s1 << 9) >>> 0;
    let r = Math.imul(s1, 5);
    r = (Math.imul((r << 7) | (r >>> 25), 9) >>> 0);

    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = ((s3 << 11) | (s3 >>> 21)) >>> 0;

    return r / 4294967296;
  };
}

/**
 * Construye el generador a partir de la semilla persistida.
 *
 * La semilla es la representacion canonica: 32 caracteres hexadecimales, que se
 * parten en cuatro palabras de 32 bits. Una semilla mas corta o con caracteres
 * no hexadecimales se rechaza en vez de aceptarse a medias: una semilla mal
 * formada produciria una apertura que despues no se puede reproducir.
 */
export function rngFromSeed(seed: string): Rng {
  const normalized = seed.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(normalized)) {
    throw new Error(
      `Semilla invalida: se esperaban ${SEED_LENGTH} caracteres hexadecimales, se recibio ${JSON.stringify(seed)}`,
    );
  }

  return xoshiro128ss(
    Number.parseInt(normalized.slice(0, 8), 16),
    Number.parseInt(normalized.slice(8, 16), 16),
    Number.parseInt(normalized.slice(16, 24), 16),
    Number.parseInt(normalized.slice(24, 32), 16),
  );
}

/**
 * Genera una semilla nueva.
 *
 * Usa `crypto.randomUUID`, que es criptograficamente seguro. No hace falta que
 * lo sea para simular un sobre, pero si conviene que un usuario no pueda
 * predecir la siguiente semilla y elegir cuando abrir.
 */
export function generateSeed(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '');
}

/**
 * Elige un elemento segun pesos enteros.
 *
 * Consume EXACTAMENTE un valor del generador. Ese detalle no es cosmetico: el
 * numero y el orden de las llamadas al PRNG forman parte del contrato de
 * reproducibilidad. Cambiarlos altera todas las aperturas pasadas.
 */
export function pickWeighted<T>(items: ReadonlyArray<{ item: T; weight: number }>, rng: Rng): T {
  const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
  const roll = rng() * total;

  let acumulado = 0;
  for (const entry of items) {
    acumulado += Math.max(0, entry.weight);
    if (roll < acumulado) return entry.item;
  }
  // Solo alcanzable por error de redondeo en coma flotante en el limite superior.
  return items[items.length - 1]!.item;
}

/** Indice uniforme en [0, length). Consume exactamente un valor. */
export function pickIndex(length: number, rng: Rng): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}
