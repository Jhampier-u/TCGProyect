/**
 * Logica pura de la capa de efectos (T-105): lo que se puede probar sin DOM.
 * El lienzo en si vive en `CapaDeEfectos.tsx`.
 */

/** Por encima de esto (ms por fotograma, ~45 fps de media) se baja la carga. */
export const FOTOGRAMA_LENTO = 22;
/** Un intervalo mayor que esto no es un fotograma lento: es una pausa (pestana, reposo). */
export const HUECO_MAXIMO = 200;
/** Cuantos fotogramas seguidos se promedian antes de decidir. */
export const FOTOGRAMAS_VENTANA = 10;
/** Suelo de la carga: antes se degrada la luz que las cartas, pero nunca se apaga. */
export const CARGA_MINIMA = 0.25;
const FACTOR_DEGRADACION = 0.9;

export interface Medidor {
  /** Intervalos recientes (ms), como mucho FOTOGRAMAS_VENTANA. */
  readonly recientes: readonly number[];
  /** Multiplicador de particulas, entre CARGA_MINIMA y 1. */
  readonly carga: number;
}

export function medidorNuevo(): Medidor {
  return { recientes: [], carga: 1 };
}

/**
 * Registra el intervalo de un fotograma. Un hueco largo se ignora; al llenar la
 * ventana se decide con la MEDIA, de modo que un tropiezo aislado no recorta
 * nada y solo la lentitud sostenida baja la carga. Tras decidir se vacia la
 * ventana: otra bajada exige otra racha entera.
 */
export function registrarFotograma(m: Medidor, dt: number): Medidor {
  if (dt > HUECO_MAXIMO || dt < 0) return m;
  const recientes = [...m.recientes, dt];
  if (recientes.length < FOTOGRAMAS_VENTANA) return { recientes, carga: m.carga };
  const media = recientes.reduce((a, b) => a + b, 0) / recientes.length;
  const carga = media > FOTOGRAMA_LENTO
    ? Math.max(CARGA_MINIMA, m.carga * FACTOR_DEGRADACION)
    : m.carga;
  return { recientes: [], carga };
}

export interface Particula {
  x: number; y: number; vx: number; vy: number; vida: number; color: string;
}

/** Tope de particulas vivas a la vez: dos revelados seguidos no apilan sin limite. */
export const MAX_PARTICULAS = 300;
/** Tope del devicePixelRatio: mas resolucion en un lienzo de luz no se ve y cuesta fotogramas. */
export const DPR_MAXIMO = 2;
/** Duracion de referencia de un fotograma (60 fps) en ms. */
const FOTOGRAMA_REF = 1000 / 60;
/** Un fotograma mas largo que esto se trata como 50 ms: ni saltos ni explosiones. */
const DT_MAXIMO = 50;

export function limitarDpr(dpr: number): number {
  return Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, DPR_MAXIMO);
}

/** Si pasa del tope, se descartan las mas antiguas (las del principio). */
export function limitarParticulas(ps: Particula[], max: number = MAX_PARTICULAS): Particula[] {
  return ps.length > max ? ps.slice(ps.length - max) : ps;
}

/**
 * Un paso de la simulacion de `dt` ms (recortado a 0..50). Movimiento,
 * gravedad y desvanecimiento escalan con `dt / 16.67`, asi que la luz dura lo
 * mismo a 30, 60 o 144 fps. `escala` es el devicePixelRatio. Devuelve las vivas.
 */
export function avanzarParticulas(
  ps: readonly Particula[], dt: number, escala = 1,
): Particula[] {
  const paso = Math.min(Math.max(dt, 0), DT_MAXIMO) / FOTOGRAMA_REF;
  const vivas: Particula[] = [];
  for (const p of ps) {
    const vida = p.vida - 0.012 * paso;
    if (vida <= 0) continue;
    vivas.push({
      x: p.x + p.vx * escala * paso, y: p.y + p.vy * escala * paso,
      vx: p.vx, vy: p.vy + 0.06 * paso, vida, color: p.color,
    });
  }
  return vivas;
}
