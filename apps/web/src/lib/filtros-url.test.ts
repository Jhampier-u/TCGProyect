import { describe, it, expect } from 'vitest';
import {
  SIN_FILTROS, alternar, escribirFiltros, filtrosActivos, leerFiltros, limpiar, quitar, valorDe,
} from './filtros-url.js';

describe('los filtros del catalogo viven en la URL (T-093, por juego desde H9f)', () => {
  it('ida y vuelta sin perder nada', () => {
    const filtros = { ...SIN_FILTROS, set: 'sv1', owned: 'no' as const, q: 'pika', facetas: { type: 'Grass' } };
    expect(leerFiltros(escribirFiltros(filtros, 'PTCG'), 'PTCG')).toEqual(filtros);
  });

  it('no escribe claves vacias: la URL de "sin filtros" es la URL limpia', () => {
    expect(escribirFiltros(SIN_FILTROS, 'PTCG').toString()).toBe('');
    expect(escribirFiltros({ ...SIN_FILTROS, set: 'sv1' }, 'PTCG').toString()).toBe('set=sv1');
  });

  it('el orden de las claves es estable, decida lo que decida quien la construye', () => {
    const a = escribirFiltros(
      { ...SIN_FILTROS, owned: 'no', rarity: 'common', facetas: { type: 'Fire' }, set: 'sv1' },
      'PTCG',
    );
    expect(a.toString()).toBe('set=sv1&type=Fire&rarity=common&owned=no');
  });

  it('Magic escribe sus facetas en el orden de su perfil', () => {
    const f = { ...SIN_FILTROS, facetas: { kind: 'creature', color: 'U' } };
    expect(escribirFiltros(f, 'MTG').toString()).toBe('color=U&kind=creature');
  });

  it('una faceta de otro juego en la URL se ignora en vez de provocar un 400', () => {
    // Un enlace de Magic pegado en el catalogo de Pokemon: la API lo rechazaria
    // y el catalogo se quedaria en blanco por un enlace mal copiado.
    expect(leerFiltros(new URLSearchParams('color=U&type=Grass'), 'PTCG').facetas).toEqual({ type: 'Grass' });
  });

  it('un valor en blanco es un filtro quitado, y lo demas llega recortado', () => {
    const f = leerFiltros(new URLSearchParams('type=%20%20&q=%20pika%20&rarity=%20'), 'PTCG');
    expect(f).toEqual({ ...SIN_FILTROS, q: 'pika' });
    // Lo mismo al construirlo a mano: lo guardado es lo que se escribe.
    expect(alternar(SIN_FILTROS, 'color', '  ').facetas).toEqual({});
    expect(valorDe(alternar(SIN_FILTROS, 'type', ' Fire '), 'type')).toBe('Fire');
  });

  it('un owned desconocido se descarta en vez de provocar un 400', () => {
    expect(leerFiltros(new URLSearchParams('owned=quizas'), 'PTCG').owned).toBe('');
  });

  it('pulsar un filtro puesto lo quita; pulsar otro lo cambia', () => {
    const conPlanta = alternar(SIN_FILTROS, 'type', 'Grass');
    expect(valorDe(conPlanta, 'type')).toBe('Grass');
    expect(valorDe(alternar(conPlanta, 'type', 'Grass'), 'type')).toBe('');
    expect(valorDe(alternar(conPlanta, 'type', 'Fire'), 'type')).toBe('Fire');
  });

  it('el set es contexto, no un chip', () => {
    const f = { ...SIN_FILTROS, set: 'sv1', rarity: 'common', facetas: { type: 'Grass' } };
    expect(filtrosActivos(f, 'PTCG').map((x) => x.clave)).toEqual(['type', 'rarity']);
  });

  it('quitar uno deja los demas; limpiar quita todos menos el set', () => {
    const f = { ...SIN_FILTROS, set: 'sv1', rarity: 'common', owned: 'no' as const, facetas: { type: 'Grass' } };
    expect(quitar(f, 'rarity')).toEqual({ ...f, rarity: '' });
    expect(quitar(f, 'type').facetas).toEqual({});
    expect(limpiar(f)).toEqual({ ...SIN_FILTROS, set: 'sv1' });
  });
});
