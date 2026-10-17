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

/** Un paso de la simulacion; `escala` es el devicePixelRatio. Devuelve solo las vivas. */
export function avanzarParticulas(ps: readonly Particula[], escala: number): Particula[] {
  const vivas: Particula[] = [];
  for (const p of ps) {
    const vida = p.vida - 0.012;
    if (vida <= 0) continue;
    vivas.push({
      x: p.x + p.vx * escala, y: p.y + p.vy * escala,
      vx: p.vx, vy: p.vy + 0.06, vida, color: p.color,
    });
  }
  return vivas;
}
