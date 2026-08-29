import { hash, verify } from '@node-rs/argon2';

/**
 * Identificador de Argon2id.
 *
 * Se escribe el valor numerico en vez de importar `Algorithm.Argon2id` porque
 * esa enumeracion es un `const enum` ambiental y el proyecto compila con
 * `verbatimModuleSyntax`, que los prohibe. El orden de la enumeracion de
 * @node-rs/argon2 es Argon2d=0, Argon2i=1, **Argon2id=2**.
 *
 * Argon2id y no Argon2i ni Argon2d: es el hibrido recomendado por OWASP, el
 * unico que resiste a la vez ataques por canal lateral y por GPU.
 */
const ARGON2ID = 2;

/**
 * Parametros de Argon2id, segun la recomendacion de OWASP.
 *
 * 19 MiB de memoria y 2 iteraciones es el punto en que un ataque por fuerza
 * bruta resulta caro sin que el login se note lento. Subirlos protege mas pero
 * convierte el login en un vector de agotamiento de memoria: cada intento
 * concurrente reserva `memoryCost`.
 */
export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash senuelo contra la enumeracion de usuarios.
 *
 * Cuando el correo no existe, `verifyPassword` se ejecuta igualmente contra este
 * hash. Sin eso, un login con correo inexistente responderia en microsegundos y
 * uno con correo real tardaria lo que tarda Argon2id: la diferencia de tiempo
 * delata que correos estan registrados, que es justo lo que un atacante quiere
 * saber antes de empezar a probar contrasenas.
 *
 * Se calcula una vez al arrancar sobre un valor sin significado.
 */
let senuelo: string | null = null;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * Verifica una contrasena.
 *
 * `stored` a null significa "no hay tal usuario": se gasta el mismo tiempo
 * verificando contra el senuelo y se devuelve false. El llamante no debe
 * distinguir ese caso del de contrasena incorrecta.
 */
export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (stored === null) {
    senuelo ??= await hashPassword('contrasena-senuelo-sin-uso');
    await verify(senuelo, plain).catch(() => false);
    return false;
  }

  try {
    return await verify(stored, plain);
  } catch {
    // Un hash corrupto en base de datos no debe tumbar el login del resto.
    return false;
  }
}

/** Precalcula el senuelo para que el primer login no pague su coste. */
export async function warmUp(): Promise<void> {
  senuelo ??= await hashPassword('contrasena-senuelo-sin-uso');
}

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

/**
 * Valida una contrasena antes de aceptarla.
 *
 * El minimo es de LONGITUD y no de "un simbolo, una mayuscula y un numero". Las
 * reglas de composicion empujan a la gente hacia contrasenas predecibles
 * (`Password1!`) y hoy se consideran contraproducentes; la longitud es lo que
 * de verdad encarece un ataque.
 *
 * El maximo existe por un motivo distinto: sin el, alguien puede enviar 10 MB de
 * texto y obligar al servidor a hashearlos, que es una denegacion de servicio
 * barata de ejecutar.
 */
export function validatePassword(plain: string): string | null {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return `La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    return `La contrasena no puede superar los ${MAX_PASSWORD_LENGTH} caracteres`;
  }
  return null;
}

/**
 * Normaliza un correo para usarlo como identidad.
 *
 * Minusculas y sin espacios. Sin esto, `Juan@example.com` y `juan@example.com`
 * crearian dos cuentas distintas, y el usuario no entenderia por que su login
 * "no funciona" segun como escriba.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
