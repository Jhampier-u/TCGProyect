import { describe, it, expect } from 'vitest';
import {
  SIN_FILTROS, alternar, escribirFiltros, filtrosActivos, leerFiltros, limpiar, quitar,
} from './filtros-url.js';

describe('los filtros del catalogo viven en la URL (T-093)', () => {
  it('ida y vuelta sin perder nada', () => {
    const filtros = { ...SIN_FILTROS, set: 'sv1', type: 'Grass', owned: 'no' as const, q: 'pika' };
    expect(leerFiltros(escribirFiltros(filtros))).toEqual(filtros);
  });

  it('no escribe claves vacias: la URL de "sin filtros" es la URL limpia', () => {
    expect(escribirFiltros(SIN_FILTROS).toString()).toBe('');
    expect(escribirFiltros({ ...SIN_FILTROS, set: 'sv1' }).toString()).toBe('set=sv1');
  });

  it('el orden de las claves es estable, decida lo que decida quien la construye', () => {
    const a = escribirFiltros({ ...SIN_FILTROS, owned: 'no', type: 'Fire', set: 'sv1' }).toString();
    expect(a).toBe('set=sv1&type=Fire&owned=no');
  });

  it('un owned desconocido se descarta en vez de provocar un 400', () => {
    expect(leerFiltros(new URLSearchParams('owned=quizas')).owned).toBe('');
  });

  it('pulsar un filtro puesto lo quita; pulsar otro lo cambia', () => {
    const conPlanta = alternar(SIN_FILTROS, 'type', 'Grass');
    expect(conPlanta.type).toBe('Grass');
    expect(alternar(conPlanta, 'type', 'Grass').type).toBe('');
    expect(alternar(conPlanta, 'type', 'Fire').type).toBe('Fire');
  });

  it('el set es contexto, no un chip', () => {
    const f = { ...SIN_FILTROS, set: 'sv1', type: 'Grass', rarity: 'common' };
    expect(filtrosActivos(f).map((x) => x.clave)).toEqual(['type', 'rarity']);
  });

  it('quitar uno deja los demas; limpiar quita todos menos el set', () => {
    const f = { ...SIN_FILTROS, set: 'sv1', type: 'Grass', rarity: 'common', owned: 'no' as const };
    expect(quitar(f, 'rarity')).toEqual({ ...f, rarity: '' });
    expect(limpiar(f)).toEqual({ ...SIN_FILTROS, set: 'sv1' });
  });
});
