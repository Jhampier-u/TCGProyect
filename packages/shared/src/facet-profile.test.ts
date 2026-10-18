import { describe, it, expect } from 'vitest';
import { GAME_CODES } from './game.js';
import {
  CELL_FIELDS, CELL_KEYS, FACET_KEYS, FACET_PROFILES, ROW_FIELDS, SIN_VALOR,
  facetOf, isFacetKey, rowFieldsOf,
} from './facet-profile.js';

describe('el perfil de facetas (H9f, F-1)', () => {
  it('cada clave declarada la usa algun juego, y ningun juego usa una sin declarar', () => {
    const usadas = new Set(GAME_CODES.flatMap((g) => FACET_PROFILES[g].facets.map((f) => f.key)));
    expect([...usadas].sort()).toEqual([...FACET_KEYS].sort());
  });

  it('un juego no repite clave ni celda', () => {
    for (const g of GAME_CODES) {
      const claves = FACET_PROFILES[g].facets.map((f) => f.key);
      expect(new Set(claves).size, g).toBe(claves.length);
      expect(new Set(FACET_PROFILES[g].cells).size, g).toBe(FACET_PROFILES[g].cells.length);
    }
  });

  it('cada celda la usa algun juego, y cada dato de fila lo lee alguna celda', () => {
    const celdas = new Set(GAME_CODES.flatMap((g) => FACET_PROFILES[g].cells));
    expect([...celdas].sort()).toEqual([...CELL_KEYS].sort());
    const datos = new Set(CELL_KEYS.flatMap((c) => CELL_FIELDS[c]));
    expect([...datos].sort()).toEqual([...ROW_FIELDS].sort());
  });

  it('Pokemon conserva sus tres facetas y sus siete celdas; solo la marca admite "sin valor"', () => {
    const p = FACET_PROFILES.PTCG;
    expect(p.facets.map((f) => f.key)).toEqual(['supertype', 'type', 'mark']);
    expect(p.facets.filter((f) => f.allowsNone).map((f) => f.key)).toEqual(['mark']);
    expect(p.cells).toEqual(['number', 'card', 'ptcgType', 'hp', 'rarity', 'mark', 'owned']);
  });

  it('Magic: el color por pertenencia, con incolora y multicolor; el coste en tramos hasta "7+"', () => {
    const color = facetOf('MTG', 'color')!;
    expect(color.mode).toBe('contiene');
    expect(color.values).toEqual(['W', 'U', 'B', 'R', 'G', 'C', 'M']);
    const coste = facetOf('MTG', 'cost')!;
    expect(coste.mode).toBe('tramo');
    expect(coste.values.at(-1)).toBe('7+');
    // F-5: un reverso "Card // Card" es "otra", y "otra" es un valor del tipo.
    expect(facetOf('MTG', 'kind')!.values).toContain('other');
  });

  it('Yu-Gi-Oh!: el link es su propia faceta, y el nivel es un fragmento propio (F-3, F-6)', () => {
    expect(facetOf('YGO', 'link')!.mode).toBe('valor');
    expect(facetOf('YGO', 'level')!.mode).toBe('propio');
    expect(facetOf('YGO', 'frame')!.values).toContain('link');
  });

  it('los datos de una fila salen de las celdas de su juego', () => {
    expect(rowFieldsOf('PTCG')).toEqual(['type', 'hp', 'mark']);
    expect(rowFieldsOf('MTG')).toEqual(['manaCost', 'kind', 'power', 'toughness', 'loyalty']);
    expect(rowFieldsOf('YGO')).toEqual(['kind', 'attribute', 'frame', 'level', 'linkVal', 'race', 'atk', 'def']);
  });

  it('isFacetKey reconoce las claves, y facetOf no inventa una de otro juego', () => {
    expect(isFacetKey('color')).toBe(true);
    expect(isFacetKey('colour')).toBe(false);
    expect(facetOf('PTCG', 'color')).toBeUndefined();
    expect(SIN_VALOR).toBe('ninguna');
  });

  it('fija exactamente claves, modos, celdas y valores de cada juego (en orden)', () => {
    const forma = (g: 'PTCG' | 'MTG' | 'YGO') =>
      FACET_PROFILES[g].facets.map((f) => [f.key, f.mode, f.allowsNone]);
    const vals = (g: 'PTCG' | 'MTG' | 'YGO', k: string) => [...facetOf(g, k)!.values];
    expect(forma('PTCG')).toEqual([['supertype', 'valor', false], ['type', 'valor', false], ['mark', 'valor', true]]);
    expect(forma('MTG')).toEqual([['color', 'contiene', false], ['kind', 'valor', false], ['cost', 'tramo', false]]);
    expect(forma('YGO')).toEqual([
      ['kind', 'valor', false], ['frame', 'valor', false], ['attribute', 'valor', false],
      ['level', 'propio', false], ['link', 'valor', false],
    ]);
    expect([...FACET_PROFILES.PTCG.cells]).toEqual(['number', 'card', 'ptcgType', 'hp', 'rarity', 'mark', 'owned']);
    expect([...FACET_PROFILES.MTG.cells]).toEqual(['manaCost', 'card', 'mtgKind', 'powerToughness', 'rarity', 'owned']);
    expect([...FACET_PROFILES.YGO.cells]).toEqual(['attribute', 'levelRankLink', 'card', 'ygoType', 'atkDef', 'rarity', 'owned']);
    expect(vals('PTCG', 'supertype')).toEqual(['Pok\u00e9mon', 'Trainer', 'Energy']);
    expect(vals('PTCG', 'type')).toEqual(['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless']);
    expect(vals('PTCG', 'mark')).toEqual(['D', 'E', 'F', 'G', 'H', 'I', 'J']);
    expect(vals('MTG', 'color')).toEqual(['W', 'U', 'B', 'R', 'G', 'C', 'M']);
    expect(vals('MTG', 'kind')).toEqual(['creature', 'planeswalker', 'land', 'artifact', 'enchantment', 'instant', 'sorcery', 'battle', 'other']);
    expect(vals('MTG', 'cost')).toEqual(['0', '1', '2', '3', '4', '5', '6', '7+']);
    expect(vals('YGO', 'kind')).toEqual(['monster', 'spell', 'trap', 'skill', 'token']);
    expect(vals('YGO', 'frame')).toEqual(['normal', 'effect', 'ritual', 'fusion', 'synchro', 'xyz', 'pendulum', 'link', 'token']);
    expect(vals('YGO', 'attribute')).toEqual(['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE']);
    expect(vals('YGO', 'link')).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(vals('YGO', 'level')).toEqual(Array.from({ length: 14 }, (_, i) => String(i)));
  });
});
