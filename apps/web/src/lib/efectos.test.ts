import { describe, it, expect } from 'vitest';
import {
  CARGA_MINIMA, FOTOGRAMAS_VENTANA, HUECO_MAXIMO, FOTOGRAMA_LENTO,
  medidorNuevo, registrarFotograma, avanzarParticulas, limitarParticulas, limitarDpr,
  MAX_PARTICULAS, DPR_MAXIMO, type Particula,
} from './efectos.js';

function alimentar(n: number, dt: number, m = medidorNuevo()) {
  let medidor = m;
  for (let i = 0; i < n; i += 1) medidor = registrarFotograma(medidor, dt);
  return medidor;
}

describe('medidor de fotogramas', () => {
  it('empieza a plena carga', () => {
    expect(medidorNuevo().carga).toBe(1);
  });

  it('fotogramas sanos no bajan la carga', () => {
    expect(alimentar(100, 16).carga).toBe(1);
  });

  it('un hueco de inactividad no cuenta como fotograma lento', () => {
    const m = alimentar(50, HUECO_MAXIMO + 1);
    expect(m.carga).toBe(1);
  });

  it('un tropiezo aislado no recorta las particulas', () => {
    let m = alimentar(5, 16);
    m = registrarFotograma(m, FOTOGRAMA_LENTO + 30);
    m = alimentar(10, 16, m);
    expect(m.carga).toBe(1);
  });

  it('fotogramas lentos sostenidos bajan la carga', () => {
    const m = alimentar(FOTOGRAMAS_VENTANA, FOTOGRAMA_LENTO + 10);
    expect(m.carga).toBeLessThan(1);
  });

  it('la carga nunca baja del suelo', () => {
    const m = alimentar(FOTOGRAMAS_VENTANA * 100, FOTOGRAMA_LENTO + 10);
    expect(m.carga).toBe(CARGA_MINIMA);
  });
});

describe('medidor: casos finos', () => {
  it('un pico aislado, que solo no pasaria el corte, no degrada porque se promedia', () => {
    let m = medidorNuevo();
    m = alimentar(9, 16, m);
    m = registrarFotograma(m, 70);
    expect(70).toBeGreaterThan(FOTOGRAMA_LENTO);
    expect(m.carga).toBe(1);
  });

  it('tras degradar, la ventana se vacia: otro fotograma lento no degrada hasta una ventana entera', () => {
    let m = alimentar(FOTOGRAMAS_VENTANA, FOTOGRAMA_LENTO + 10);
    const tras = m.carga;
    expect(tras).toBeLessThan(1);
    m = alimentar(FOTOGRAMAS_VENTANA - 1, FOTOGRAMA_LENTO + 10, m);
    expect(m.carga).toBe(tras);
    m = registrarFotograma(m, FOTOGRAMA_LENTO + 10);
    expect(m.carga).toBeLessThan(tras);
  });
});

describe('avanzarParticulas', () => {
  const p = (vida: number): Particula => ({ x: 0, y: 0, vx: 2, vy: 0, vida, color: 'c' });

  it('mueve, aplica gravedad y gasta vida', () => {
    const [q] = avanzarParticulas([p(1)], 16.67, 2);
    expect(q?.x).toBeCloseTo(4, 1);
    expect(q?.vy).toBeGreaterThan(0);
    expect(q?.vida).toBeLessThan(1);
  });

  it('descarta las que se han apagado', () => {
    expect(avanzarParticulas([p(0.001)], 16.67, 1)).toHaveLength(0);
  });

  it('no depende de la tasa de fotogramas: dos pasos de 8.33 ms ~ uno de 16.67 ms', () => {
    const uno = avanzarParticulas([p(1)], 16.67)[0];
    const dos = avanzarParticulas(avanzarParticulas([p(1)], 8.33), 8.33)[0];
    expect(dos?.x).toBeCloseTo(uno?.x ?? NaN, 1);
    expect(dos?.vida).toBeCloseTo(uno?.vida ?? NaN, 2);
    expect(dos?.y).toBeCloseTo(uno?.y ?? NaN, 1);
  });

  it('un dt enorme se recorta a 50 ms y uno negativo no mueve nada', () => {
    const enorme = avanzarParticulas([p(1)], 100000)[0];
    const tope = avanzarParticulas([p(1)], 50)[0];
    expect(enorme).toEqual(tope);
    const neg = avanzarParticulas([p(1)], -5)[0];
    expect(neg?.x).toBe(0);
    expect(neg?.vida).toBe(1);
  });

  it('con dt 0 (primer fotograma) no cambia nada', () => {
    expect(avanzarParticulas([p(1)], 0)[0]).toEqual(p(1));
  });
});

describe('limitarParticulas', () => {
  const lote = (n: number): Particula[] =>
    Array.from({ length: n }, (_, i) => ({ x: i, y: 0, vx: 0, vy: 0, vida: 1, color: 'c' }));

  it('no toca lo que cabe', () => {
    expect(limitarParticulas(lote(10))).toHaveLength(10);
  });

  it('se queda con las mas recientes al pasar el tope', () => {
    const r = limitarParticulas(lote(MAX_PARTICULAS + 20));
    expect(r).toHaveLength(MAX_PARTICULAS);
    expect(r[0]?.x).toBe(20);
  });
});

describe('limitarDpr', () => {
  it('recorta a 2 y tolera valores invalidos', () => {
    expect(DPR_MAXIMO).toBe(2);
    expect(limitarDpr(3)).toBe(2);
    expect(limitarDpr(1.5)).toBe(1.5);
    expect(limitarDpr(0)).toBe(1);
    expect(limitarDpr(Number.NaN)).toBe(1);
  });
});
