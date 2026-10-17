import { describe, it, expect } from 'vitest';
import {
  CARGA_MINIMA, FOTOGRAMAS_VENTANA, HUECO_MAXIMO, FOTOGRAMA_LENTO,
  medidorNuevo, registrarFotograma, avanzarParticulas, type Particula,
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

describe('avanzarParticulas', () => {
  const p = (vida: number): Particula => ({ x: 0, y: 0, vx: 2, vy: 0, vida, color: 'c' });

  it('mueve, aplica gravedad y gasta vida', () => {
    const [q] = avanzarParticulas([p(1)], 2);
    expect(q?.x).toBe(4);
    expect(q?.vy).toBeGreaterThan(0);
    expect(q?.vida).toBeLessThan(1);
  });

  it('descarta las que se han apagado', () => {
    expect(avanzarParticulas([p(0.001)], 1)).toHaveLength(0);
  });
});
