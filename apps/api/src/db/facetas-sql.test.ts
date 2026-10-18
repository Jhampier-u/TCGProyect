import { describe, it, expect } from 'vitest';
import {
  FACET_KEYS, FACET_PROFILES, GAME_CODES, ROW_FIELDS, SIN_VALOR, facetOf, rowFieldsOf,
} from '@tcg/shared';
import { FACET_SQL, NADA, ROW_FIELD_SQL, condicionDeFaceta, repartir } from './facetas-sql.js';

describe('la API cubre el perfil, ni mas ni menos (F-2)', () => {
  it('cada clave de faceta tiene su SQL, y no sobra ninguno', () => {
    expect(Object.keys(FACET_SQL).sort()).toEqual([...FACET_KEYS].sort());
  });

  it('cada dato de fila tiene su columna, y no sobra ninguna', () => {
    expect(Object.keys(ROW_FIELD_SQL).sort()).toEqual([...ROW_FIELDS].sort());
    const pedidos = new Set(GAME_CODES.flatMap((g) => rowFieldsOf(g)));
    expect([...pedidos].sort()).toEqual([...ROW_FIELDS].sort());
  });

  it('toda faceta que admite "sin valor" sabe pedirlo', () => {
    for (const g of GAME_CODES) {
      for (const f of FACET_PROFILES[g].facets.filter((x) => x.allowsNone)) {
        expect(FACET_SQL[f.key].sinValor, `${g}.${f.key}`).toBeDefined();
      }
    }
  });
});

describe('el SQL de cada faceta (H9f)', () => {
  const de = (game: 'MTG' | 'YGO' | 'PTCG', key: string, valor: string) =>
    condicionDeFaceta(facetOf(game, key)!, valor);

  it('un color concreto usa la MISMA expresion que el indice multivaluado', () => {
    const c = de('MTG', 'color', 'U');
    expect(c.sql).toBe("? MEMBER OF (c.game_data->'$.colors')");
    expect(c.params).toEqual(['U']);
  });

  it('incolora excluye los reversos (F-5); multicolor es dos o mas', () => {
    expect(de('MTG', 'color', 'C').sql).toBe("c.color_count = 0 AND c.kind <> 'other'");
    expect(de('MTG', 'color', 'M').sql).toBe('c.color_count >= 2');
  });

  it('un valor que no puede existir da vacio, no error (spec 7)', () => {
    expect(de('MTG', 'color', 'Z')).toEqual(NADA);
    expect(de('MTG', 'cost', 'mucho')).toEqual(NADA);
    expect(de('YGO', 'level', 'cuatro')).toEqual(NADA);
    expect(de('YGO', 'link', 'x')).toEqual(NADA);
    // "sin valor" en una faceta que no lo admite tampoco inventa una condicion.
    expect(de('MTG', 'kind', SIN_VALOR)).toEqual(NADA);
  });

  it('el coste es un tramo semiabierto, el ultimo abierto, y nunca cuenta "otra"', () => {
    const tres = de('MTG', 'cost', '3');
    expect(tres.sql).toBe("c.cmc >= ? AND c.cmc < ? AND c.kind <> 'other'");
    expect(tres.params).toEqual([3, 4]);
    const tope = de('MTG', 'cost', '7+');
    expect(tope.sql).toBe("c.cmc >= ? AND c.kind <> 'other'");
    expect(tope.params).toEqual([7]);
    expect(FACET_SQL.cost.grupo).toContain("c.kind = 'other'");
  });

  it('el nivel aparta los Link, que tambien traen `level` (F-6)', () => {
    const c = de('YGO', 'level', '4');
    expect(c.sql).toBe("c.lvl = ? AND NOT (c.frame <=> 'link')");
    expect(c.params).toEqual([4]);
    // El recuento usa el MISMO predicado que el filtro: si no, el rail y la tabla discreparian.
    expect(FACET_SQL.level.grupo).toContain("c.frame <=> 'link'");
  });

  it('Pokemon: los mismos fragmentos que antes de H9f', () => {
    expect(de('PTCG', 'type', 'Grass').sql).toBe('c.elem_type = ?');
    expect(de('PTCG', 'supertype', 'Trainer').sql).toBe('c.supertype = ?');
    expect(de('PTCG', 'mark', 'I').sql).toBe('c.reg_mark = ?');
    expect(de('PTCG', 'mark', SIN_VALOR)).toEqual({ sql: 'c.reg_mark IS NULL', params: [] });
  });

  it('el reparto del color: una bicolor cuenta en sus dos colores y en multicolor', () => {
    expect(FACET_SQL.color.valores('creature|["U", "B"]')).toEqual(['U', 'B', 'M']);
    expect(FACET_SQL.color.valores('artifact')).toEqual(['C']);
    // Un reverso no es incoloro, pero si trae color cuenta en el (coherente con el filtro).
    expect(FACET_SQL.color.valores('other')).toEqual([]);
    expect(FACET_SQL.color.valores('other|["R"]')).toEqual(['R']);
  });

  it('repartir ordena por el perfil, deja los desconocidos al final y "sin valor" el ultimo', () => {
    const marca = facetOf('PTCG', 'mark')!;
    const r = repartir(
      [
        { valor: 'Z', n: 1, tengo: 0 },
        { valor: null, n: 5, tengo: 2 },
        { valor: 'H', n: 3, tengo: 1 },
        { valor: 'D', n: 2, tengo: 2 },
      ],
      marca,
      true,
    );
    expect(r.map((f) => f.value)).toEqual(['D', 'H', 'Z', SIN_VALOR]);
    expect(r.find((f) => f.value === SIN_VALOR)).toEqual({ value: SIN_VALOR, count: 5, owned: 2 });
  });

  it('repartir acumula cuando varios grupos caen en el mismo valor, y sin sesion no hay tenencia', () => {
    const color = facetOf('MTG', 'color')!;
    const r = repartir(
      [{ valor: 'creature|["U"]', n: 4 }, { valor: 'instant|["U", "R"]', n: 2 }],
      color,
      false,
    );
    expect(r).toEqual([
      { value: 'U', count: 6, owned: null },
      { value: 'R', count: 2, owned: null },
      { value: 'M', count: 2, owned: null },
    ]);
  });
});
