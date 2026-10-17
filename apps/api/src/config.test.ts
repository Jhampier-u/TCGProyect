import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

const MINIMO = {
  DATABASE_URL: 'mysql://u:p@localhost:3306/x',
  JWT_SECRET: 'x'.repeat(48),
  EXTERNAL_USER_AGENT: 'ProyectoTCG/test',
};

describe('FACETAS_CACHE_TTL_SEGUNDOS', () => {
  it('por defecto cinco minutos', () => {
    expect(loadConfig({ ...MINIMO }).facetasCacheTtlMs).toBe(300_000);
    expect(loadConfig({ ...MINIMO, FACETAS_CACHE_TTL_SEGUNDOS: ' ' }).facetasCacheTtlMs).toBe(300_000);
  });

  it('acepta un valor propio, y 0 la desactiva', () => {
    expect(loadConfig({ ...MINIMO, FACETAS_CACHE_TTL_SEGUNDOS: '30' }).facetasCacheTtlMs).toBe(30_000);
    expect(loadConfig({ ...MINIMO, FACETAS_CACHE_TTL_SEGUNDOS: '0' }).facetasCacheTtlMs).toBe(0);
  });

  it('un valor que no es un numero no negativo no arranca', () => {
    expect(() => loadConfig({ ...MINIMO, FACETAS_CACHE_TTL_SEGUNDOS: 'cinco' })).toThrow(/FACETAS_CACHE_TTL_SEGUNDOS/);
    expect(() => loadConfig({ ...MINIMO, FACETAS_CACHE_TTL_SEGUNDOS: '-1' })).toThrow(/FACETAS_CACHE_TTL_SEGUNDOS/);
  });
});
