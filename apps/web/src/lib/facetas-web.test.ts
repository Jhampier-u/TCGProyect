import { describe, it, expect } from 'vitest';
import { CELL_KEYS, FACET_KEYS, FACET_PROFILES, GAME_CODES } from '@tcg/shared';
import { PRESENTACION } from './facetas-web.js';
import { CABECERAS } from './celdas.js';
import { ES } from '../i18n/es.js';

/**
 * F-2, el lado de la web. Los pintores de celda (`components/celdas.tsx`) los
 * cubre TypeScript: son un `Record<CellKey, ...>` y una clave de mas o de menos
 * no compila. Lo que aqui se mira en ejecucion son los DATOS de presentacion.
 */
describe('la web cubre el perfil, ni mas ni menos (F-2)', () => {
  it('cada clave de faceta tiene su presentacion, y no sobra ninguna', () => {
    expect(Object.keys(PRESENTACION).sort()).toEqual([...FACET_KEYS].sort());
  });

  it('cada celda tiene su cabecera, y no sobra ninguna', () => {
    expect(Object.keys(CABECERAS).sort()).toEqual([...CELL_KEYS].sort());
  });

  it('cada valor conocido de una faceta de diccionario tiene su etiqueta', () => {
    const DICCIONARIOS: Record<string, Record<string, string>> = {
      supertype: ES.pokemon.supertipo, type: ES.pokemon.tipo, color: ES.facetas.color,
      kind: ES.facetas.kind, frame: ES.facetas.frame, attribute: ES.facetas.attribute,
    };
    const sinEtiqueta = GAME_CODES.flatMap((g) =>
      FACET_PROFILES[g].facets
        .filter((f) => DICCIONARIOS[f.key] !== undefined)
        .flatMap((f) => f.values.filter((v) => DICCIONARIOS[f.key]![v] === undefined).map((v) => `${g}.${f.key}.${v}`)),
    );
    expect(sinEtiqueta).toEqual([]);
  });

  it('dentro de un juego ningun titulo de seccion se repite: son nombres accesibles', () => {
    for (const g of GAME_CODES) {
      const titulos = [ES.rail.tenencia, ...FACET_PROFILES[g].facets.map((f) => PRESENTACION[f.key].titulo(g)), ES.rail.rareza];
      expect(new Set(titulos).size, g).toBe(titulos.length);
    }
  });

  it('dentro de un juego ningun chip de faceta se lee igual que otro', () => {
    // Un chip dice el valor sin su seccion: "Ficha" como clase y como marco
    // serian dos chips iguales que quitan filtros distintos.
    for (const g of GAME_CODES) {
      const etiquetas = FACET_PROFILES[g].facets.flatMap((f) => f.values.map((v) => PRESENTACION[f.key].etiqueta(v)));
      const repetidas = etiquetas.filter((e, i) => etiquetas.indexOf(e) !== i);
      expect(repetidas, g).toEqual([]);
    }
  });

  it('Pokemon conserva los nombres de seccion de los que depende la suite E2E', () => {
    expect(FACET_PROFILES.PTCG.facets.map((f) => PRESENTACION[f.key].titulo('PTCG')))
      .toEqual([ES.rail.categoria, ES.rail.tipo, ES.rail.marca]);
  });
});
