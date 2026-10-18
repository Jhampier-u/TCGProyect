# Plan de implementación — H9f: perfil de facetas por juego, y los catálogos de Magic y Yu-Gi-Oh!

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Las tareas de documentación del Vault (mapa de `Claude.md`, `001Reportes`, `03_Hitos.md`, bitácora) las hace el controlador, no el implementador: cada tarea dice cuándo.

**Goal:** que Magic y Yu-Gi-Oh! tengan su catálogo «Consulta» —raíl, fila, ficha y portada— sin copiar
el de Pokémon: un perfil declarativo por juego que la API y la web recorren, y Pokémon migrado a él sin
cambiar su comportamiento.

**Architecture:** `@tcg/shared` gana `facet-profile.ts` (sólo datos: claves, modos, valores en orden,
celdas de la fila y qué datos lleva cada celda). La API asocia cada clave con su SQL en
`db/facetas-sql.ts`, con un test de cobertura en los dos sentidos; la migración 0029 añade cinco
columnas generadas y seis índices. La respuesta cambia de forma para los tres juegos: las filas llevan
`facetas: {…}` y `/facets` devuelve `{ facetas: { clave: FacetCount[] }, rarities, total, ownedTotal }`.
La web asocia cada clave con su etiqueta (`lib/facetas-web.ts`) y cada celda con su pintor
(`components/celdas.tsx`); un solo `Catalogo`, un `RailDeSet` y una `FilaDeCarta` recorren el perfil.

**Tech Stack:** TypeScript, React 18, React Router 6, TanStack Query 5, Fastify 5, mysql2, MySQL 8.0.42,
Vitest, Playwright.

> **Spec:** `20_Spec_H9f_FacetasPorJuego.md` · **Sesión:** S038 · **Fecha:** 2026-10-18 ·
> **Tareas:** T-108 a T-115
> Ocho tareas, en este orden. **Se puede parar limpio después de cualquiera**, con una salvedad que
> explica la corrección 9: T-110 y T-111 cambian la forma de la respuesta a los dos lados, y la suite
> E2E se corre al final de T-111.

---

## Lo que corrigió del spec al mirar el código

Todo lo medido aquí lo fue el 2026-10-18 contra la base de desarrollo (`proyecto-tcg-mysql-1`), con
`SELECT` y `EXPLAIN` de sólo lectura.

**1. Una columna generada STORED no puede leer `game_id`.** Los datos de partida proponían guardar
`kind` y `frame` con `game_id`, porque `type_line` es común a los tres juegos. MySQL lo prohíbe:
`cards.game_id` es la base de `fk_cards_game … ON UPDATE CASCADE` (0001), y una clave ajena con
`CASCADE` no admite columnas STORED generadas sobre su columna base. No se ha probado el `ALTER` (la
sesión era de sólo lectura); es la restricción documentada de MySQL 8.0, y el plan no la necesita. **La
guarda es la clave JSON exclusiva de cada juego**, igual que en la 0027: `$.legalities` está en las
38.606 cartas de Magic y en ninguna otra; `$.race`, en las 14.104 de Yu-Gi-Oh! y en ninguna otra.
`color_count` lleva la misma guarda: sin ella valdría 0 —«incolora»— en Pokémon.

**2. «Con índice y sin `filesort`» no es alcanzable tal como lo dice el spec (§8.3), y tampoco lo cumple
Pokémon hoy.** La búsqueda ordena por `c.name, p.id`, dos tablas: ningún índice da ese orden.
`EXPLAIN` de la búsqueda de Pokémon por `elem_type`, hoy: `key = idx_cards_elem_type`,
`Using temporary; Using filesort`. Y los recuentos del raíl recorren `card_prints` entero
(`type = ALL`, 179.017 filas) con o sin columnas generadas: el índice sirve para **filtrar**, no para
contar. El criterio que el plan mide (T-109, T-110): **cada filtro de faceta usa un índice sobre
`cards` (nunca `type = ALL` en `c`)**, y **el raíl de Magic sin set responde por debajo de 400 ms**,
cronometrado. El `filesort` sobre el conjunto ya filtrado se acepta: es el mismo de Pokémon.

**3. El nivel necesita su propio índice, y la base de desarrollo trae uno que el repositorio no tiene.**
`lvl` existe desde la 0001 pero sin índice. La 0029 crea `idx_cards_level (game_id, lvl, name, id)`.
Al mirarlo apareció algo más: **la base de desarrollo tiene aplicadas cinco migraciones que no están en
el repositorio** (`0028_ygo_indice_de_nivel`, `0029_coleccion_real`, `0030_precios`,
`0031_intercalacion_precios`, `0032_entidades_html`, de 2026-08-30 a 2026-09-01), con un
`idx_cards_lvl` de las mismas columnas y las tablas `card_print_prices` y `user_real_collection`. El
migrador registra por nombre de fichero, así que la 0029 de este plan se aplica igual; por eso su índice
**no** se llama `idx_cards_lvl` (chocaría). MySQL avisará de índice duplicado (aviso 1831), que es
inofensivo. Conviene registrarlo como problema (lo hace el controlador en T-115).

**4. Los valores van en inglés, y el color tiene dos valores que no son colores.** El spec dice
`kind <> 'otra'`; en el código es `'other'` (identificadores en inglés). La faceta de color lleva siete
valores: `W U B R G` por pertenencia a la lista (`MEMBER OF`, el índice multivaluado de la 0001), `C`
(incolora: `color_count = 0 AND kind <> 'other'`, F-5) y `M` (multicolor: `color_count >= 2`). Su modo
es `contiene`.

**5. El marco cabe en `valor`; quien necesita `propio` es el nivel.** Con la columna `frame`, el marco de
Yu-Gi-Oh! es una igualdad. El que no cabe en los tres modos simples es el nivel: es `lvl` **excepto en
los Link** (F-6; 110 Link tienen `level`). Su filtro es `c.lvl = ? AND NOT (c.frame <=> 'link')`, modo `propio`.
F-3 sigue ejercitada y es la vía del subtipo de mágicas y trampas cuando llegue.

**6. Lo que lleva la fila no son las facetas.** El spec dice «las filas llevan `facetas: { clave: valor }`»,
pero las celdas necesitan datos que no son faceta (coste en maná, F/R, ATK/DEF, PS, la raza) y hay
facetas que no son un dato de la fila (el tramo de coste, la clase de color). El perfil declara además
**qué datos lee cada celda** (`CELL_FIELDS`), y la fila lleva bajo `facetas` exactamente los datos de
las celdas de su juego. El esquema declara la unión de los tres, y la prueba de P-024 lo compara con
los perfiles.

**7. El total del contexto ya no puede salir de una faceta.** Hoy sale de sumar `supertype`, que es una
partición. En Magic ninguna faceta lo es: el color cuenta dos veces una bicolor y el coste aparta los
reversos. Sale de la rareza, que sí lo es (`rarity_id NOT NULL`): mismas cuatro consultas en Pokémon.

**8. «El juego actual» del menú.** `humo.spec.ts` va de la portada de Pokémon a «Mis mazos» y vuelve por
«Catálogo» esperando `/ptcg/catalogo`. Con «fuera de un juego, a la elección de juego» al pie de la
letra, esa aserción cambiaría, y el criterio 1 del spec prohíbe cambiarla. Se resuelve así: **el juego
de la ruta; si la ruta no es de un juego, el último juego visitado en la sesión; si no ha habido
ninguno, `/`.**

**9. El cambio de forma es atómico entre API y web.** Tras T-110 `npm test` está verde, pero la web que
corre todavía lee `facetas.types`: el catálogo de Pokémon queda roto hasta T-111. La suite E2E se corre
al cerrar T-111, no antes. **T-110 y T-111 se ejecutan seguidas; no desplegar ni empujar a `main`
entre ellas**: hay un entorno de producción.

**10. Orden del raíl de Pokémon.** El spec (§4) manda que el orden salga de los valores conocidos y no
del recuento: los tipos pasan de «más cartas primero» al orden canónico (Planta, Fuego, Agua…), y las
secciones quedan *Tu colección · facetas del perfil · Rareza* (la marca sube por encima de la rareza).
Ninguna prueba E2E depende del orden.

**11. Detalles de datos que el plan absorbe.** «Otra» no son sólo los 2.675 reversos: son 3.320 (planos,
esquemas, Vanguard, emblemas…), y unas catorce tienen `cmc > 0`; la faceta de coste las aparta todas,
coherente con F-5. Una carta queda mal clasificada por el `LIKE`: «Token Artifact — Lander» cuenta como
tierra; se acepta. Y los `external_id` de Yu-Gi-Oh! llevan espacios («THANK YOU PACK»): los enlaces
nuevos usan `encodeURIComponent`.

**12. `SIN_MARCA` pasa a ser `SIN_VALOR`, en `@tcg/shared`, con el mismo valor (`'ninguna'`)**: los
enlaces viejos con `mark=ninguna` siguen funcionando.

**13. Las flechas del link sólo van en la ficha.** El spec (§6) pide «el número con sus flechas para el
link» sin decir dónde. Una rejilla de 3x3 no cabe en una fila densa: **la fila muestra «LINK-n»** (y su
nombre accesible «Link n»), y las flechas se dibujan en la ficha, junto al valor.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `packages/shared/src/facet-profile.ts` | El perfil: claves, modos, valores, celdas, datos de fila. Sólo datos |
| migración 0029 (`db/migrations/`, fichero 0029_facetas_mtg_ygo, up y down) | `kind`, `frame`, `color_count`, `attribute`, `link_val` y seis índices |
| `apps/api/src/db/facetas-sql.ts` | Clave → SQL (filtro, grupo, reparto) y dato de fila → columna |
| `apps/api/src/db/catalog-query-repository.ts` | Búsqueda, ficha y recuentos recorriendo el perfil |
| `apps/api/src/api/schemas.ts` | `facetas` en la fila y en `/facets`; parámetros = unión de claves |
| `apps/api/src/api/server.ts` | 400 para una clave que no es del juego |
| `apps/web/src/lib/filtros-url.ts` | El estado de la URL, por juego |
| `apps/web/src/lib/facetas-web.ts` | Clave → título, etiqueta, estilo y nota |
| `apps/web/src/lib/celdas.ts` | Celda → cabecera y clase |
| `apps/web/src/components/celdas.tsx` | Celda → pintor |
| `apps/web/src/lib/colores-de-juego.ts` | Maná y atributo → token de color |
| `apps/web/src/lib/mana.ts`, `components/Mana.tsx` | `{2}{B}` → símbolos y su lectura |
| `apps/web/src/lib/ygo.ts`, `components/NivelYgo.tsx` | Nivel / rango / link, flechas, «?» |
| `apps/web/src/lib/juegos.ts` | Segmento de ruta de cada juego |
| `apps/web/src/lib/anios.ts`, `pages/PortadaPorAnio.tsx` | La portada por año de salida |
| `e2e/src/catalogos.spec.ts` | Los seis recorridos nuevos |

---

## Levantar el entorno y correr la suite: las dos formas

Cada paso que levanta la aplicación o corre la suite E2E da las dos opciones.

| | Docker | Servidores locales (lo habitual en esta máquina) |
|---|---|---|
| API | `docker compose up -d --build api` → `http://localhost:3000` | `npm run` / vista previa → `http://localhost:3001` |
| Web | `docker compose up -d --build web` → `http://localhost:5173` | Vite → `http://localhost:5173` |
| E2E | `docker compose --profile e2e run --rm --build e2e` | `cd e2e && E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test --reporter=line` |

- **`localhost`, no `127.0.0.1`**: en esta máquina `127.0.0.1:3000` es otra aplicación.
- **Docker:** la imagen web lleva `packages/shared/dist` dentro; tras T-108 (y tras cualquier cambio en
  `@tcg/shared`) hay que reconstruirla con `--build`, igual que la de la API.
- **Local:** tras un cambio en la API o en `@tcg/shared`, recompilar (`npx tsc --build`, o
  `npm run build -w @tcg/api`) y **reiniciar** la API. Vite recoge solo los cambios de `apps/web`, pero
  **hay que reiniciarlo tras un cambio en `packages/shared`**, que llega compilado desde `dist`.

---

## T-108 · El perfil en `@tcg/shared`

**Ficheros**
- Crear: `packages/shared/src/facet-profile.ts`, `packages/shared/src/facet-profile.test.ts`
- Modificar: `packages/shared/src/index.ts`

- [ ] **1. Escribir primero la prueba que falla** (`packages/shared/src/facet-profile.test.ts`):

```ts
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
});
```

- [ ] **2. Ver que falla.** `npx vitest run packages/shared/src/facet-profile` → FAIL con
      `Failed to resolve import "./facet-profile.js"`.

- [ ] **3. Escribir el perfil** (`packages/shared/src/facet-profile.ts`):

```ts
import type { GameCode } from './game.js';

/**
 * El perfil de facetas de cada juego (H9f, F-1).
 *
 * DATOS, NI SQL NI JSX. La API asocia cada clave con su SQL
 * (`apps/api/src/db/facetas-sql.ts`) y la web con su etiqueta y su forma de
 * pintarse (`apps/web/src/lib/facetas-web.ts`, `components/celdas.tsx`). Un test
 * por lado exige que cubran EXACTAMENTE estas claves, en los dos sentidos (F-2):
 * una faceta que falta en un lado rompe `npm test`, no la pantalla.
 *
 * Un juego nuevo es una entrada en `FACET_PROFILES`, no tres ficheros.
 */

/** Las claves que viajan en la URL y en la API, de los tres juegos. */
export const FACET_KEYS = [
  'supertype', 'type', 'mark',
  'color', 'kind', 'cost',
  'frame', 'attribute', 'level', 'link',
] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export function isFacetKey(value: string): value is FacetKey {
  return (FACET_KEYS as readonly string[]).includes(value);
}

/**
 * Como se filtra una faceta:
 *  - `valor`: igualdad sobre una columna;
 *  - `contiene`: pertenencia a una lista JSON, por el indice multivaluado;
 *  - `tramo`: numeros agrupados en tramos, con uno final abierto ("7+");
 *  - `propio`: un fragmento a medida, cuando ninguno de los tres cabe (F-3).
 */
export type FacetMode = 'valor' | 'contiene' | 'tramo' | 'propio';

/**
 * El valor que pide las cartas SIN valor. Hoy solo lo usa la marca de Pokemon:
 * 12.250 cartas anteriores a 2019 no la tienen y nunca la tendran, y pedirlas
 * es tan legitimo como pedir las de la marca I. Antes se llamaba `SIN_MARCA` y
 * vale lo mismo, asi que los enlaces viejos siguen sirviendo.
 */
export const SIN_VALOR = 'ninguna';

export interface FacetDef {
  key: FacetKey;
  mode: FacetMode;
  /** Valores conocidos, EN EL ORDEN DEL RAIL. Uno que no este se pinta al final. */
  values: readonly string[];
  /** Si existe el grupo "sin valor" (`SIN_VALOR`). */
  allowsNone: boolean;
}

export type FacetValues = Partial<Record<FacetKey, string>>;

/**
 * Los datos que una fila del catalogo lleva bajo `facetas`.
 *
 * NO SON LAS FACETAS: el coste en mana, la fuerza o el ATK se pintan pero no se
 * filtran, y el tramo de coste se filtra pero no es un dato de la carta. Una
 * fila lleva exactamente los datos que leen las celdas de su juego.
 */
export const ROW_FIELDS = [
  'type', 'hp', 'mark',
  'manaCost', 'kind', 'power', 'toughness', 'loyalty',
  'attribute', 'frame', 'level', 'linkVal', 'race', 'atk', 'def',
] as const;
export type RowField = (typeof ROW_FIELDS)[number];

/** Si el dato llega como numero o como texto. El esquema de la API sale de aqui. */
export const ROW_FIELD_KIND: Readonly<Record<RowField, 'text' | 'int'>> = {
  type: 'text', hp: 'int', mark: 'text',
  manaCost: 'text', kind: 'text', power: 'text', toughness: 'text', loyalty: 'text',
  attribute: 'text', frame: 'text', level: 'int', linkVal: 'int', race: 'text', atk: 'int', def: 'int',
};

export type RowFacets = Partial<Record<RowField, string | number | null>>;

/** Las celdas que una fila puede tener. La web sabe pintar cada una. */
export const CELL_KEYS = [
  'number', 'card', 'rarity', 'owned',
  'ptcgType', 'hp', 'mark',
  'manaCost', 'mtgKind', 'powerToughness',
  'attribute', 'levelRankLink', 'ygoType', 'atkDef',
] as const;
export type CellKey = (typeof CELL_KEYS)[number];

/** Que datos lee cada celda. Las comunes salen de campos fijos del resumen. */
export const CELL_FIELDS: Readonly<Record<CellKey, readonly RowField[]>> = {
  number: [], card: [], rarity: [], owned: [],
  ptcgType: ['type'], hp: ['hp'], mark: ['mark'],
  manaCost: ['manaCost'], mtgKind: ['kind'], powerToughness: ['power', 'toughness', 'loyalty'],
  attribute: ['attribute'], levelRankLink: ['frame', 'level', 'linkVal'], ygoType: ['race', 'kind'],
  atkDef: ['atk', 'def'],
};

export interface FacetProfile {
  /** Las secciones del rail, en orden. La tenencia y la rareza son de todos y no van aqui. */
  facets: readonly FacetDef[];
  /** Las celdas de la fila, en orden. */
  cells: readonly CellKey[];
}

/** Niveles y rangos que existen: del 0 al 13 (medido el 2026-10-18). */
const NIVELES = Array.from({ length: 14 }, (_, i) => String(i));

export const FACET_PROFILES: Readonly<Record<GameCode, FacetProfile>> = {
  PTCG: {
    facets: [
      // El valor de la base lleva la e acentuada, escrita con su escape: el
      // fuente es ASCII puro (Claude.md).
      { key: 'supertype', mode: 'valor', values: ['Pok\u00e9mon', 'Trainer', 'Energy'], allowsNone: false },
      {
        key: 'type', mode: 'valor', allowsNone: false,
        values: ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless'],
      },
      { key: 'mark', mode: 'valor', values: ['D', 'E', 'F', 'G', 'H', 'I', 'J'], allowsNone: true },
    ],
    cells: ['number', 'card', 'ptcgType', 'hp', 'rarity', 'mark', 'owned'],
  },
  MTG: {
    facets: [
      { key: 'color', mode: 'contiene', values: ['W', 'U', 'B', 'R', 'G', 'C', 'M'], allowsNone: false },
      {
        key: 'kind', mode: 'valor', allowsNone: false,
        values: ['creature', 'planeswalker', 'land', 'artifact', 'enchantment', 'instant', 'sorcery', 'battle', 'other'],
      },
      { key: 'cost', mode: 'tramo', values: ['0', '1', '2', '3', '4', '5', '6', '7+'], allowsNone: false },
    ],
    cells: ['manaCost', 'card', 'mtgKind', 'powerToughness', 'rarity', 'owned'],
  },
  YGO: {
    facets: [
      { key: 'kind', mode: 'valor', values: ['monster', 'spell', 'trap', 'skill', 'token'], allowsNone: false },
      {
        key: 'frame', mode: 'valor', allowsNone: false,
        values: ['normal', 'effect', 'ritual', 'fusion', 'synchro', 'xyz', 'pendulum', 'link', 'token'],
      },
      {
        key: 'attribute', mode: 'valor', allowsNone: false,
        values: ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'],
      },
      { key: 'level', mode: 'propio', values: NIVELES, allowsNone: false },
      { key: 'link', mode: 'valor', values: ['1', '2', '3', '4', '5', '6'], allowsNone: false },
    ],
    cells: ['attribute', 'levelRankLink', 'card', 'ygoType', 'atkDef', 'rarity', 'owned'],
  },
};

/** La definicion de una faceta EN UN JUEGO, o undefined si ese juego no la tiene. */
export function facetOf(game: GameCode, key: string): FacetDef | undefined {
  return FACET_PROFILES[game].facets.find((f) => f.key === key);
}

/** Los datos de fila de un juego, en el orden de `ROW_FIELDS`. */
export function rowFieldsOf(game: GameCode): RowField[] {
  const leidos = new Set(FACET_PROFILES[game].cells.flatMap((c) => CELL_FIELDS[c]));
  return ROW_FIELDS.filter((f) => leidos.has(f));
}
```

- [ ] **4. Exportarlo.** En `packages/shared/src/index.ts`, al final:

```ts
export {
  FACET_KEYS,
  FACET_PROFILES,
  CELL_KEYS,
  CELL_FIELDS,
  ROW_FIELDS,
  ROW_FIELD_KIND,
  SIN_VALOR,
  isFacetKey,
  facetOf,
  rowFieldsOf,
} from './facet-profile.js';
export type {
  FacetKey,
  FacetMode,
  FacetDef,
  FacetProfile,
  FacetValues,
  CellKey,
  RowField,
  RowFacets,
} from './facet-profile.js';
```

- [ ] **5. Ver que pasa.** `npx vitest run packages/shared/src/facet-profile` → 8 passed. Después
      `npx tsc --build` (la API y la web leen `@tcg/shared` desde su `dist`) y `npm test` → verde.

- [ ] **6. Commit:** `feat(shared): per-game facet profile, data only (T-108)`

---

## T-109 · La migración 0029, con `EXPLAIN` medido

**Ficheros**
- Crear: los dos ficheros de la migración 0029 en `db/migrations/` (nombre base 0029_facetas_mtg_ygo,
  sufijos up y down)
- Modificar: `db/README.md`
- Controlador: la línea de la 0029 en el mapa de `Claude.md` (sin ella, `npm test` falla en
  `tools/vault-consistency.test.ts` con `faltan: ['0029_facetas_mtg_ygo']`)

- [ ] **1. La migración** (fichero 0029_facetas_mtg_ygo.up.sql en `db/migrations/`):

```sql
-- =====================================================================
-- ProyectoTCG - Migracion 0029 - Las facetas de Magic y de Yu-Gi-Oh!
-- Agente: Base de Datos - Tarea: T-109 - Sesion: S038
-- =====================================================================
-- QUE FALTA HOY
--
-- El catalogo de Magic se navega por color, tipo y coste, y el de Yu-Gi-Oh!
-- por clase, marco, atributo, nivel y link (spec H9f). El coste (`cmc`) y el
-- nivel (`lvl`) ya son columnas generadas desde la 0001; el color concreto
-- usa el indice multivaluado de la 0001. Lo demas vive en `type_line` o en
-- `game_data`, sin indice.
--
-- MISMO PATRON QUE LA 0027: columnas STORED con su guardian de tipo, e indice
-- (game_id, columna, name, id). Lo que cambia es la guarda.
--
-- LA GUARDA NO ES `game_id`, Y NO PUEDE SERLO
--
-- `type_line` es comun a los tres juegos: sin guarda, una carta de Pokemon
-- "Trainer - Item" tendria tipo de Magic "other". La guarda natural seria
-- `game_id`, pero `cards.game_id` es la base de `fk_cards_game ... ON UPDATE
-- CASCADE`, y MySQL no admite columnas STORED generadas sobre la base de una
-- clave ajena con CASCADE. Se guarda con la clave JSON EXCLUSIVA de cada
-- juego. Medido el 2026-10-18 sobre el catalogo entero:
--
--   clave            MTG       YGO      PTCG
--   legalities    38.606         0         0     (de 38.606 de Magic)
--   race               0    14.104         0     (de 14.104 de Yu-Gi-Oh!)
--
-- Cero colisiones y cobertura completa. `color_count` lleva la misma guarda:
-- sin ella valdria 0 -- "incolora" -- en Yu-Gi-Oh! y en Pokemon.
--
-- `kind` (MAGIC): EL TIPO PRINCIPAL DE LA PRIMERA CARA
--
-- Lo que va antes de ' // ', por prioridad: criatura > planeswalker > tierra >
-- artefacto > encantamiento > instantaneo > conjuro > batalla > otra. Medido:
-- creature 20.002, instant 3.872, sorcery 3.645, enchantment 3.583,
-- other 3.320, artifact 2.623, land 1.190, planeswalker 332, battle 39.
--
-- "other" incluye los 2.274 reversos "Card // Card" y los 401 "Card" de
-- Scryfall (sin tipos, sin colores, coste 0), y los planos, esquemas y
-- Vanguard. La faceta de coste las aparta y no cuentan como incoloras (F-5).
-- Una carta queda mal: "Token Artifact - Lander" casa con '%Land%'. Se acepta.
--
-- `kind` (YU-GI-OH!) Y `frame`
--
-- La clase: skill 123, token 19, monster 9.098, spell 2.812, trap 2.052.
-- "Skill" va primero por prefijo: su type_line lleva el nombre de un
-- personaje detras ("Skill - Kaiba"). El marco, solo de monstruos y fichas,
-- por prioridad: link > xyz > synchro > fusion > ritual > pendulum > effect >
-- normal. Medido: effect 5.873, xyz 596, fusion 578, normal 551,
-- synchro 531, link 468, pendulum 352, ritual 149, token 19.
--
-- `attribute` y `link_val` siguen el patron de la 0027 sin guarda extra: sus
-- claves solo existen en Yu-Gi-Oh! (0 colisiones medidas).
--
-- EL NIVEL USA `lvl`, QUE NO TENIA INDICE. Se llama `idx_cards_level` y no
-- `idx_cards_lvl` a proposito: la base de desarrollo trae un `idx_cards_lvl`
-- de una migracion que no esta en el repositorio, y el nombre chocaria. Si
-- existe, MySQL avisa de indice duplicado (1831) y sigue.
--
-- COSTE. STORED reescribe `cards` (73.144 filas). Se mide al aplicar.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

ALTER TABLE cards
  ADD COLUMN kind VARCHAR(16) GENERATED ALWAYS AS (
    CASE
      WHEN JSON_CONTAINS_PATH(game_data, 'one', '$.legalities') THEN
        CASE
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Creature%' THEN 'creature'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Planeswalker%' THEN 'planeswalker'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Land%' THEN 'land'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Artifact%' THEN 'artifact'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Enchantment%' THEN 'enchantment'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Instant%' THEN 'instant'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Sorcery%' THEN 'sorcery'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Battle%' THEN 'battle'
          ELSE 'other'
        END
      WHEN JSON_CONTAINS_PATH(game_data, 'one', '$.race') THEN
        CASE
          WHEN type_line LIKE 'Skill%' THEN 'skill'
          WHEN type_line = 'Token' THEN 'token'
          WHEN type_line LIKE '%Monster%' THEN 'monster'
          WHEN type_line LIKE '%Spell%' THEN 'spell'
          WHEN type_line LIKE '%Trap%' THEN 'trap'
        END
    END) STORED,

  ADD COLUMN frame VARCHAR(16) GENERATED ALWAYS AS (
    CASE WHEN JSON_CONTAINS_PATH(game_data, 'one', '$.race') THEN
      CASE
        WHEN type_line = 'Token' THEN 'token'
        WHEN type_line NOT LIKE '%Monster%' THEN NULL
        WHEN type_line LIKE '%Link%' THEN 'link'
        WHEN type_line LIKE '%Xyz%' THEN 'xyz'
        WHEN type_line LIKE '%Synchro%' THEN 'synchro'
        WHEN type_line LIKE '%Fusion%' THEN 'fusion'
        WHEN type_line LIKE '%Ritual%' THEN 'ritual'
        WHEN type_line LIKE '%Pendulum%' THEN 'pendulum'
        WHEN type_line LIKE '%Effect%' THEN 'effect'
        ELSE 'normal'
      END
    END) STORED,

  ADD COLUMN color_count TINYINT UNSIGNED GENERATED ALWAYS AS (
    CASE
      WHEN NOT JSON_CONTAINS_PATH(game_data, 'one', '$.legalities') THEN NULL
      WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.colors')) = 'ARRAY'
        THEN JSON_LENGTH(JSON_EXTRACT(game_data, '$.colors'))
      ELSE 0
    END) STORED,

  ADD COLUMN attribute VARCHAR(8) GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.attribute')) = 'STRING'
         THEN JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.attribute')) END) STORED,

  ADD COLUMN link_val TINYINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.link_val')) IN ('INTEGER','DOUBLE','DECIMAL')
         THEN CAST(JSON_EXTRACT(game_data, '$.link_val') AS UNSIGNED) END) STORED;

CREATE INDEX idx_cards_kind        ON cards (game_id, kind, name, id);
CREATE INDEX idx_cards_frame       ON cards (game_id, frame, name, id);
CREATE INDEX idx_cards_color_count ON cards (game_id, color_count, name, id);
CREATE INDEX idx_cards_attribute   ON cards (game_id, attribute, name, id);
CREATE INDEX idx_cards_link_val    ON cards (game_id, link_val, name, id);
CREATE INDEX idx_cards_level       ON cards (game_id, lvl, name, id);
```

- [ ] **2. El rollback** (fichero 0029_facetas_mtg_ygo.down.sql):

```sql
-- =====================================================================
-- ProyectoTCG - Migracion 0029 - ROLLBACK
-- =====================================================================
-- No se pierde ningun dato: las cinco columnas son generadas y se recalculan
-- enteras desde `type_line` y `game_data` al volver a aplicar. Los filtros de
-- Magic y Yu-Gi-Oh! vuelven a escanear. Primero los indices, despues las
-- columnas: MySQL rechaza borrar una columna que un indice aun usa.
-- `idx_cards_level` no toca ninguna columna nueva, pero se va con la migracion
-- que lo creo.
-- =====================================================================

DROP INDEX idx_cards_level       ON cards;
DROP INDEX idx_cards_link_val    ON cards;
DROP INDEX idx_cards_attribute   ON cards;
DROP INDEX idx_cards_color_count ON cards;
DROP INDEX idx_cards_frame       ON cards;
DROP INDEX idx_cards_kind        ON cards;

ALTER TABLE cards
  DROP COLUMN link_val,
  DROP COLUMN attribute,
  DROP COLUMN color_count,
  DROP COLUMN frame,
  DROP COLUMN kind;
```

- [ ] **3. Aplicarla** y comprobar que quedó registrada. Dos formas, según cómo se tenga el entorno:

```bash
# Con Docker: el contenedor de la API migra al arrancar.
docker compose up -d --build api

# Con servidores locales (lo habitual en esta máquina): el migrador a mano, contra
# la MySQL del contenedor (DATABASE_URL de .env, puerto 3307).
npx tsc --build && npm run db:migrate

# En los dos casos:
docker exec proyecto-tcg-mysql-1 mysql -N -utcg -pcambiame proyecto_tcg -e "SELECT name FROM schema_migrations WHERE name LIKE '0029_facetas%'"
```

      Esperado: el nombre del fichero up de la 0029 (0029_facetas_mtg_ygo.up.sql). Apuntar en la
      bitácora cuánto tardó el `ALTER` (con Docker, `docker compose logs api | grep 0029`; en local,
      la salida de `db:migrate`).

- [ ] **4. Los valores, contra lo medido al escribir el plan:**

```bash
docker exec proyecto-tcg-mysql-1 mysql -utcg -pcambiame proyecto_tcg -e "
SELECT game_id, kind, frame, COUNT(*) FROM cards GROUP BY game_id, kind, frame ORDER BY game_id, kind, frame;
SELECT game_id, color_count, COUNT(*) FROM cards GROUP BY game_id, color_count ORDER BY game_id, color_count;
SELECT attribute, COUNT(*) FROM cards WHERE game_id = 2 GROUP BY attribute;
SELECT link_val, COUNT(*) FROM cards WHERE game_id = 2 GROUP BY link_val;"
```

      Esperado: Magic `artifact 2623 · battle 39 · creature 20002 · enchantment 3583 · instant 3872 ·
      land 1190 · other 3320 · planeswalker 332 · sorcery 3645`, todas con `frame` NULL. Yu-Gi-Oh!
      `monster` repartido en `effect 5873 · fusion 578 · link 468 · normal 551 · pendulum 352 ·
      ritual 149 · synchro 531 · xyz 596`, `skill 123`, `spell 2812`, `trap 2052`, `token/token 19`.
      Pokémon: una sola fila `NULL NULL 20434`. `color_count` de Magic: `0 7769 · 1 25922 · 2 4053 ·
      3 758 · 4 21 · 5 83`; NULL en los otros dos juegos. Atributos: `DARK 2601 · EARTH 2013 ·
      LIGHT 1924 · WATER 895 · WIND 845 · FIRE 811 · DIVINE 9 · NULL 5006`. Link: `1 63 · 2 220 ·
      3 110 · 4 59 · 5 14 · 6 2 · NULL 13636`.

- [ ] **5. `EXPLAIN` de cada filtro nuevo**, con la forma exacta de la búsqueda:

```bash
for cond in \
  "c.game_id = 1 AND c.kind = 'creature'" \
  "c.game_id = 2 AND c.kind = 'spell'" \
  "c.game_id = 1 AND c.color_count >= 2" \
  "c.game_id = 1 AND 'U' MEMBER OF (c.game_data->'\$.colors')" \
  "c.game_id = 1 AND c.color_count = 0 AND c.kind <> 'other'" \
  "c.game_id = 1 AND c.cmc >= 3 AND c.cmc < 4 AND c.kind <> 'other'" \
  "c.game_id = 2 AND c.frame = 'xyz'" \
  "c.game_id = 2 AND c.attribute = 'DARK'" \
  "c.game_id = 2 AND c.lvl = 4 AND NOT (c.frame <=> 'link')" \
  "c.game_id = 2 AND c.link_val = 2"; do
  docker exec proyecto-tcg-mysql-1 mysql -utcg -pcambiame proyecto_tcg -e "EXPLAIN SELECT c.id FROM cards c JOIN card_prints p ON p.card_id = c.id AND p.withdrawn_at IS NULL JOIN sets s ON s.id = p.set_id JOIN rarities r ON r.id = p.rarity_id WHERE $cond ORDER BY c.name ASC, p.id ASC LIMIT 61"
done
```

      Esperado, en la fila de `c`: para los filtros selectivos (`MEMBER OF`, `attribute`, `frame`,
      `link_val`, `lvl`, `color_count = 0`, `color_count >= 2`) `key` debe ser su propio índice
      (`idx_cards_mtg_colors`, `idx_cards_attribute`, `idx_cards_frame`, `idx_cards_link_val`,
      `idx_cards_level` o el `idx_cards_lvl` ajeno de la base de desarrollo, `idx_cards_color_count`).
      Para los poco selectivos (`kind = 'creature'`, `kind = 'spell'`, tramos de coste) se acepta
      `uq_cards_game_oracle` o `idx_cards_game_name`: recorren el juego por `game_id`, y la garantía de
      rendimiento es el cronometrado de T-110 paso 13. En ningún caso `type = ALL`. En `Extra` saldrá
      `Using temporary; Using filesort`: es el orden de dos tablas, el mismo que tiene hoy la búsqueda
      de Pokémon por `elem_type` (corrección 2). Apuntar la `key` de cada uno en la bitácora.

- [ ] **6. Rollback a mano**, como con la 0027 y la 0028:

```bash
docker exec -i proyecto-tcg-mysql-1 mysql -utcg -pcambiame proyecto_tcg < db/migrations/0029_facetas_mtg_ygo.down.sql
docker exec proyecto-tcg-mysql-1 mysql -N -utcg -pcambiame proyecto_tcg -e "SHOW COLUMNS FROM cards LIKE 'kind'"
docker exec -i proyecto-tcg-mysql-1 mysql -utcg -pcambiame proyecto_tcg < db/migrations/0029_facetas_mtg_ygo.up.sql
```

      Esperado: la segunda orden no imprime nada; tras la tercera, el paso 4 da lo mismo.

- [ ] **7. `db/README.md`.** Debajo de la fila de `0028_set_palette`:

```markdown
| `0029_facetas_mtg_ygo` | Columnas generadas e índices para las facetas de Magic y Yu-Gi-Oh! (`kind`, `frame`, `color_count`, `attribute`, `link_val`) y el índice del nivel (T-109) | ✅ rollback ejecutado y reaplicado |
```

      Y en «Generadas expuestas», añadir `kind`, `color_count` (MTG) · `kind`, `frame`, `attribute`,
      `link_val` (YGO).

- [ ] **8. Ver que pasa.** Con la línea del mapa ya puesta por el controlador: `npm test` → verde.

- [ ] **9. Commit:** `feat(db): generated columns and indexes for the Magic and Yu-Gi-Oh! facets (T-109)`

---

## T-110 · La API al perfil, con Pokémon migrado, la cobertura y el 400

> **T-110 y T-111 se ejecutan seguidas; no desplegar ni empujar a `main` entre ellas** (hay un entorno
> de producción). La forma de la respuesta cambia a los dos lados a la vez (corrección 9).

**Ficheros**
- Crear: `apps/api/src/db/facetas-sql.ts`, `apps/api/src/db/facetas-sql.test.ts`
- Modificar: `apps/api/src/db/catalog-query-repository.ts`, `apps/api/src/db/facetas.test.ts`,
  `apps/api/src/api/schemas.ts`, `apps/api/src/api/server.ts`, `apps/api/src/api/server.test.ts`,
  `apps/api/src/api/catalogo-con-sesion.test.ts`

- [ ] **1. Escribir primero la prueba de cobertura** (`apps/api/src/db/facetas-sql.test.ts`):

```ts
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
```

- [ ] **2. Ver que falla.** `npx vitest run apps/api/src/db/facetas-sql` → FAIL con
      `Failed to resolve import "./facetas-sql.js"`.

- [ ] **3. Escribir el módulo** (`apps/api/src/db/facetas-sql.ts`):

```ts
import type { FacetDef, FacetKey, RowField } from '@tcg/shared';
import { ROW_FIELDS, SIN_VALOR } from '@tcg/shared';

/**
 * Cada clave del perfil, en SQL (H9f, F-2).
 *
 * El perfil (`@tcg/shared`) dice QUE facetas tiene cada juego; esto dice COMO se
 * filtran y como se cuentan. `facetas-sql.test.ts` exige que las dos listas
 * coincidan en los dos sentidos.
 *
 * Todos los fragmentos son literales de este fichero. Lo unico que viene de
 * fuera es el VALOR, y siempre va como parametro.
 */

/** Una condicion de WHERE con sus parametros, en el orden de sus `?`. */
export interface Condicion {
  sql: string;
  params: unknown[];
}

/**
 * La condicion que no casa con nada. Un valor desconocido de una faceta conocida
 * da un resultado vacio, no un error: puede ser legitimo y no estar aun en la
 * lista (spec 7).
 */
export const NADA: Condicion = { sql: '1 = 0', params: [] };

export interface FacetSql {
  /** La condicion de WHERE para un valor. */
  filtro: (valor: string) => Condicion;
  /** La de "sin valor", solo en las facetas que la admiten. */
  sinValor?: string;
  /** La expresion por la que se agrupa al contar. NULL es "sin valor". */
  grupo: string;
  /**
   * De la clave de un grupo a los valores de faceta en que cuenta: ninguno, uno
   * o varios. Varios es el color: una carta azul y negra cuenta en los dos y
   * en multicolor.
   */
  valores: (crudo: string) => string[];
}

const NUMERO = /^\d+$/;

function porColumna(columna: string, opciones: { numerica?: boolean; sinValor?: boolean } = {}): FacetSql {
  return {
    filtro: (valor) => {
      if (opciones.numerica && !NUMERO.test(valor)) return NADA;
      return { sql: `${columna} = ?`, params: [opciones.numerica ? Number(valor) : valor] };
    },
    ...(opciones.sinValor ? { sinValor: `${columna} IS NULL` } : {}),
    grupo: columna,
    valores: (crudo) => [crudo],
  };
}

const COLORES = ['W', 'U', 'B', 'R', 'G'];

const color: FacetSql = {
  filtro: (valor) => {
    // LA MISMA EXPRESION QUE EL INDICE MULTIVALUADO de la 0001
    // (`CAST(game_data->'$.colors' AS CHAR(2) ARRAY)`): con otra forma MySQL no
    // lo reconoce y recorre Magic entero. Comprobado con EXPLAIN en T-109.
    if (COLORES.includes(valor)) return { sql: "? MEMBER OF (c.game_data->'$.colors')", params: [valor] };
    // Incolora es "sin colores Y no es un reverso" (F-5): las 2.675 "Card //
    // Card" no traen colores, y contarlas aqui triplicaria la seccion.
    if (valor === 'C') return { sql: "c.color_count = 0 AND c.kind <> 'other'", params: [] };
    if (valor === 'M') return { sql: 'c.color_count >= 2', params: [] };
    return NADA;
  },
  // Se agrupa por tipo y lista de colores a la vez: unas cien combinaciones,
  // y de cada una salen los valores en que cuenta. Una sola pasada.
  grupo: "CONCAT_WS('|', c.kind, CAST(JSON_EXTRACT(c.game_data, '$.colors') AS CHAR))",
  valores: (crudo) => {
    const corte = crudo.indexOf('|');
    const kind = corte < 0 ? crudo : crudo.slice(0, corte);
    const lista = corte < 0 ? [] : (JSON.parse(crudo.slice(corte + 1)) as string[]);
    const fuera = lista.filter((c) => COLORES.includes(c));
    if (lista.length === 0 && kind !== 'other') fuera.push('C');
    if (lista.length >= 2) fuera.push('M');
    return fuera;
  },
};

/** El tramo final, abierto: "7+". Recoge la carta de broma de coste 1.000.000. */
const TOPE_DE_COSTE = 7;

const cost: FacetSql = {
  filtro: (valor) => {
    // Los reversos tienen coste 0 y no es un coste: la faceta los aparta (F-5).
    // Por eso la suma de los tramos es menor que el total, y el rail lo dice.
    if (valor === `${TOPE_DE_COSTE}+`) {
      return { sql: "c.cmc >= ? AND c.kind <> 'other'", params: [TOPE_DE_COSTE] };
    }
    if (!NUMERO.test(valor) || Number(valor) >= TOPE_DE_COSTE) return NADA;
    const n = Number(valor);
    // Semiabierto: los costes de 0,5 de los Un-sets caen en el tramo 0.
    return { sql: "c.cmc >= ? AND c.cmc < ? AND c.kind <> 'other'", params: [n, n + 1] };
  },
  grupo:
    `CASE WHEN c.kind = 'other' OR c.cmc IS NULL THEN NULL ` +
    `WHEN c.cmc >= ${TOPE_DE_COSTE} THEN '${TOPE_DE_COSTE}+' ` +
    `ELSE CAST(FLOOR(c.cmc) AS CHAR) END`,
  valores: (crudo) => [crudo],
};

const level: FacetSql = {
  // F-6: 110 monstruos Link traen `level` ademas de `link_val`. Sin apartarlos
  // saldrian en "nivel 4" sin serlo. Es el modo `propio` (F-3).
  filtro: (valor) =>
    NUMERO.test(valor) ? { sql: "c.lvl = ? AND NOT (c.frame <=> 'link')", params: [Number(valor)] } : NADA,
  grupo: "CASE WHEN c.frame <=> 'link' THEN NULL ELSE c.lvl END",
  valores: (crudo) => [crudo],
};

export const FACET_SQL: Readonly<Record<FacetKey, FacetSql>> = {
  // Pokemon: las columnas de la 0027, con los mismos fragmentos que antes.
  supertype: porColumna('c.supertype'),
  type: porColumna('c.elem_type'),
  mark: porColumna('c.reg_mark', { sinValor: true }),
  // Magic y Yu-Gi-Oh!: las de la 0029, mas `cmc` y `lvl` de la 0001.
  color,
  kind: porColumna('c.kind'),
  cost,
  frame: porColumna('c.frame'),
  attribute: porColumna('c.attribute'),
  level,
  link: porColumna('c.link_val', { numerica: true }),
};

/** La condicion de una faceta del perfil para un valor, "sin valor" incluido. */
export function condicionDeFaceta(def: FacetDef, valor: string): Condicion {
  const sql = FACET_SQL[def.key];
  if (valor === SIN_VALOR) {
    return def.allowsNone && sql.sinValor ? { sql: sql.sinValor, params: [] } : NADA;
  }
  return sql.filtro(valor);
}

const deJson = (ruta: string) => `JSON_UNQUOTE(JSON_EXTRACT(c.game_data, '$.${ruta}'))`;

/** De donde sale cada dato de fila. */
export const ROW_FIELD_SQL: Readonly<Record<RowField, string>> = {
  type: 'c.elem_type',
  hp: 'c.hp',
  mark: 'c.reg_mark',
  manaCost: deJson('mana_cost'),
  kind: 'c.kind',
  power: deJson('power'),
  toughness: deJson('toughness'),
  loyalty: deJson('loyalty'),
  attribute: 'c.attribute',
  frame: 'c.frame',
  level: 'c.lvl',
  linkVal: 'c.link_val',
  race: deJson('race'),
  atk: 'c.atk',
  def: 'c.def',
};

/**
 * Las columnas de fila con su alias `ff_<dato>`, UNA SOLA LISTA para la busqueda
 * y para la ficha. Cada consulta tenia la suya y por eso la ficha devolvio un
 * 500 en T-092: se anadieron las facetas a una y no a la otra.
 */
export const COLUMNAS_DE_FILA = ROW_FIELDS.map((f) => `${ROW_FIELD_SQL[f]} AS ff_${f}`).join(',\n              ');

/** Un valor de faceta y cuantas cartas lo tienen, para el rail (T-092). */
export interface FacetCount {
  value: string;
  count: number;
  /** Cuantas de esas tiene el usuario. `null` sin sesion: no es un cero. */
  owned: number | null;
}

/** Una fila cruda del GROUP BY. `SUM` llega como cadena DECIMAL por mysql2. */
export interface FilaDeRecuento {
  valor: string | number | null;
  n: number | string;
  tengo?: number | string | null;
}

/**
 * De los grupos crudos a la lista del rail: reparte, acumula y ordena.
 *
 * EL ORDEN SALE DEL PERFIL, NO DEL RECUENTO: que las filas del rail no bailen
 * al cambiar de set. Un valor que el perfil no conoce se pinta igual, detras y
 * por orden alfabetico; "sin valor", el ultimo.
 */
export function repartir(filas: readonly FilaDeRecuento[], def: FacetDef, conTenencia: boolean): FacetCount[] {
  const acumulado = new Map<string, { count: number; owned: number }>();
  for (const f of filas) {
    const valores =
      f.valor === null ? (def.allowsNone ? [SIN_VALOR] : []) : FACET_SQL[def.key].valores(String(f.valor));
    for (const v of valores) {
      const previo = acumulado.get(v) ?? { count: 0, owned: 0 };
      acumulado.set(v, { count: previo.count + Number(f.n), owned: previo.owned + Number(f.tengo ?? 0) });
    }
  }
  const rango = (v: string): number => {
    if (v === SIN_VALOR) return Number.MAX_SAFE_INTEGER;
    const i = def.values.indexOf(v);
    return i < 0 ? def.values.length : i;
  };
  return [...acumulado.entries()]
    .sort(([a], [b]) => rango(a) - rango(b) || a.localeCompare(b))
    .map(([value, x]) => ({ value, count: x.count, owned: conTenencia ? x.owned : null }));
}
```

- [ ] **4. Ver que pasa.** `npx vitest run apps/api/src/db/facetas-sql` → 12 passed.

- [ ] **5. Las pruebas del repositorio, con la forma nueva** (`apps/api/src/db/facetas.test.ts`). Cambian
      la forma, no lo que comprueban (criterio 1 del spec):

      - Las importaciones:

```ts
// antes
import {
  CatalogQueryRepository, SIN_MARCA, encodeCursor, toSummary, type CardQuery,
} from './catalog-query-repository.js';
import type { Database } from './connection.js';
// despues
import { SIN_VALOR } from '@tcg/shared';
import {
  CatalogQueryRepository, encodeCursor, toSummary, type CardQuery,
} from './catalog-query-repository.js';
import type { Database } from './connection.js';
import { ROW_FIELD_SQL } from './facetas-sql.js';
```

      - Las facetas de la consulta pasan a ir bajo `facetas`. Sustituir, en este orden:
        `{ game: 'PTCG', type: 'Grass' }` → `{ game: 'PTCG', facetas: { type: 'Grass' } }`;
        `{ game: 'PTCG', supertype: 'Trainer', mark: 'I' }` →
        `{ game: 'PTCG', facetas: { supertype: 'Trainer', mark: 'I' } }`;
        `{ game: 'PTCG', mark: SIN_MARCA }` → `{ game: 'PTCG', facetas: { mark: SIN_VALOR } }` y
        `expect(params).not.toContain(SIN_MARCA)` → `expect(params).not.toContain(SIN_VALOR)`;
        `{ game: 'PTCG', set: 'BLK', rarity: 'common', type: 'Fire' }` →
        `{ game: 'PTCG', set: 'BLK', rarity: 'common', facetas: { type: 'Fire' } }`;
        y las tres de `type: 'Water'` → `facetas: { type: 'Water' }`.

      - Las columnas de la fila:

```ts
// antes
  const COLUMNAS = ['c.hp', 'c.supertype', 'c.elem_type', 'c.reg_mark'];
// despues
  // Desde H9f salen de una sola lista (`COLUMNAS_DE_FILA`); la prueba sigue
  // mirando las dos consultas, que es donde se rompio.
  const COLUMNAS = Object.values(ROW_FIELD_SQL);
```

      - La fila de la prueba de tenencia:

```ts
// antes
      image_local_path: null, rarity: 'common', hp: 70, supertype: 'Pokemon',
      elem_type: 'Grass', reg_mark: 'G',
// despues
      image_local_path: null, rarity: 'common', ff_type: 'Grass', ff_hp: 70, ff_mark: 'G',
```

      - La prueba del total, que ya no puede salir de la categoría (corrección 7). Sustituir el `it`
        entero «el total del contexto sale de sumar las categorias, incluida la nula» por:

```ts
  it('el total del contexto sale de sumar las rarezas: es la unica particion que queda', async () => {
    // Antes salia de la categoria de Pokemon. En Magic ninguna faceta es una
    // particion -- una bicolor cuenta dos veces, el coste aparta los reversos --
    // y la rareza si: toda impresion tiene exactamente una (`rarity_id NOT NULL`).
    // Asi no hace falta una consulta mas.
    const db = {
      select: async (sql: string) =>
        sql.includes('r.code')
          ? [
              { valor: 'common', n: 120, tengo: 30 },
              { valor: 'rare', n: 42, tengo: 6 },
            ]
          : sql.includes('c.supertype AS valor')
            ? [
                { valor: 'Trainer', n: 40, tengo: 5 },
                { valor: 'Pok\u00e9mon', n: 120, tengo: 30 },
                { valor: null, n: 2, tengo: 1 },
              ]
            : [],
    } as unknown as Database;
    const r = await new CatalogQueryRepository(db).listFacets('PTCG', 'sv1', 7);
    expect(r.total).toBe(162);
    expect(r.ownedTotal).toBe(36);
    // El orden es el del perfil, no el de la consulta; y un NULL en una faceta
    // sin "sin valor" no se pinta.
    expect(r.facetas.supertype).toEqual([
      { value: 'Pok\u00e9mon', count: 120, owned: 30 },
      { value: 'Trainer', count: 40, owned: 5 },
    ]);
  });
```

      - Y al final del fichero, lo nuevo de Magic y Yu-Gi-Oh!:

```ts
describe('Magic y Yu-Gi-Oh! en la busqueda y en el rail (H9f)', () => {
  it('el color concreto va por el indice multivaluado, con el valor como parametro', async () => {
    const { sql, params } = await sqlDe({ game: 'MTG', facetas: { color: 'U', kind: 'creature' } });
    expect(sql).toContain("? MEMBER OF (c.game_data->'$.colors')");
    expect(sql).toContain('c.kind = ?');
    expect(params).toEqual(expect.arrayContaining(['U', 'creature']));
    expect(sql).toContain('ORDER BY c.name ASC, p.id ASC');
  });

  it('una clave que no es del juego no se convierte en condicion: se rechaza', async () => {
    const { repo } = repoEspia();
    await expect(repo.searchCards({ game: 'PTCG', facetas: { color: 'U' } })).rejects.toThrow('color');
  });

  it('el rail cuenta la rareza y cada faceta del perfil: cuatro consultas en Magic, seis en Yu-Gi-Oh!', async () => {
    const mtg = repoEspia();
    await mtg.repo.listFacets('MTG');
    expect(mtg.consultas).toHaveLength(4);
    const ygo = repoEspia();
    await ygo.repo.listFacets('YGO', 'LOB');
    expect(ygo.consultas).toHaveLength(6);
    for (const c of ygo.consultas) expect(c.sql).toContain('s.external_id = ?');
  });

  it('una fila de Magic lleva sus datos y no los de Pokemon', () => {
    const fila = {
      id: 1, oracle_key: 'o', game_id: 1, name: 'Llanowar Elves', type_line: 'Creature - Elf Druid',
      set_code: 'DOM', set_name: 'Dominaria', print_id: 9, collector_number: '168',
      image_local_path: null, rarity: 'common',
      ff_manaCost: '{G}', ff_kind: 'creature', ff_power: '1', ff_toughness: '1', ff_hp: 70,
    };
    expect(toSummary(fila).facetas).toEqual({
      manaCost: '{G}', kind: 'creature', power: '1', toughness: '1', loyalty: null,
    });
  });
});
```

- [ ] **6. Ver que falla.** `npx vitest run apps/api/src/db/facetas` → FAIL: `facetas` no existe en
      `CardQuery`, `r.facetas` es `undefined`, la clave ajena no lanza.

- [ ] **7. El repositorio** (`apps/api/src/db/catalog-query-repository.ts`). Bloque a bloque:

      - Importaciones (líneas 1-2):

```ts
// antes
import type { GameCode } from '@tcg/shared';
import { GAME_IDS, isGameCode } from '@tcg/shared';
// despues
import type { FacetKey, FacetValues, GameCode, RowFacets, RowField } from '@tcg/shared';
import { FACET_PROFILES, GAME_IDS, ROW_FIELD_KIND, facetOf, isGameCode, rowFieldsOf } from '@tcg/shared';
import {
  COLUMNAS_DE_FILA, FACET_SQL, condicionDeFaceta, repartir, type FacetCount, type FilaDeRecuento,
} from './facetas-sql.js';
```

      - Borrar la constante `SIN_MARCA` y su comentario (líneas 17-24): vive en `@tcg/shared` como
        `SIN_VALOR`.

      - En `CardSummary`, sustituir el comentario y los cuatro campos `hp`, `supertype`, `elemType`,
        `regMark` (líneas 65-77) por:

```ts
  /**
   * Los datos que pintan las celdas de la fila de SU juego (H9f): PS, tipo y
   * marca en Pokemon; coste, tipo y F/R en Magic; atributo, nivel, ATK/DEF en
   * Yu-Gi-Oh!. Salen del perfil (`rowFieldsOf`), y el esquema de la API declara
   * la union de los tres: la prueba de P-024 compara las dos cosas.
   */
  facetas: RowFacets;
```

      - En `CardQuery`, sustituir `type`, `supertype` y `mark` con sus comentarios (líneas 99-106) por:

```ts
  /**
   * Facetas del perfil del juego (H9f): clave -> valor. Exigen `game`. Una clave
   * que no es del juego no llega aqui -- el servidor contesta 400 --, y si
   * llegara el repositorio lanza en vez de ignorarla.
   */
  facetas?: FacetValues;
```

      - Sustituir `FacetCount` y `FacetCounts` (líneas 126-144) por:

```ts
export type { FacetCount } from './facetas-sql.js';

export interface FacetCounts {
  /** Una lista por faceta del perfil, en el orden del perfil. */
  facetas: Partial<Record<FacetKey, FacetCount[]>>;
  rarities: FacetCount[];
  /** Impresiones del contexto -- el set, o el juego entero -- y cuantas tiene. */
  total: number;
  ownedTotal: number | null;
}
```

      - En `searchCards`, sustituir los tres `if` de `type`, `supertype` y `mark` (líneas 274-291) por:

```ts
    for (const [clave, valor] of Object.entries(query.facetas ?? {})) {
      if (valor === undefined || valor === '') continue;
      const def = query.game ? facetOf(query.game, clave) : undefined;
      if (!def) {
        // El servidor ya contesta 400 a esto. Si llega, es un fallo de codigo
        // propio, y una condicion inventada lo esconderia.
        throw new Error(`La faceta "${clave}" no es de ${query.game ?? 'ningun juego indicado'}`);
      }
      const condicion = condicionDeFaceta(def, valor);
      where.push(condicion.sql);
      params.push(...condicion.params);
    }
```

      - En el `SELECT` de `searchCards` (línea 329):

```ts
// antes
              c.hp, c.supertype, c.elem_type, c.reg_mark${columnaTengo}
// despues
              ${COLUMNAS_DE_FILA}${columnaTengo}
```

      - En el `SELECT` de `findCard` (líneas 371-375), el comentario se queda y la línea de columnas
        pasa a ser:

```ts
              ${COLUMNAS_DE_FILA}
```

      - Sustituir el cuerpo de `listFacets` desde `const contar = …` hasta el `return` (líneas 469-514)
        por:

```ts
    const contar = async (expresion: string) =>
      this.db.select<FilaDeRecuento>(
        `SELECT ${expresion} AS valor, COUNT(*) AS n${tengo}
           FROM cards c
           JOIN card_prints p ON p.card_id = c.id
           JOIN sets s ON s.id = p.set_id
          WHERE ${filtro}
          GROUP BY valor`,
        argumentos,
      );

    // Una consulta por faceta del perfil, mas la de rareza, en paralelo: cuatro
    // en Pokemon y en Magic, seis en Yu-Gi-Oh!. El orden ya no lo pone MySQL:
    // lo pone el perfil (`repartir`).
    const perfil = FACET_PROFILES[game];
    const [rarezas = [], ...porFaceta] = await Promise.all([
      contar('(SELECT r.code FROM rarities r WHERE r.id = p.rarity_id)'),
      ...perfil.facets.map((f) => contar(FACET_SQL[f.key].grupo)),
    ]);

    const facetas: Partial<Record<FacetKey, FacetCount[]>> = {};
    perfil.facets.forEach((f, i) => {
      facetas[f.key] = repartir(porFaceta[i] ?? [], f, conTenencia);
    });

    // El total sale de la rareza: toda impresion tiene exactamente una, asi que
    // sus grupos son una particion. Ninguna faceta de Magic lo es (corrige el
    // calculo de T-093, que usaba la categoria de Pokemon).
    const total = rarezas.reduce((acc, f) => acc + Number(f.n), 0);
    const ownedTotal = conTenencia ? rarezas.reduce((acc, f) => acc + Number(f.tengo ?? 0), 0) : null;

    return {
      facetas,
      rarities: rarezas
        .filter((f) => f.valor !== null)
        .map((f) => ({
          value: String(f.valor),
          count: Number(f.n),
          owned: conTenencia ? Number(f.tengo ?? 0) : null,
        })),
      total,
      ownedTotal,
    };
```

      - Sustituir `CardRow` y `toSummary` (líneas 526-570, con su comentario de P-024 intacto encima de
        `toSummary`) por:

```ts
export type CardRow = {
  id: number; oracle_key: string; game_id: number; name: string; type_line: string | null;
  set_code: string; set_name: string; print_id: number;
  collector_number: string; image_local_path: string | null; rarity: string;
  /** Solo si alguien mira (T-093). Ausente en la ficha, que no tiene usuario. */
  tengo?: number | string | null;
} & {
  /** Los datos de fila, con el alias de `COLUMNAS_DE_FILA`. */
  [K in RowField as `ff_${K}`]?: string | number | null;
};

export function toSummary(row: CardRow): CardSummary {
  const game = gameCodeOf(Number(row.game_id));
  // Solo los datos de las celdas de SU juego: una fila de Magic no lleva
  // `hp: null` (H9f). El esquema declara la union de los tres.
  const facetas: RowFacets = {};
  for (const campo of rowFieldsOf(game)) {
    const crudo = row[`ff_${campo}`];
    facetas[campo] =
      crudo === undefined || crudo === null ? null : ROW_FIELD_KIND[campo] === 'int' ? Number(crudo) : String(crudo);
  }
  return {
    cardId: Number(row.id),
    oracleKey: row.oracle_key,
    game,
    name: row.name,
    typeLine: row.type_line,
    setCode: row.set_code,
    setName: row.set_name,
    collectorNumber: row.collector_number,
    rarity: row.rarity,
    // SOLO la ruta local. `image_source_url` ni se selecciona (P-001).
    imagePath: row.image_local_path,
    printId: Number(row.print_id),
    facetas,
    // Ausente -> null, explicitamente. `Number(undefined) === 1` daria `false`,
    // y una ficha diria "no la tienes" a quien si la tiene.
    owned: row.tengo === undefined || row.tengo === null ? null : Number(row.tengo) === 1,
  };
}
```

- [ ] **8. El esquema** (`apps/api/src/api/schemas.ts`):

      - Debajo de `RECUENTO`:

```ts
import { FACET_KEYS, ROW_FIELDS, ROW_FIELD_KIND } from '@tcg/shared';

/**
 * Lo que una fila lleva bajo `facetas`: la UNION de los datos de fila de los
 * tres perfiles (H9f). ADR-007 sigue mordiendo: un dato que falte aqui Fastify
 * lo tira sin decir nada. La prueba de P-024 compara esta lista con los perfiles.
 */
const FACETAS_DE_FILA = {
  type: 'object',
  properties: Object.fromEntries(
    ROW_FIELDS.map((f) => [f, { type: ROW_FIELD_KIND[f] === 'int' ? ['integer', 'null'] : ['string', 'null'] }]),
  ) as Record<(typeof ROW_FIELDS)[number], { type: string[] }>,
} as const;

/** Cada clave de faceta como parametro plano de la URL (`?color=U&kind=creature`). */
const PARAMETROS_DE_FACETA = Object.fromEntries(
  FACET_KEYS.map((k) => [k, { type: 'string', maxLength: 32 }]),
) as Record<(typeof FACET_KEYS)[number], { type: 'string'; maxLength: number }>;
```

        (la `import` va arriba del fichero, debajo del comentario de cabecera).

      - En `CARD_SUMMARY`, sustituir el comentario y los cuatro campos `hp` … `regMark` por:

```ts
    // Los datos de las celdas de la fila, por juego (H9f). Antes eran cuatro
    // campos planos de Pokemon; ahora es la union de los tres perfiles.
    facetas: FACETAS_DE_FILA,
```

      - En `LIST_FACETS`, sustituir `types`, `supertypes`, `marks` y `withoutMark` por:

```ts
            facetas: {
              type: 'object',
              properties: Object.fromEntries(FACET_KEYS.map((k) => [k, { type: 'array', items: RECUENTO }])),
            },
```

      - En `SEARCH_CARDS`, sustituir `type`, `supertype` y `mark` con su comentario por:

```ts
      // Las facetas de los tres juegos (H9f). El esquema admite la UNION; que
      // la clave sea del juego pedido lo comprueba la ruta y contesta 400.
      // `additionalProperties: false` sigue haciendo 400 de lo que no es de
      // ninguno.
      ...PARAMETROS_DE_FACETA,
```

- [ ] **9. La ruta** (`apps/api/src/api/server.ts`). Importar de `@tcg/shared`
      `import { facetOf, isFacetKey, type FacetValues } from '@tcg/shared';` y de
      `../db/catalog-query-repository.js` también `type CardQuery`. Sustituir la ruta `/api/cards`
      entera por:

```ts
  app.get<{
    Querystring: {
      game?: GameCode; set?: string; rarity?: string; q?: string;
      owned?: 'yes' | 'no'; cursor?: string; limit?: number;
    } & FacetValues;
  }>('/api/cards', { schema: SEARCH_CARDS, preValidation: identificarSiHay }, async (request, reply) => {
    const { owned, game, ...resto } = request.query;

    const facetas: FacetValues = {};
    const otros: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(resto)) {
      if (!isFacetKey(clave)) {
        otros[clave] = valor;
        continue;
      }
      if (typeof valor !== 'string') continue;
      if (!game || !facetOf(game, clave)) {
        // Una clave de otro juego es un error de quien pregunta, no un filtro
        // que se ignora: `?color=U` en Pokemon devolveria el catalogo entero
        // como si filtrara (spec 7).
        return reply.code(400).send({
          error: 'bad_request',
          message: game
            ? `La faceta "${clave}" no es de ${game}`
            : `La faceta "${clave}" exige indicar el juego`,
        });
      }
      facetas[clave] = valor;
    }

    if (owned && !request.usuario) {
      // Sin usuario no hay coleccion contra la que comparar. Devolver el
      // catalogo entero como "lo que te falta" seria contestar otra pregunta
      // sin decirlo.
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Filtrar por lo que tienes exige iniciar sesion',
      });
    }
    const usuario = request.usuario;
    const page = await catalog.searchCards({
      ...(otros as Pick<CardQuery, 'set' | 'rarity' | 'q' | 'cursor' | 'limit'>),
      ...(game ? { game } : {}),
      ...(Object.keys(facetas).length > 0 ? { facetas } : {}),
      ...(usuario ? { viewerId: usuario.id } : {}),
      ...(owned && usuario ? { owner: { userId: usuario.id, owned: owned === 'yes' } } : {}),
    });
    return { data: page.items, nextCursor: page.nextCursor };
  });
```

- [ ] **10. Las pruebas del servidor** (`apps/api/src/api/server.test.ts`):

      - En la importación de `../db/catalog-query-repository.js` no cambia nada; añadir
        `import { GAME_CODES, GAME_IDS, rowFieldsOf } from '@tcg/shared';`.

      - En `CARTA`, sustituir `hp: null, supertype: null, elemType: null, regMark: null,` (y su
        comentario) por:

```ts
  // Los datos de fila de Yu-Gi-Oh! (H9f), que es lo que esta fixture representa.
  facetas: {
    kind: 'monster', attribute: 'LIGHT', frame: 'normal', level: 8, linkVal: null,
    race: 'Dragon', atk: 3000, def: 2500,
  },
```

      - En «ninguna respuesta del catalogo contiene http», antes de `await app.close()`:

```ts
    // Y las facetas de la fila sobreviven a la serializacion (ADR-007).
    const busqueda = await app.inject({ method: 'GET', url: '/api/cards' });
    expect(busqueda.json().data[0].facetas).toMatchObject({ atk: 3000, attribute: 'LIGHT' });
```

      - Sustituir la prueba «P-024: toSummary produce EXACTAMENTE…» entera por:

```ts
  it('P-024: toSummary produce EXACTAMENTE los campos que declara el esquema, facetas incluidas', () => {
    // El esquema es un literal JSON y TypeScript no lo relaciona con
    // `CardSummary`: Fastify tira en silencio lo que no cuadra. Desde H9f la
    // comprobacion baja un nivel: lo que lleva `facetas` en cada juego es lo que
    // dice su perfil, y lo que declara el esquema es la union de los tres.
    const fila: CardRow = {
      id: 7, oracle_key: '89631139', game_id: 2, name: 'Blue-Eyes White Dragon',
      type_line: 'Normal Monster', set_code: 'LOB', set_name: 'Legend of Blue Eyes',
      print_id: 42, collector_number: '001', image_local_path: 'ygo/lob/x.245.webp', rarity: 'ultra_rare',
    };
    for (const game of GAME_CODES) {
      const producido = toSummary({ ...fila, game_id: GAME_IDS[game] });
      expect(Object.keys(producido).sort()).toEqual(Object.keys(CARD_SUMMARY.properties).sort());
      expect(Object.keys(producido.facetas).sort(), game).toEqual([...rowFieldsOf(game)].sort());
    }
    const declaradas = Object.keys(CARD_SUMMARY.properties.facetas.properties).sort();
    const union = [...new Set(GAME_CODES.flatMap((g) => rowFieldsOf(g)))].sort();
    expect(declaradas).toEqual(union);
    expect(toSummary(fila).cardId).toBe(7);
    expect(toSummary(fila).printId).toBe(42);
  });
```

      - Al final del `describe('validacion de entrada')`:

```ts
  it('una faceta de otro juego es un 400 que la nombra, y no llega al repositorio', async () => {
    const { catalog, ultimaConsulta } = fakeCatalog();
    const app = buildServer({ catalog });
    const res = await app.inject({ method: 'GET', url: '/api/cards?game=PTCG&color=U' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('"color"');
    expect(ultimaConsulta()).toBeNull();
    await app.close();
  });

  it('una faceta sin juego tambien es 400: no hay perfil contra el que mirarla', async () => {
    const { catalog } = fakeCatalog();
    const app = buildServer({ catalog });
    expect((await app.inject({ method: 'GET', url: '/api/cards?kind=creature' })).statusCode).toBe(400);
    await app.close();
  });

  it('las facetas del juego llegan juntas al repositorio, y el resto como siempre', async () => {
    const { catalog, ultimaConsulta } = fakeCatalog();
    const app = buildServer({ catalog });
    const res = await app.inject({ method: 'GET', url: '/api/cards?game=MTG&set=blb&color=U&kind=creature' });
    expect(res.statusCode).toBe(200);
    expect(ultimaConsulta()?.facetas).toEqual({ color: 'U', kind: 'creature' });
    expect(ultimaConsulta()?.set).toBe('blb');
    expect(ultimaConsulta()?.game).toBe('MTG');
    await app.close();
  });

  it('una clave que no es de ningun juego sigue siendo 400 por esquema', async () => {
    const { catalog } = fakeCatalog();
    const app = buildServer({ catalog });
    expect((await app.inject({ method: 'GET', url: '/api/cards?game=MTG&colour=U' })).statusCode).toBe(400);
    await app.close();
  });
```

- [ ] **11. La prueba con sesión** (`apps/api/src/api/catalogo-con-sesion.test.ts`):

```ts
// antes
const CON_TENENCIA: FacetCounts = {
  types: [{ value: 'Grass', count: 23, owned: 12 }],
  supertypes: [],
  marks: [],
  withoutMark: 0,
  rarities: [],
  total: 23,
  ownedTotal: 12,
};
// despues
const CON_TENENCIA: FacetCounts = {
  facetas: { type: [{ value: 'Grass', count: 23, owned: 12 }] },
  rarities: [],
  total: 23,
  ownedTotal: 12,
};
```

```ts
// antes
        : { ...CON_TENENCIA, types: [{ value: 'Grass', count: 23, owned: null }], ownedTotal: null };
// despues
        : { ...CON_TENENCIA, facetas: { type: [{ value: 'Grass', count: 23, owned: null }] }, ownedTotal: null };
```

```ts
// antes
      types: [{ value: 'Grass', count: 23, owned: 12 }],
    });
// despues
      facetas: { type: [{ value: 'Grass', count: 23, owned: 12 }] },
    });
```

- [ ] **12. Ver que pasa.** `npx tsc --build && npx vitest run apps/api` → verde, y `npm test` → verde.

- [ ] **13. Contra la base real.** Levantar la API nueva, de una de las dos formas:

      - **Docker:** `docker compose up -d --build api` → `API=http://localhost:3000`.
      - **Local:** `npx tsc --build` (o `npm run build -w @tcg/api`) y **reiniciar** el servidor de la
        API que esté corriendo (un proceso de Node no recarga el código compilado) →
        `API=http://localhost:3001`.

      `localhost`, no `127.0.0.1`: en esta máquina `127.0.0.1:3000` es otra aplicación.

```bash
API=http://localhost:3000   # o http://localhost:3001 con la API local
for i in 1 2 3; do curl -s -o /dev/null -w '%{time_total}\n' "$API/api/games/MTG/facets"; done
curl -s "$API/api/games/MTG/facets" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s).data;console.log(d.total, d.facetas.color.map(f=>f.value+' '+f.count).join(' | '), '|', d.facetas.cost.reduce((a,f)=>a+f.count,0))})"
curl -s -o /dev/null -w '%{http_code}\n' "$API/api/cards?game=PTCG&color=U"
```

      Esperado: tres tiempos **por debajo de 0,400** (criterio §8.3; la línea base medida al escribir
      el plan es 0,18-0,31 s por consulta suelta sobre 117.152 impresiones, cuatro en paralelo); el
      total `117152`, el color en el orden `W U B R G C M`, y la suma de los tramos de coste **menor**
      que el total (los reversos apartados, spec §7). El último, `400`. Apuntar los tiempos en la
      bitácora. Si pasan de 0,4 s, parar y decirlo: es el riesgo abierto 1.

      **La web que corre está rota hasta T-111** (corrección 9). No correr la suite E2E todavía, y
      **no desplegar ni empujar a `main`** hasta cerrar T-111: hay un entorno de producción.

- [ ] **14. Commit:** `feat(api): facets driven by the game profile, 400 for a foreign key (T-110)`

---

## T-111 · La web al perfil, con Pokémon migrado y la suite E2E intacta

**Ficheros**
- Crear: `apps/web/src/lib/facetas-web.ts`, `apps/web/src/lib/facetas-web.test.ts`,
  `apps/web/src/lib/celdas.ts`, `apps/web/src/components/celdas.tsx`
- Modificar: `apps/web/src/lib/api.ts`, `apps/web/src/lib/filtros-url.ts`,
  `apps/web/src/lib/filtros-url.test.ts`, `apps/web/src/components/RailDeSet.tsx`,
  `apps/web/src/components/FilaDeCarta.tsx`, `apps/web/src/components/FichaDeCarta.tsx`,
  `apps/web/src/pages/Catalogo.tsx`, `apps/web/src/i18n/es.ts`

- [ ] **1. Las pruebas que fallan.** Sustituir `apps/web/src/lib/filtros-url.test.ts` entero:

```ts
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
    const a = escribirFiltros({ ...SIN_FILTROS, owned: 'no', facetas: { type: 'Fire' }, set: 'sv1' }, 'PTCG');
    expect(a.toString()).toBe('set=sv1&type=Fire&owned=no');
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
```

      Y crear `apps/web/src/lib/facetas-web.test.ts`:

```ts
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

  it('Pokemon conserva los nombres de seccion de los que depende la suite E2E', () => {
    expect(FACET_PROFILES.PTCG.facets.map((f) => PRESENTACION[f.key].titulo('PTCG')))
      .toEqual([ES.rail.categoria, ES.rail.tipo, ES.rail.marca]);
  });
});
```

- [ ] **2. Ver que fallan.** `npx vitest run apps/web/src/lib/filtros-url apps/web/src/lib/facetas-web` →
      FAIL: `valorDe` no existe y `./facetas-web.js` no resuelve.

- [ ] **3. El texto** (`apps/web/src/i18n/es.ts`):

      - En `catalogo.columnas`, después de `tienes: 'Tienes',`:

```ts
      coste: 'Coste',
      fr: 'F/R',
      atributo: 'Atributo',
      nivel: 'Nivel',
      atkDef: 'ATK/DEF',
```

      - En `catalogo`, después de `ps: (n: number) => \`${n} PS\`,`:

```ts
    lealtad: (l: string) => `Lealtad ${l}`,
    atkDef: (atk: string, def: string) => `${atk}/${def}`,
    /** "Dragon · Monstruo", "Quick-Play · Mágica". La raza llega en inglés, como el type_line. */
    tipoYgo: (raza: string | null, clase: string | null) =>
      [raza, clase].filter((x): x is string => x !== null && x !== '').join(' · '),
```

      - En `ficha`, después de `ps: 'PS',`:

```ts
    fr: (fuerza: string, resistencia: string) => `${fuerza}/${resistencia}`,
```

      - Un bloque nuevo, después de `pokemon`:

```ts
  /**
   * Las facetas de Magic y Yu-Gi-Oh! (H9f). La clave es el valor que guarda la
   * base (columnas de la 0029); el valor es lo que se lee.
   */
  facetas: {
    titulo: {
      color: 'Color',
      clase: 'Clase',
      coste: 'Coste',
      marco: 'Marco',
      atributo: 'Atributo',
      nivel: 'Nivel o rango',
      link: 'Link',
    },
    color: {
      W: 'Blanco', U: 'Azul', B: 'Negro', R: 'Rojo', G: 'Verde', C: 'Incoloro', M: 'Multicolor',
    } as Record<string, string>,
    kind: {
      creature: 'Criatura', planeswalker: 'Planeswalker', land: 'Tierra', artifact: 'Artefacto',
      enchantment: 'Encantamiento', instant: 'Instantáneo', sorcery: 'Conjuro', battle: 'Batalla',
      other: 'Otra',
      monster: 'Monstruo', spell: 'Mágica', trap: 'Trampa', skill: 'Habilidad', token: 'Ficha',
    } as Record<string, string>,
    frame: {
      normal: 'Normal', effect: 'Efecto', ritual: 'Ritual', fusion: 'Fusión', synchro: 'Sincronía',
      xyz: 'Xyz', pendulum: 'Péndulo', link: 'Link', token: 'Ficha',
    } as Record<string, string>,
    attribute: {
      DARK: 'Oscuridad', LIGHT: 'Luz', EARTH: 'Tierra', WATER: 'Agua', FIRE: 'Fuego', WIND: 'Viento',
      DIVINE: 'Divinidad',
    } as Record<string, string>,
    coste: (v: string) => `Coste ${v}`,
    nivel: (v: string) => `Nivel o rango ${v}`,
    link: (v: string) => `LINK-${v}`,
  },
```

- [ ] **4. El estado de la URL, por juego.** Sustituir `apps/web/src/lib/filtros-url.ts` entero (el
      comentario de cabecera se conserva tal cual):

```ts
import type { FacetKey, GameCode } from '@tcg/shared';
import { FACET_PROFILES } from '@tcg/shared';

/* (el comentario de cabecera de T-093, sin cambios) */

export type Tenencia = '' | 'yes' | 'no';

export interface FiltrosCatalogo {
  /** `externalId` del set. Vacio = todo el juego. */
  set: string;
  q: string;
  rarity: string;
  owned: Tenencia;
  /** Las facetas del perfil del juego (H9f): clave -> valor. */
  facetas: Partial<Record<FacetKey, string>>;
}

export type ClaveFiltro = 'set' | 'q' | 'rarity' | 'owned' | FacetKey;

export const SIN_FILTROS: FiltrosCatalogo = { set: '', q: '', rarity: '', owned: '', facetas: {} };

/**
 * Las claves de un juego, en el orden en que se escriben: una URL estable se
 * comparte mejor. Las facetas van en el orden del perfil.
 */
export function clavesDe(juego: GameCode): ClaveFiltro[] {
  return ['set', 'q', ...FACET_PROFILES[juego].facets.map((f) => f.key), 'rarity', 'owned'];
}

export function valorDe(filtros: FiltrosCatalogo, clave: ClaveFiltro): string {
  switch (clave) {
    case 'set': return filtros.set;
    case 'q': return filtros.q;
    case 'rarity': return filtros.rarity;
    case 'owned': return filtros.owned;
    default: return filtros.facetas[clave] ?? '';
  }
}

function conValor(filtros: FiltrosCatalogo, clave: ClaveFiltro, valor: string): FiltrosCatalogo {
  switch (clave) {
    case 'set': return { ...filtros, set: valor };
    case 'q': return { ...filtros, q: valor };
    case 'rarity': return { ...filtros, rarity: valor };
    // Un valor desconocido se descarta en vez de mandarse: la API lo
    // rechazaria con un 400 y el catalogo se quedaria en blanco.
    case 'owned': return { ...filtros, owned: valor === 'yes' || valor === 'no' ? valor : '' };
    default: {
      const facetas = { ...filtros.facetas };
      if (valor === '') delete facetas[clave];
      else facetas[clave] = valor;
      return { ...filtros, facetas };
    }
  }
}

/** Solo se leen las claves del juego: una de otro juego en la URL se ignora. */
export function leerFiltros(params: URLSearchParams, juego: GameCode): FiltrosCatalogo {
  return clavesDe(juego).reduce((f, clave) => conValor(f, clave, params.get(clave) ?? ''), SIN_FILTROS);
}

export function escribirFiltros(filtros: FiltrosCatalogo, juego: GameCode): URLSearchParams {
  const params = new URLSearchParams();
  for (const clave of clavesDe(juego)) {
    const valor = valorDe(filtros, clave).trim();
    if (valor !== '') params.set(clave, valor);
  }
  return params;
}

/**
 * Pulsar un filtro que ya esta puesto lo QUITA: la misma fila del rail que pone
 * "Planta" la quita, sin buscar otro boton.
 */
export function alternar(filtros: FiltrosCatalogo, clave: ClaveFiltro, valor: string): FiltrosCatalogo {
  return conValor(filtros, clave, valorDe(filtros, clave) === valor ? '' : valor);
}

export function quitar(filtros: FiltrosCatalogo, clave: ClaveFiltro): FiltrosCatalogo {
  return conValor(filtros, clave, '');
}

/**
 * Lo que se pinta como chip borrable: todo menos el set, que es el CONTEXTO --
 * el titulo de la pagina y el ambito de los recuentos --, no un filtro mas.
 */
export function filtrosActivos(
  filtros: FiltrosCatalogo,
  juego: GameCode,
): Array<{ clave: ClaveFiltro; valor: string }> {
  return clavesDe(juego)
    .filter((c) => c !== 'set' && valorDe(filtros, c) !== '')
    .map((c) => ({ clave: c, valor: valorDe(filtros, c) }));
}

/** Quita todos los filtros y conserva el set, por lo mismo que arriba. */
export function limpiar(filtros: FiltrosCatalogo): FiltrosCatalogo {
  return { ...SIN_FILTROS, set: filtros.set };
}
```

- [ ] **5. La presentación de cada faceta** (`apps/web/src/lib/facetas-web.ts`):

```ts
import type { CSSProperties } from 'react';
import type { FacetKey, GameCode } from '@tcg/shared';
import { SIN_VALOR } from '@tcg/shared';
import { ES } from '../i18n/es.js';
import { estiloDeTipo } from './tipos-pokemon.js';

/**
 * Cada clave del perfil, en la pantalla (H9f, F-2).
 *
 * El perfil dice QUE facetas tiene cada juego; esto dice como se llaman y como
 * se leen sus valores. `facetas-web.test.ts` exige las mismas claves que el
 * perfil, en los dos sentidos.
 */
export interface PresentacionDeFaceta {
  /** El nombre de la seccion del rail, que es tambien su nombre accesible. */
  titulo: (juego: GameCode) => string;
  /** Como se lee un valor, en el rail y en su chip. */
  etiqueta: (valor: string) => string;
  /** Si lo tiene, el color del punto de la fila (deja `--tipo` en el estilo). */
  estilo?: (valor: string) => CSSProperties | undefined;
  /** Una nota bajo la fila del valor ("Sin marca"). */
  nota?: (valor: string) => string | undefined;
}

const de = (tabla: Record<string, string>) => (valor: string) => tabla[valor] ?? valor;

export const PRESENTACION: Readonly<Record<FacetKey, PresentacionDeFaceta>> = {
  supertype: { titulo: () => ES.rail.categoria, etiqueta: de(ES.pokemon.supertipo) },
  type: { titulo: () => ES.rail.tipo, etiqueta: de(ES.pokemon.tipo), estilo: estiloDeTipo },
  mark: {
    titulo: () => ES.rail.marca,
    etiqueta: (v) => (v === SIN_VALOR ? ES.rail.sinMarca : ES.pokemon.marca(v)),
    // La ausencia se explica, no se pinta como hueco (spec H9b, seccion 2).
    nota: (v) => (v === SIN_VALOR ? ES.rail.sinMarcaNota : undefined),
  },
  color: { titulo: () => ES.facetas.titulo.color, etiqueta: de(ES.facetas.color) },
  // Misma clave en dos juegos, con dos nombres: en Magic es el tipo, en
  // Yu-Gi-Oh! la clase (monstruo, magica, trampa...).
  kind: {
    titulo: (juego) => (juego === 'YGO' ? ES.facetas.titulo.clase : ES.rail.tipo),
    etiqueta: de(ES.facetas.kind),
  },
  cost: { titulo: () => ES.facetas.titulo.coste, etiqueta: ES.facetas.coste },
  frame: { titulo: () => ES.facetas.titulo.marco, etiqueta: de(ES.facetas.frame) },
  attribute: { titulo: () => ES.facetas.titulo.atributo, etiqueta: de(ES.facetas.attribute) },
  level: { titulo: () => ES.facetas.titulo.nivel, etiqueta: ES.facetas.nivel },
  link: { titulo: () => ES.facetas.titulo.link, etiqueta: ES.facetas.link },
};
```

- [ ] **6. Las cabeceras de celda** (`apps/web/src/lib/celdas.ts`):

```ts
import type { CellKey } from '@tcg/shared';
import { ES } from '../i18n/es.js';

/**
 * Cabecera y clase de cada celda de la fila (H9f). La clase es la misma en la
 * cabecera y en la celda: es lo que fija su ancho y la oculta en estrecho.
 */
export const CABECERAS: Readonly<Record<CellKey, { etiqueta: string; clase: string }>> = {
  number: { etiqueta: ES.catalogo.columnas.numero, clase: 'col-numero' },
  card: { etiqueta: ES.catalogo.columnas.carta, clase: 'col-carta' },
  rarity: { etiqueta: ES.catalogo.columnas.rareza, clase: 'col-rareza' },
  owned: { etiqueta: ES.catalogo.columnas.tienes, clase: 'col-tienes' },
  ptcgType: { etiqueta: ES.catalogo.columnas.tipo, clase: 'col-tipo' },
  hp: { etiqueta: ES.catalogo.columnas.ps, clase: 'col-ps' },
  mark: { etiqueta: ES.catalogo.columnas.marca, clase: 'col-marca' },
  manaCost: { etiqueta: ES.catalogo.columnas.coste, clase: 'col-mana' },
  mtgKind: { etiqueta: ES.catalogo.columnas.tipo, clase: 'col-tipo' },
  powerToughness: { etiqueta: ES.catalogo.columnas.fr, clase: 'col-fr' },
  attribute: { etiqueta: ES.catalogo.columnas.atributo, clase: 'col-atributo' },
  levelRankLink: { etiqueta: ES.catalogo.columnas.nivel, clase: 'col-nivel' },
  ygoType: { etiqueta: ES.catalogo.columnas.tipo, clase: 'col-tipo' },
  atkDef: { etiqueta: ES.catalogo.columnas.atkDef, clase: 'col-atkdef' },
};
```

- [ ] **7. Ver que pasan.** `npx vitest run apps/web/src/lib/filtros-url apps/web/src/lib/facetas-web` →
      14 passed.

- [ ] **8. El cliente** (`apps/web/src/lib/api.ts`):

      - Importación: `import type { DeckLine, DeckValidation, DeckZone, FacetKey, FacetValues, GameCode, GameData, RowFacets } from '@tcg/shared';`
      - En `CardSummary`, sustituir el comentario y `hp`, `supertype`, `elemType`, `regMark` por:

```ts
  /**
   * Los datos de las celdas de la fila de su juego (H9f). Llegan en el resumen
   * para que la tabla no tenga que pedir la ficha de cada carta.
   */
  facetas: RowFacets;
```

      - Sustituir `FacetCounts` y la constante `SIN_MARCA` (con su comentario) por:

```ts
export interface FacetCounts {
  /** Una lista por faceta del perfil, en el orden del perfil (H9f). */
  facetas: Partial<Record<FacetKey, FacetCount[]>>;
  rarities: FacetCount[];
  /** Impresiones del contexto -- el set o el juego -- y cuantas tiene el usuario. */
  total: number;
  ownedTotal: number | null;
}
```

      - En `api.cards`, sustituir los parámetros `type`, `supertype` y `mark` por
        `facetas?: FacetValues | undefined;` y el cuerpo por:

```ts
    const { facetas, ...resto } = params;
    const search = new URLSearchParams();
    // Las facetas viajan como parametros planos (`?color=U&kind=creature`).
    for (const [k, v] of Object.entries({ ...resto, ...(facetas ?? {}) })) {
      if (v !== undefined && v !== '') search.set(k, String(v));
    }
    return request<CardPage>(`/cards?${search.toString()}`, {}, token);
```

- [ ] **9. Los pintores de celda** (`apps/web/src/components/celdas.tsx`). Los de Magic y Yu-Gi-Oh! son
      aquí texto llano y completo; T-112 y T-113 los sustituyen por símbolos y marcas:

```tsx
import type { ReactElement, ReactNode } from 'react';
import type { CellKey } from '@tcg/shared';
import { imageUrl, type CardSummary } from '../lib/api.js';
import { CABECERAS } from '../lib/celdas.js';
import { estiloDeTipo } from '../lib/tipos-pokemon.js';
import { ES } from '../i18n/es.js';

/**
 * Como se pinta cada celda de la fila (H9f, F-2).
 *
 * El perfil dice QUE celdas tiene la fila de cada juego y en que orden; esto
 * dice COMO se pinta cada una. Es un `Record<CellKey, ...>`: una celda sin
 * pintor, o un pintor sin celda, no compila.
 */
export interface PropsDeCelda {
  carta: CardSummary;
  rareza: string;
  /** Abre la ficha (T-094). */
  onAbrir: () => void;
}

/**
 * Tope de la barra de PS. 400 y no el maximo del set: la barra tiene que
 * comparar cartas de SETS DISTINTOS. El maximo del catalogo entero es 380
 * (medido en S037).
 */
const PS_TOPE = 400;

function Td({ celda, children }: { celda: CellKey; children: ReactNode }) {
  return <td className={CABECERAS[celda].clase}>{children}</td>;
}

function Vacio() {
  return <span className="tenue">{ES.simbolo.vacio}</span>;
}

/** Un dato de la fila como texto, o null si no lo tiene. */
export function texto(v: string | number | null | undefined): string | null {
  return v === null || v === undefined ? null : String(v);
}

export const CELDAS: Readonly<Record<CellKey, (p: PropsDeCelda) => ReactElement>> = {
  number: ({ carta }) => <Td celda="number">{carta.collectorNumber}</Td>,

  card: ({ carta, onAbrir }) => {
    const src = imageUrl(carta.imagePath);
    return (
      <Td celda="card">
        <div className="celda-carta">
          <span className="carta-miniatura">
            {src ? (
              // Tamano declarado: sin el, cada imagen que llega empuja la tabla.
              <img src={src} alt="" loading="lazy" decoding="async" width={34} height={47} />
            ) : (
              <span className="miniatura-hueco" aria-hidden="true" />
            )}
          </span>
          <span className="carta-textos">
            {/* El nombre ES el boton: un boton aparte de "ver" en cada fila
                serian 300 botones identicos para un lector de pantalla. */}
            <button type="button" className="carta-nombre-fila" onClick={onAbrir}>
              {carta.name}
            </button>
            {carta.typeLine && <span className="carta-linea">{carta.typeLine}</span>}
          </span>
        </div>
      </Td>
    );
  },

  rarity: ({ rareza }) => <Td celda="rarity">{rareza}</Td>,

  owned: ({ carta }) => (
    <Td celda="owned">
      {carta.owned ? (
        <span className="tienes-si" role="img" aria-label={ES.catalogo.laTienes}>{ES.simbolo.check}</span>
      ) : (
        <span className="tienes-no" role="img" aria-label={ES.catalogo.teFalta}>{ES.simbolo.vacio}</span>
      )}
    </Td>
  ),

  ptcgType: ({ carta }) => {
    const t = texto(carta.facetas.type);
    return (
      <Td celda="ptcgType">
        {t ? <span className="chip-tipo" style={estiloDeTipo(t)}>{ES.pokemon.tipo[t] ?? t}</span> : <Vacio />}
      </Td>
    );
  },

  hp: ({ carta }) => {
    const hp = typeof carta.facetas.hp === 'number' ? carta.facetas.hp : null;
    return (
      <Td celda="hp">
        {hp !== null ? (
          <span className="ps" title={ES.catalogo.ps(hp)}>
            <span className="ps-cifra">{hp}</span>
            <span className="ps-barra" aria-hidden="true">
              <span style={{ inlineSize: `${Math.min(100, (hp / PS_TOPE) * 100)}%` }} />
            </span>
          </span>
        ) : (
          <Vacio />
        )}
      </Td>
    );
  },

  mark: ({ carta }) => <Td celda="mark">{texto(carta.facetas.mark) ?? <Vacio />}</Td>,

  manaCost: ({ carta }) => <Td celda="manaCost">{texto(carta.facetas.manaCost) ?? <Vacio />}</Td>,

  mtgKind: ({ carta }) => {
    const k = texto(carta.facetas.kind);
    return <Td celda="mtgKind">{k ? ES.facetas.kind[k] ?? k : <Vacio />}</Td>;
  },

  powerToughness: ({ carta }) => {
    const f = carta.facetas;
    const p = texto(f.power);
    const t = texto(f.toughness);
    const l = texto(f.loyalty);
    return (
      <Td celda="powerToughness">
        {p !== null && t !== null ? ES.ficha.fr(p, t) : l !== null ? ES.catalogo.lealtad(l) : <Vacio />}
      </Td>
    );
  },

  attribute: ({ carta }) => {
    const a = texto(carta.facetas.attribute);
    return <Td celda="attribute">{a ? ES.facetas.attribute[a] ?? a : <Vacio />}</Td>;
  },

  levelRankLink: ({ carta }) => {
    const f = carta.facetas;
    const n = texto(f.frame === 'link' ? f.linkVal : f.level);
    return <Td celda="levelRankLink">{n ?? <Vacio />}</Td>;
  },

  ygoType: ({ carta }) => {
    const k = texto(carta.facetas.kind);
    const t = ES.catalogo.tipoYgo(texto(carta.facetas.race), k ? ES.facetas.kind[k] ?? k : null);
    return <Td celda="ygoType">{t !== '' ? t : <Vacio />}</Td>;
  },

  atkDef: ({ carta }) => {
    const a = texto(carta.facetas.atk);
    const d = texto(carta.facetas.def);
    return (
      <Td celda="atkDef">
        {a === null && d === null ? <Vacio /> : ES.catalogo.atkDef(a ?? ES.simbolo.vacio, d ?? ES.simbolo.vacio)}
      </Td>
    );
  },
};
```

- [ ] **10. La fila** (`apps/web/src/components/FilaDeCarta.tsx`), entera:

```tsx
import type { GameCode } from '@tcg/shared';
import { FACET_PROFILES } from '@tcg/shared';
import type { CardSummary } from '../lib/api.js';
import { CELDAS } from './celdas.js';

interface Props {
  carta: CardSummary;
  juego: GameCode;
  /** Abre la ficha (T-094). */
  onAbrir: () => void;
  rareza: string;
  /** Con sesion se pinta la columna "Tienes". Sin ella, ni la columna. */
  conSesion: boolean;
}

/**
 * Una fila del catalogo «Consulta» (T-093; por perfil desde H9f).
 *
 * Es una fila de TABLA, no una tarjeta: son datos tabulares y un lector de
 * pantalla anuncia cada celda con su cabecera. Que celdas tiene, y en que
 * orden, lo dice el perfil del juego; como se pinta cada una, `celdas.tsx`.
 */
export function FilaDeCarta({ carta, juego, rareza, conSesion, onAbrir }: Props) {
  return (
    <tr className={carta.owned === false ? 'fila-carta fila-falta' : 'fila-carta'}>
      {FACET_PROFILES[juego].cells
        .filter((c) => conSesion || c !== 'owned')
        .map((c) => {
          const Celda = CELDAS[c];
          return <Celda key={c} carta={carta} rareza={rareza} onAbrir={onAbrir} />;
        })}
    </tr>
  );
}
```

- [ ] **11. El raíl** (`apps/web/src/components/RailDeSet.tsx`), entero (los subcomponentes `Seccion`,
      `FilaDeFaceta` y `Fila` se quedan, con `nota` admitiendo `undefined`):

```tsx
import { useId, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GameCode } from '@tcg/shared';
import { FACET_PROFILES } from '@tcg/shared';
import type { FacetCount, FacetCounts } from '../lib/api.js';
import { valorDe, type ClaveFiltro, type FiltrosCatalogo } from '../lib/filtros-url.js';
import { PRESENTACION } from '../lib/facetas-web.js';
import { ES } from '../i18n/es.js';

interface Props {
  /** Para que el boton que lo pliega en estrecho pueda apuntarlo (`aria-controls`). */
  id: string;
  /** Solo cuenta en pantallas estrechas: en ancho el rail siempre se ve. */
  abierto: boolean;
  juego: GameCode;
  facetas: FacetCounts | undefined;
  filtros: FiltrosCatalogo;
  /** Rarezas del juego en orden de `tier`, con su nombre legible. */
  rarezas: Array<{ code: string; label: string }>;
  conSesion: boolean;
  onAlternar: (clave: ClaveFiltro, valor: string) => void;
}

/**
 * El rail de estructura del set (T-093, D-5 del spec H9b; por perfil desde H9f).
 *
 * ES A LA VEZ NAVEGACION, INFORMACION Y FILTRO. Cada fila dice cuantas cartas
 * hay de ese valor -- y, con sesion, cuantas tienes -- antes de pulsarla.
 *
 * Las secciones salen del PERFIL del juego, en su orden, entre la tenencia y la
 * rareza, que son de todos. Una seccion sin recuentos no se pinta. Cada fila es
 * un `button` con `aria-pressed`: un interruptor, y asi lo anuncia un lector.
 */
export function RailDeSet({ id, abierto, juego, facetas, filtros, rarezas, conSesion, onAlternar }: Props) {
  const clase = abierto ? 'rail rail-abierto' : 'rail';
  if (!facetas) return <nav id={id} className={`${clase} rail-cargando`} aria-label={ES.rail.titulo} aria-busy="true" />;

  const porTier = new Map(rarezas.map((r, i) => [r.code, i]));
  const rarezasOrdenadas = [...facetas.rarities].sort(
    (a, b) => (porTier.get(a.value) ?? 999) - (porTier.get(b.value) ?? 999),
  );
  const nombreDeRareza = new Map(rarezas.map((r) => [r.code, r.label]));

  return (
    <nav id={id} className={clase} aria-label={ES.rail.titulo}>
      <Seccion titulo={ES.rail.tenencia}>
        {conSesion && facetas.ownedTotal !== null ? (
          <>
            <Fila
              activa={filtros.owned === 'no'}
              onPulsar={() => onAlternar('owned', 'no')}
              etiqueta={ES.rail.meFaltan}
              cuenta={facetas.total - facetas.ownedTotal}
            />
            <Fila
              activa={filtros.owned === 'yes'}
              onPulsar={() => onAlternar('owned', 'yes')}
              etiqueta={ES.rail.lasTengo}
              cuenta={facetas.ownedTotal}
            />
          </>
        ) : (
          <li className="rail-nota">
            {ES.catalogo.entraParaFaltan} <Link to="/acceso">{ES.catalogo.entrar}</Link>
          </li>
        )}
      </Seccion>

      {FACET_PROFILES[juego].facets.map((def) => {
        const filas = facetas.facetas[def.key] ?? [];
        if (filas.length === 0) return null;
        const p = PRESENTACION[def.key];
        return (
          <Seccion key={def.key} titulo={p.titulo(juego)}>
            {filas.map((f) => (
              <FilaDeFaceta
                key={f.value}
                faceta={f}
                etiqueta={p.etiqueta(f.value)}
                activa={valorDe(filtros, def.key) === f.value}
                onPulsar={() => onAlternar(def.key, f.value)}
                estilo={p.estilo?.(f.value)}
                punto={p.estilo !== undefined}
                nota={p.nota?.(f.value)}
              />
            ))}
          </Seccion>
        );
      })}

      {rarezasOrdenadas.length > 0 && (
        <Seccion titulo={ES.rail.rareza}>
          {rarezasOrdenadas.map((f) => (
            <FilaDeFaceta
              key={f.value}
              faceta={f}
              etiqueta={nombreDeRareza.get(f.value) ?? f.value}
              activa={filtros.rarity === f.value}
              onPulsar={() => onAlternar('rarity', f.value)}
            />
          ))}
        </Seccion>
      )}
    </nav>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  // Region con nombre: un lector de pantalla puede saltar a "Tipo", y la suite
  // E2E la encuentra por lo que es (T-095).
  const id = useId();
  return (
    <section className="rail-seccion" aria-labelledby={id}>
      <h2 className="rail-titulo" id={id}>{titulo}</h2>
      <ul className="rail-lista">{children}</ul>
    </section>
  );
}

function FilaDeFaceta(props: {
  faceta: FacetCount;
  etiqueta: string;
  activa: boolean;
  onPulsar: () => void;
  estilo?: CSSProperties | undefined;
  punto?: boolean | undefined;
  nota?: string | undefined;
}) {
  const { faceta, ...resto } = props;
  return <Fila {...resto} cuenta={faceta.count} tengo={faceta.owned} />;
}

function Fila(props: {
  etiqueta: string;
  cuenta: number;
  /** Cuantas tiene. Ausente o null: sin sesion, y no se pinta la barra. */
  tengo?: number | null;
  activa: boolean;
  onPulsar: () => void;
  estilo?: CSSProperties | undefined;
  punto?: boolean | undefined;
  nota?: string | undefined;
}) {
  const conTenencia = props.tengo !== undefined && props.tengo !== null;
  const proporcion = conTenencia && props.cuenta > 0 ? (props.tengo as number) / props.cuenta : 0;

  return (
    <li>
      <button
        type="button"
        className="rail-fila"
        aria-pressed={props.activa}
        onClick={props.onPulsar}
        style={props.estilo}
        title={props.nota}
      >
        {props.punto && <span className="rail-punto" aria-hidden="true" />}
        <span className="rail-etiqueta">{props.etiqueta}</span>
        <span className="rail-cifra">
          {conTenencia ? ES.rail.deTotal(props.tengo as number, props.cuenta) : props.cuenta}
        </span>
        {conTenencia && (
          <span className="rail-barra" aria-hidden="true">
            <span style={{ inlineSize: `${Math.round(proporcion * 100)}%` }} />
          </span>
        )}
      </button>
      {props.nota && <p className="rail-nota-fila">{props.nota}</p>}
    </li>
  );
}
```

- [ ] **12. El catálogo** (`apps/web/src/pages/Catalogo.tsx`):

      - Importaciones (líneas 1-16):

```tsx
import { useEffect, useId, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import type { GameCode } from '@tcg/shared';
import { FACET_PROFILES, isFacetKey } from '@tcg/shared';
import { api, imageUrl } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { consultaRarezas, consultaSets } from '../lib/consultas.js';
import {
  alternar, escribirFiltros, filtrosActivos, leerFiltros, limpiar, quitar,
  type ClaveFiltro, type FiltrosCatalogo,
} from '../lib/filtros-url.js';
import { PRESENTACION } from '../lib/facetas-web.js';
import { CABECERAS } from '../lib/celdas.js';
import { SelectorDeSet } from '../components/SelectorDeSet.js';
import { RailDeSet } from '../components/RailDeSet.js';
import { FilaDeCarta } from '../components/FilaDeCarta.js';
import { FichaDeCarta } from '../components/FichaDeCarta.js';
import { ES } from '../i18n/es.js';
```

      - `const filtros = leerFiltros(params);` → `const filtros = leerFiltros(params, juego);`
      - `const fijar = (siguientes: FiltrosCatalogo) => setParams(escribirFiltros(siguientes));` →
        `const fijar = (siguientes: FiltrosCatalogo) => setParams(escribirFiltros(siguientes, juego));`
      - Sustituir la consulta de cartas (líneas 84-95) por:

```tsx
  // La clave de cache es la URL de los filtros efectivos: dos estados con la
  // misma URL son la misma pregunta.
  const claveDeFiltros = escribirFiltros(efectivos, juego).toString();
  const cartas = useInfiniteQuery({
    queryKey: ['cartas', juego, claveDeFiltros, user?.id ?? null],
    queryFn: ({ pageParam }) =>
      api.cards(
        {
          game: juego, set: efectivos.set, q: efectivos.q, rarity: efectivos.rarity,
          owned: efectivos.owned, facetas: efectivos.facetas, cursor: pageParam, limit: POR_PAGINA,
        },
        token,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima) => ultima.nextCursor ?? undefined,
    enabled: !cargando,
  });
  const celdas = FACET_PROFILES[juego].cells.filter((c) => conSesion || c !== 'owned');
```

      - `filtrosActivos(efectivos)` → `filtrosActivos(efectivos, juego)` (las dos apariciones).
      - En `<RailDeSet …>`, añadir `juego={juego}` después de `abierto={railAbierto}`.
      - En `<Chips …>`, añadir `juego={juego}` después de `filtros={efectivos}`.
      - Sustituir el `<thead>…</thead>` por:

```tsx
                <thead>
                  <tr>
                    {celdas.map((c) => (
                      <th key={c} scope="col" className={CABECERAS[c].clase}>{CABECERAS[c].etiqueta}</th>
                    ))}
                  </tr>
                </thead>
```

      - En `<FilaDeCarta …>`, añadir `juego={juego}` después de `carta={c}`.
      - Sustituir la función `Chips` entera por:

```tsx
function Chips({
  filtros, juego, nombreDeRareza, onQuitar, onLimpiar,
}: {
  filtros: FiltrosCatalogo;
  juego: GameCode;
  nombreDeRareza: Map<string, string>;
  onQuitar: (clave: ClaveFiltro) => void;
  onLimpiar: () => void;
}) {
  const activos = filtrosActivos(filtros, juego);
  if (activos.length === 0) return null;

  // La etiqueta de un chip es la de su fila en el rail: el mismo nombre en los
  // dos sitios es lo que deja reconocer que filtro se esta quitando.
  const etiqueta = (clave: ClaveFiltro, valor: string): string => {
    if (isFacetKey(clave)) return PRESENTACION[clave].etiqueta(valor);
    switch (clave) {
      case 'rarity': return nombreDeRareza.get(valor) ?? valor;
      case 'owned': return valor === 'no' ? ES.rail.meFaltan : ES.rail.lasTengo;
      case 'q': return ES.catalogo.busqueda(valor);
      default: return valor;
    }
  };

  return (
    <div className="chips" role="group" aria-label={ES.catalogo.filtrosActivos}>
      {activos.map(({ clave, valor }) => {
        const texto = etiqueta(clave, valor);
        return (
          <button
            key={clave}
            type="button"
            className="chip"
            onClick={() => onQuitar(clave)}
            aria-label={ES.catalogo.quitarFiltro(texto)}
          >
            {texto} <span aria-hidden="true">{ES.simbolo.cerrar}</span>
          </button>
        );
      })}
      {activos.length > 1 && (
        <button type="button" className="chip-limpiar" onClick={onLimpiar}>
          {ES.catalogo.quitarTodos}
        </button>
      )}
    </div>
  );
}
```

- [ ] **13. La ficha: armazón compartido y cuerpo por juego** (`apps/web/src/components/FichaDeCarta.tsx`).

      - Importaciones (líneas 1-12):

```tsx
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameCode, PtcgGameData } from '@tcg/shared';
import { api, imageUrl, type CardDetail } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { consultaRarezas } from '../lib/consultas.js';
import { addCard, fromDeckDetail, toPayload } from '../lib/deck-draft.js';
import { estiloDeTipo } from '../lib/tipos-pokemon.js';
import { nivelDe } from '../lib/rareza.js';
import { ES } from '../i18n/es.js';
import { CartaConBrillo } from './apertura/CartaConBrillo.js';
```

      - Sustituir desde `function Contenido(` hasta el final de `textoDeMarca` (líneas 99-259) por:

```tsx
/**
 * La ficha de cada juego, en tres piezas (H9f). El armazon -- dialogo, URL,
 * foco, detalles comunes, mazo -- es comun; cada juego pone:
 *  - `cabecera`: lo que va DENTRO de `<header>`, bajo la linea de tipo
 *    (insignias, "evoluciona de", el coste de Magic);
 *  - `cuerpo`: lo que va entre la cabecera y los detalles (ataques, reglas...);
 *  - `detalles`: filas propias al principio de la lista de detalles (la marca
 *    de regulacion de Pokemon).
 * Con tres piezas el DOM de Pokemon queda EXACTAMENTE en el orden de T-094.
 */
type Pieza = (p: { carta: CardDetail }) => ReactElement | null;

interface PiezasDeFicha {
  cabecera: Pieza;
  cuerpo: Pieza;
  detalles: Pieza;
}

function Contenido({
  carta, juego, owned, idTitulo,
}: { carta: CardDetail; juego: GameCode; owned: boolean | null; idTitulo: string }) {
  const src = imageUrl(carta.imagePath);
  // Misma clave que el catalogo: llega de la cache, no hace otra peticion.
  const rarezas = useQuery(consultaRarezas(juego));
  const rareza = rarezas.data?.find((r) => r.code === carta.rarity)?.label ?? carta.rarity;
  const tier = rarezas.data?.find((r) => r.code === carta.rarity)?.tier ?? 0;
  const { cabecera: Cabecera, cuerpo: Cuerpo, detalles: Detalles } = FICHAS[juego];

  return (
    <div className="ficha-rejilla">
      <figure className="ficha-imagen">
        {src
          ? <CartaConBrillo imagePath={carta.imagePath} nombre={carta.name} nivel={nivelDe(juego, tier)} acabado="normal" />
          : <div className="miniatura-hueco" />}
      </figure>

      <div className="ficha-datos">
        <header className="ficha-cabecera">
          <p className="ficha-contexto">
            {ES.ficha.numeroEnSet(carta.setName, carta.collectorNumber)}
          </p>
          <h2 id={idTitulo}>{carta.name}</h2>
          {carta.typeLine && <p className="ficha-linea">{carta.typeLine}</p>}
          <Cabecera carta={carta} />
        </header>

        <Cuerpo carta={carta} />

        <dl className="ficha-detalles">
          <Detalles carta={carta} />
          {carta.releasedAt && (
            <div>
              <dt>{ES.ficha.publicadaEtiqueta}</dt>
              <dd>{carta.releasedAt}</dd>
            </div>
          )}
          <div>
            <dt>{ES.catalogo.columnas.rareza}</dt>
            <dd>{rareza}{ES.simbolo.separador}{carta.inBoosters ? ES.ficha.enSobres : ES.ficha.fueraDeSobres}</dd>
          </div>
          {carta.finishes.length > 0 && (
            <div>
              <dt>{ES.ficha.acabados}</dt>
              <dd>{carta.finishes.join(ES.simbolo.separador)}</dd>
            </div>
          )}
        </dl>

        {owned !== null && (
          <p className={owned ? 'ficha-tenencia tienes-si' : 'ficha-tenencia'}>
            {owned ? ES.ficha.laTienes : ES.ficha.noLaTienes}
          </p>
        )}

        <AnadirAMazo carta={carta} juego={juego} />
      </div>
    </div>
  );
}

/** El texto de la carta, linea a linea, con el titulo que le toque. */
function Reglas({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <section className="ficha-seccion">
      <h3>{titulo}</h3>
      {texto.split('\n').map((linea, i) => (
        <p key={i} className="ficha-texto">{linea}</p>
      ))}
    </section>
  );
}

/** Una pieza vacia: el juego no pone nada en ese hueco. */
function Nada(): null {
  return null;
}

const nombreDeTipo = (t: string) => ES.pokemon.tipo[t] ?? t;

/** Pokemon, dentro de la cabecera: los tipos, los PS y de quien evoluciona. Igual que en T-094. */
function CabeceraPtcg({ carta }: { carta: CardDetail }) {
  const datos = carta.gameData as PtcgGameData;
  const tipos = datos.types ?? [];
  return (
    <>
      <div className="ficha-insignias">
        {tipos.map((t) => (
          <span key={t} className="chip-tipo" style={estiloDeTipo(t)}>{nombreDeTipo(t)}</span>
        ))}
        {datos.hp !== undefined && (
          <span className="ficha-ps"><strong>{datos.hp}</strong> {ES.ficha.ps}</span>
        )}
      </div>
      {datos.evolves_from && <p className="ficha-linea">{ES.ficha.evolucionaDe(datos.evolves_from)}</p>}
    </>
  );
}

/** Pokemon, entre la cabecera y los detalles: habilidades, ataques, la tira y las reglas. */
function CuerpoPtcg({ carta }: { carta: CardDetail }) {
  const datos = carta.gameData as PtcgGameData;
  return (
    <>
      {datos.abilities && datos.abilities.length > 0 && (
        <section className="ficha-seccion">
          <h3>{ES.ficha.habilidades}</h3>
          {datos.abilities.map((h) => (
            <div key={h.name} className="ficha-ataque">
              <p className="ficha-ataque-nombre">
                {h.type && <span className="ficha-habilidad-tipo">{h.type}</span>} {h.name}
              </p>
              {h.text && <p className="ficha-texto">{h.text}</p>}
            </div>
          ))}
        </section>
      )}

      {datos.attacks && datos.attacks.length > 0 && (
        <section className="ficha-seccion">
          <h3>{ES.ficha.ataques}</h3>
          {datos.attacks.map((a, i) => (
            <div key={`${a.name}-${i}`} className="ficha-ataque">
              <p className="ficha-ataque-nombre">
                <Coste tipos={a.cost ?? []} nombre={nombreDeTipo} />
                <span>{a.name}</span>
                {a.damage && <span className="ficha-dano">{a.damage}</span>}
              </p>
              {a.text && <p className="ficha-texto">{a.text}</p>}
            </div>
          ))}
        </section>
      )}

      {/* Debilidad, resistencia y retirada son de los Pokemon: un Entrenador o
          una Energia no las tienen. El valor se compara con el de `i18n`
          porque lleva tilde y el codigo es ASCII. */}
      {datos.supertype !== undefined && ES.pokemon.ordenSupertipo[0] === datos.supertype && (
        <dl className="ficha-tira">
          <div>
            <dt>{ES.ficha.debilidad}</dt>
            <dd>{lista(datos.weaknesses, nombreDeTipo)}</dd>
          </div>
          <div>
            <dt>{ES.ficha.resistencia}</dt>
            <dd>{lista(datos.resistances, nombreDeTipo)}</dd>
          </div>
          <div>
            <dt>{ES.ficha.retirada}</dt>
            <dd>
              {datos.retreat_cost && datos.retreat_cost.length > 0
                ? <Coste tipos={datos.retreat_cost} nombre={nombreDeTipo} />
                : ES.ficha.ninguna}
            </dd>
          </div>
        </dl>
      )}

      <Reglas titulo={ES.ficha.reglas} texto={carta.rulesText} />
    </>
  );
}

/** Pokemon, primera fila de los detalles: la marca de regulacion, donde estaba. */
function DetallesPtcg({ carta }: { carta: CardDetail }) {
  const marca = typeof carta.facetas.mark === 'string' ? carta.facetas.mark : null;
  return (
    <div>
      <dt>{ES.ficha.marca}</dt>
      <dd>{textoDeMarca(marca, carta.releasedAt)}</dd>
    </div>
  );
}

/** Magic y Yu-Gi-Oh! hasta T-112 y T-113: el texto de la carta, sin mas. */
function ReglasDeLaCarta({ carta }: { carta: CardDetail }) {
  return <Reglas titulo={ES.ficha.reglas} texto={carta.rulesText} />;
}

const FICHAS: Readonly<Record<GameCode, PiezasDeFicha>> = {
  PTCG: { cabecera: CabeceraPtcg, cuerpo: CuerpoPtcg, detalles: DetallesPtcg },
  MTG: { cabecera: Nada, cuerpo: ReglasDeLaCarta, detalles: Nada },
  YGO: { cabecera: Nada, cuerpo: ReglasDeLaCarta, detalles: Nada },
};

/** El coste como fila de puntos del color de cada tipo, con su lectura en texto. */
function Coste({ tipos, nombre }: { tipos: string[]; nombre: (t: string) => string }) {
  return (
    <span className="coste" role="img" aria-label={ES.ficha.coste(tipos.map(nombre))}>
      {tipos.map((t, i) => (
        <span key={i} className="coste-punto" style={estiloDeTipo(t)} />
      ))}
    </span>
  );
}

function lista(
  valores: Array<{ type: string; value: string }> | undefined,
  nombre: (t: string) => string,
): string {
  if (!valores || valores.length === 0) return ES.ficha.ninguna;
  return valores.map((v) => `${nombre(v.type)} ${v.value}`).join(ES.simbolo.separador);
}

function textoDeMarca(marca: string | null, publicada: string | null): string {
  if (marca) return ES.pokemon.marca(marca);
  if (publicada && publicada < INICIO_DE_LAS_MARCAS) return ES.ficha.marcaAnterior(publicada.slice(0, 4));
  return ES.ficha.marcaNinguna;
}
```

        `FICHAS` va después de las funciones que nombra: sólo se lee al pintar, cuando el módulo ya
        está entero. Con las tres piezas, el DOM de la ficha de Pokémon queda en el mismo orden que en
        T-094: cabecera con tipos, PS y «evoluciona de»; habilidades, ataques, tira y reglas; y la marca
        de regulación como primera fila de los detalles.

- [ ] **14. Ver que pasa.** `npm test` → verde (incluye `tsc --build`, que comprueba que `CELDAS` y
      `PRESENTACION` cubren sus `Record`).

- [ ] **15. La suite E2E, Pokémon intacto** (criterio 1). Con la API de T-110 ya reconstruida:

```bash
# Docker. La imagen web lleva `packages/shared/dist` dentro; tras T-108 hay que reconstruirla,
# y la de la suite tambien (--build).
docker compose up -d --build api web
docker compose --profile e2e run --rm --build e2e

# Local: API reconstruida y reiniciada (T-110), Vite reiniciado (cambio en @tcg/shared).
cd e2e && E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test --reporter=line
```

      Esperado: **26 passed**, sin tocar ninguna prueba. Mirar además `/ptcg/catalogo?set=sv3pt5` en
      los dos temas: raíl con *Categoría · Tipo · Marca de regulación · Rareza*, tipos en orden
      canónico, «Sin marca» con su nota.

- [ ] **16. Commit:** `feat(web): catalog, rail and row driven by the facet profile (T-111)`

---

## T-112 · Magic: tokens de maná, celdas y ficha

**Ficheros**
- Crear: `apps/web/src/lib/mana.ts`, `apps/web/src/lib/mana.test.ts`,
  `apps/web/src/lib/colores-de-juego.ts`, `apps/web/src/components/Mana.tsx`
- Modificar: `tools/contraste-tokens.test.ts`, `apps/web/src/styles/tokens.css`,
  `apps/web/src/styles.css`, `apps/web/src/i18n/es.ts`, `apps/web/src/lib/facetas-web.ts`,
  `apps/web/src/components/celdas.tsx`, `apps/web/src/components/FichaDeCarta.tsx`

- [ ] **1. La prueba de contraste que falla.** En `tools/contraste-tokens.test.ts`, debajo de `TIPOS`:

```ts
/** Los cinco colores de Magic y el incoloro (H9f, F-9). */
const MANA = ['w', 'u', 'b', 'r', 'g', 'c'] as const;
```

      y dentro de `describe.each(...)`, después de la prueba de los tipos de Pokémon:

```ts
  it('los seis manas se ven sobre la superficie, y su letra se lee encima', () => {
    // El circulo es un grafico (1.4.11: 3:1 contra la superficie) y la letra de
    // dentro es texto (4,5:1 contra cada color).
    const flojos = MANA.flatMap((m) => {
      const color = valor(tema, `mana-${m}`);
      const circulo = razon(color, valor(tema, 'superficie'));
      const letra = razon(valor(tema, 'mana-tinta'), color);
      return [
        ...(circulo < 3 ? [`mana-${m} sobre superficie ${circulo.toFixed(2)}:1`] : []),
        ...(letra < 4.5 ? [`letra sobre mana-${m} ${letra.toFixed(2)}:1`] : []),
      ];
    });
    expect(flojos).toEqual([]);
  });
```

- [ ] **2. Ver que falla.** `npx vitest run tools/contraste-tokens` → FAIL con
      `el token --mana-w no existe en este tema`.

- [ ] **3. Los tokens** (`apps/web/src/styles/tokens.css`). En `:root`, justo después de
      `--tipo-hada: #e07ab4;`:

```css
  /* ------------------------------------------------- mana de Magic (H9f)
   * Los cinco colores y el incoloro, pintados en CSS a partir de "{2}{B}": nada
   * de imagenes de terceros (F-9, P-001). El circulo es un grafico (3:1 contra
   * la superficie) y la letra de encima es texto (4,5:1 contra cada color). En
   * oscuro el negro es un gris lila: un circulo negro sobre negro no se ve. */
  --mana-w: #efe3bf;
  --mana-u: #6fb3ea;
  --mana-b: #b9a8cf;
  --mana-r: #f08a6c;
  --mana-g: #6cc08a;
  --mana-c: #bdb7ad;
  --mana-tinta: #141722;
```

      Y en **los dos** bloques claros (el del `@media` y el de `[data-tema="claro"]`), justo después de
      `--tipo-hada: #a82f74;` (aparece dos veces: en las dos), los mismos nombres:

```css
    --mana-w: #7d6a26;
    --mana-u: #1d62a0;
    --mana-b: #3f3650;
    --mana-r: #a8361c;
    --mana-g: #226b3c;
    --mana-c: #5f5b55;
    --mana-tinta: #ffffff;
```

      Medido al escribir el plan: oscuro, círculo contra superficie entre 7,28 y 13,96:1 y letra entre
      7,28 y 13,96:1; claro, entre 5,30 y 11,32:1 los dos.

- [ ] **4. Ver que pasa.** `npx vitest run tools/contraste-tokens` → verde, incluida «los dos bloques
      de tema claro dicen exactamente lo mismo».

- [ ] **5. La prueba del coste en maná** (`apps/web/src/lib/mana.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { leerCoste, partirCoste } from './mana.js';
import { ES } from '../i18n/es.js';

describe('el coste en mana de Magic, de "{2}{B}" a simbolos (H9f, F-9)', () => {
  it('cada simbolo es un circulo: generico con su cifra, de color con su letra', () => {
    expect(partirCoste('{2}{B}')).toEqual([[
      { crudo: '2', texto: '2', colores: [] },
      { crudo: 'B', texto: 'B', colores: ['b'] },
    ]]);
  });

  it('una carta de dos caras da dos costes, separados (spec 6)', () => {
    const caras = partirCoste('{1}{R}{R} // {1}{R}');
    expect(caras).toHaveLength(2);
    expect(caras[1]!.map((s) => s.crudo)).toEqual(['1', 'R']);
  });

  it('hibrido de dos colores: circulo partido sin letra; pirexiano: el color con su P', () => {
    expect(partirCoste('{G/W}')[0]![0]).toEqual({ crudo: 'G/W', texto: '', colores: ['g', 'w'] });
    expect(partirCoste('{B/P}')[0]![0]).toEqual({ crudo: 'B/P', texto: 'P', colores: ['b'] });
    expect(partirCoste('{2/W}')[0]![0]).toEqual({ crudo: '2/W', texto: '2', colores: ['w'] });
  });

  it('sin coste no hay simbolos', () => {
    expect(partirCoste(null)).toEqual([]);
    expect(partirCoste('')).toEqual([]);
  });

  it('se lee en voz alta, cara a cara', () => {
    expect(leerCoste(partirCoste('{2}{B}'))).toEqual(['2', ES.mana.nombre.B]);
    expect(leerCoste(partirCoste('{G/W}'))).toEqual([`${ES.mana.nombre.G}${ES.mana.o}${ES.mana.nombre.W}`]);
    expect(leerCoste(partirCoste('{B/P}'))).toEqual([ES.mana.pirexiano(ES.mana.nombre.B!)]);
    expect(leerCoste(partirCoste('{1}{R} // {R}'))).toEqual(['1', ES.mana.nombre.R, ES.mana.otraCara, ES.mana.nombre.R]);
  });
});
```

- [ ] **6. Ver que falla.** `npx vitest run apps/web/src/lib/mana` → FAIL: no resuelve `./mana.js`.

- [ ] **7. El texto** (`apps/web/src/i18n/es.ts`):

      - En `simbolo`, después de `cerrar: '×',`:

```ts
    /** Entre los dos costes de una carta de dos caras. */
    caras: ' // ',
```

      - En `ficha`, después de `fr: …`:

```ts
    fuerzaResistencia: 'Fuerza/Resistencia',
    lealtad: 'Lealtad',
    otraCara: 'Esta carta tiene otra cara; aquí se muestra la primera.',
```

      - Un bloque nuevo, después de `facetas`:

```ts
  /** El coste en maná de Magic, en voz alta (H9f). */
  mana: {
    nombre: {
      W: 'blanco', U: 'azul', B: 'negro', R: 'rojo', G: 'verde', C: 'incoloro', S: 'nieve',
    } as Record<string, string>,
    o: ' o ',
    pirexiano: (color: string) => `${color} pirexiano`,
    otraCara: 'y en la otra cara',
  },
```

- [ ] **8. El módulo** (`apps/web/src/lib/mana.ts`):

```ts
import { ES } from '../i18n/es.js';

/**
 * El coste en mana de Magic, de la notacion de Scryfall ("{2}{B} // {B}") a
 * simbolos que el CSS pinta como circulos (H9f, F-9). Nada de imagenes: P-001.
 */
export type ColorDeMana = 'w' | 'u' | 'b' | 'r' | 'g';

export interface SimboloDeMana {
  /** El simbolo tal como llega, sin llaves: "2", "B", "G/W", "B/P". */
  crudo: string;
  /** Lo que se escribe dentro del circulo. Vacio en un hibrido de dos colores. */
  texto: string;
  /** Sus colores: ninguno (generico), uno, o dos (hibrido, circulo partido). */
  colores: ColorDeMana[];
}

const COLOR: Readonly<Record<string, ColorDeMana>> = { W: 'w', U: 'u', B: 'b', R: 'r', G: 'g' };

/** Una lista de simbolos por cara. Las de dos caras traen " // " entre costes. */
export function partirCoste(coste: string | null | undefined): SimboloDeMana[][] {
  if (!coste) return [];
  return coste.split(' // ').map((cara) => [...cara.matchAll(/\{([^}]+)\}/g)].map((m) => simbolo(m[1]!)));
}

function simbolo(crudo: string): SimboloDeMana {
  const partes = crudo.split('/');
  const colores = partes.map((p) => COLOR[p]).filter((c): c is ColorDeMana => c !== undefined);
  const resto = partes.filter((p) => COLOR[p] === undefined);
  // Monocolor: su letra. Hibrido de dos colores: el circulo partido ya lo dice.
  // Pirexiano o hibrido con generico: lo que no es color ("P", "2").
  const texto = colores.length === 2 ? '' : colores.length === 1 && resto.length === 0 ? crudo : resto.join('/');
  return { crudo, texto, colores };
}

/** La lectura de cada simbolo, para el nombre accesible del coste. */
export function leerCoste(caras: SimboloDeMana[][]): string[] {
  return caras.flatMap((cara, i) => [...(i > 0 ? [ES.mana.otraCara] : []), ...cara.map(leerSimbolo)]);
}

function leerSimbolo(s: SimboloDeMana): string {
  const partes = s.crudo.split('/');
  const nombres = partes.filter((p) => p !== 'P').map((p) => ES.mana.nombre[p] ?? p);
  const base = nombres.join(ES.mana.o);
  return partes.includes('P') ? ES.mana.pirexiano(base) : base;
}
```

- [ ] **9. Ver que pasa.** `npx vitest run apps/web/src/lib/mana` → 5 passed.

- [ ] **10. El color de cada maná, para el raíl** (`apps/web/src/lib/colores-de-juego.ts`):

```ts
import type { CSSProperties } from 'react';

/**
 * Del valor de una faceta al token que lo pinta (H9f), con la misma forma que
 * `tipos-pokemon.ts`: deja el color en `--tipo` y el CSS lo usa donde quiera.
 * Solo tokens medidos por `tools/contraste-tokens.test.ts`.
 */
const MANA: Readonly<Record<string, string>> = { W: 'w', U: 'u', B: 'b', R: 'r', G: 'g', C: 'c' };

export function estiloDeMana(valor: string | null): CSSProperties | undefined {
  const token = valor ? MANA[valor] : undefined;
  return token ? ({ '--tipo': `var(--mana-${token})` } as CSSProperties) : undefined;
}
```

      Y en `apps/web/src/lib/facetas-web.ts`, importar `estiloDeMana` de `./colores-de-juego.js` y:

```ts
// antes
  color: { titulo: () => ES.facetas.titulo.color, etiqueta: de(ES.facetas.color) },
// despues
  color: { titulo: () => ES.facetas.titulo.color, etiqueta: de(ES.facetas.color), estilo: estiloDeMana },
```

- [ ] **11. Los símbolos** (`apps/web/src/components/Mana.tsx`):

```tsx
import type { CSSProperties } from 'react';
import { leerCoste, partirCoste, type SimboloDeMana } from '../lib/mana.js';
import { ES } from '../i18n/es.js';

/** Los colores del circulo: uno, o dos para el hibrido. Sin color, el incoloro del CSS. */
function estilo(s: SimboloDeMana): CSSProperties | undefined {
  const [a, b] = s.colores;
  if (!a) return undefined;
  return { '--mana-1': `var(--mana-${a})`, '--mana-2': `var(--mana-${b ?? a})` } as CSSProperties;
}

/**
 * El coste en mana como circulos con su letra (H9f, F-9). Una sola imagen para
 * el lector de pantalla, con el coste leido: "Coste: 2, negro".
 */
export function Mana({ coste }: { coste: string }) {
  const caras = partirCoste(coste);
  if (caras.every((c) => c.length === 0)) return null;
  return (
    <span className="mana" role="img" aria-label={ES.ficha.coste(leerCoste(caras))}>
      {caras.map((cara, i) => (
        <span key={i} className="mana-cara" aria-hidden="true">
          {i > 0 && <span className="mana-caras">{ES.simbolo.caras}</span>}
          {cara.map((s, j) => (
            <span key={j} className="mana-simbolo" style={estilo(s)}>{s.texto}</span>
          ))}
        </span>
      ))}
    </span>
  );
}
```

- [ ] **12. El CSS** (`apps/web/src/styles.css`). Después de la regla `.chip-tipo::before`:

```css
/* ------------------------------------------------- simbolos de mana (H9f)
 * Un circulo por simbolo, con su letra. El hibrido es un circulo partido en
 * diagonal: `--mana-1` y `--mana-2` los pone el componente, y sin color cae al
 * incoloro. */
.mana { display: inline-flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.mana-cara { display: inline-flex; align-items: center; gap: 2px; }
.mana-simbolo {
  inline-size: 17px; block-size: 17px; border-radius: 50%;
  display: inline-grid; place-items: center;
  font: 700 10px/1 var(--fuente-datos); color: var(--mana-tinta);
  background: linear-gradient(
    135deg,
    var(--mana-1, var(--mana-c)) 50%,
    var(--mana-2, var(--mana-1, var(--mana-c))) 50%
  );
  box-shadow: inset 0 0 0 1px var(--velo-suave);
}
.mana-caras { color: var(--texto-tenue); font-size: var(--paso-00); padding-inline: 2px; }
.ficha-insignias .mana-simbolo { inline-size: 22px; block-size: 22px; font-size: 12px; }
.col-mana { inline-size: 7em; }
.col-fr { inline-size: 4.5em; text-align: center; }
.tabla-consulta th.col-fr { text-align: center; }
```

      Y en el `@media (max-width: 640px)` de la tabla:

```css
/* antes */
  .tabla-consulta .col-ps, .tabla-consulta .col-rareza, .tabla-consulta .col-marca { display: none; }
/* despues */
  .tabla-consulta .col-ps, .tabla-consulta .col-rareza, .tabla-consulta .col-marca,
  .tabla-consulta .col-fr { display: none; }
```

- [ ] **13. La celda** (`apps/web/src/components/celdas.tsx`). Importar `Mana` de `./Mana.js` y:

```tsx
// antes
  manaCost: ({ carta }) => <Td celda="manaCost">{texto(carta.facetas.manaCost) ?? <Vacio />}</Td>,
// despues
  manaCost: ({ carta }) => {
    const c = texto(carta.facetas.manaCost);
    return <Td celda="manaCost">{c ? <Mana coste={c} /> : <Vacio />}</Td>;
  },
```

- [ ] **14. La ficha de Magic** (`apps/web/src/components/FichaDeCarta.tsx`). Añadir `MtgGameData` a
      la importación de tipos de `@tcg/shared`, importar `Mana` de `./Mana.js`, y antes de
      `ReglasDeLaCarta`:

```tsx
/** Scryfall separa en el texto de reglas las dos caras con una linea "//". */
const OTRA_CARA_EN_REGLAS = '\n//\n';

/**
 * Magic, dentro de la cabecera (H9f): coste, F/R o lealtad, y una nota si hay
 * otra cara. La otra cara completa queda fuera del spec: se avisa y se ensena
 * la primera.
 */
function CabeceraMtg({ carta }: { carta: CardDetail }) {
  const datos = carta.gameData as MtgGameData;
  const dosCaras = (carta.typeLine ?? '').includes(' // ');
  return (
    <>
      <div className="ficha-insignias">
        {datos.mana_cost && <Mana coste={datos.mana_cost} />}
        {datos.power !== undefined && datos.toughness !== undefined && (
          <span className="ficha-ps">
            <strong>{ES.ficha.fr(datos.power, datos.toughness)}</strong> {ES.ficha.fuerzaResistencia}
          </span>
        )}
        {datos.loyalty !== undefined && (
          <span className="ficha-ps"><strong>{datos.loyalty}</strong> {ES.ficha.lealtad}</span>
        )}
      </div>
      {dosCaras && <p className="ficha-linea">{ES.ficha.otraCara}</p>}
    </>
  );
}

/** Magic, el cuerpo: las reglas de la primera cara. */
function CuerpoMtg({ carta }: { carta: CardDetail }) {
  const reglas = carta.rulesText ? carta.rulesText.split(OTRA_CARA_EN_REGLAS)[0] ?? null : null;
  return <Reglas titulo={ES.ficha.reglas} texto={reglas} />;
}
```

      y en `FICHAS`:

```tsx
// antes
  MTG: { cabecera: Nada, cuerpo: ReglasDeLaCarta, detalles: Nada },
// despues
  MTG: { cabecera: CabeceraMtg, cuerpo: CuerpoMtg, detalles: Nada },
```

- [ ] **15. Ver que pasa.** `npm test` → verde. Mirar `/mtg/catalogo?set=ecl` todavía no se puede (la
      ruta llega en T-114): mirarlo al cerrar T-114.

- [ ] **16. Commit:** `feat(web): Magic catalog cells, mana symbols and card sheet (T-112)`

---

## T-113 · Yu-Gi-Oh!: tokens de atributo, nivel/rango/link, celdas y ficha

**Ficheros**
- Crear: `apps/web/src/lib/ygo.ts`, `apps/web/src/lib/ygo.test.ts`, `apps/web/src/components/NivelYgo.tsx`
- Modificar: `tools/contraste-tokens.test.ts`, `apps/web/src/styles/tokens.css`,
  `apps/web/src/styles.css`, `apps/web/src/i18n/es.ts`, `apps/web/src/lib/colores-de-juego.ts`,
  `apps/web/src/lib/facetas-web.ts`, `apps/web/src/components/celdas.tsx`,
  `apps/web/src/components/FichaDeCarta.tsx`

- [ ] **1. La prueba de contraste que falla.** En `tools/contraste-tokens.test.ts`, debajo de `MANA`:

```ts
/** Los siete atributos de Yu-Gi-Oh! (H9f): pintan la chip del atributo, que es texto. */
const ATRIBUTOS = ['oscuridad', 'luz', 'tierra', 'agua', 'fuego', 'viento', 'divinidad'] as const;
```

      y dentro de `describe.each(...)`, después de la prueba del maná:

```ts
  it('los siete atributos se leen como texto sobre la superficie y sobre el fondo', () => {
    const flojos = ATRIBUTOS.flatMap((a) =>
      (['superficie', 'fondo'] as const)
        .map((f) => ({ f, r: razon(valor(tema, `atributo-${a}`), valor(tema, f)) }))
        .filter((x) => x.r < 4.5)
        .map((x) => `atributo-${a} sobre ${x.f} ${x.r.toFixed(2)}:1`),
    );
    expect(flojos).toEqual([]);
  });
```

- [ ] **2. Ver que falla.** `npx vitest run tools/contraste-tokens` → FAIL con
      `el token --atributo-oscuridad no existe en este tema`.

- [ ] **3. Los tokens.** En `:root`, después de `--mana-tinta: #141722;`:

```css
  /* --------------------------------------------- atributos de Yu-Gi-Oh! (H9f)
   * Pintan texto -- la chip del atributo, en la fila y en la ficha --: 4,5:1
   * contra la superficie y contra el fondo, en los dos temas. */
  --atributo-oscuridad: #b49ad6;
  --atributo-luz: #e3cf6a;
  --atributo-tierra: #c9a46a;
  --atributo-agua: #5fb0e8;
  --atributo-fuego: #ef7d5c;
  --atributo-viento: #6cc79a;
  --atributo-divinidad: #e8b84f;
```

      Y en los dos bloques claros, después de `--mana-tinta: #ffffff;` (dos veces):

```css
    --atributo-oscuridad: #5e3d8c;
    --atributo-luz: #7a6608;
    --atributo-tierra: #7a5418;
    --atributo-agua: #1b5f94;
    --atributo-fuego: #a63a1a;
    --atributo-viento: #1f6e47;
    --atributo-divinidad: #86600c;
```

      Medido al escribir el plan: oscuro, entre 6,60 y 12,77:1; claro, entre 5,01 y 8,33:1.

- [ ] **4. Ver que pasa.** `npx vitest run tools/contraste-tokens` → verde.

- [ ] **5. La prueba de nivel, rango y link** (`apps/web/src/lib/ygo.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { cifraDeCombate, marcaDeNivel } from './ygo.js';
import { ES } from '../i18n/es.js';

describe('nivel, rango y link de Yu-Gi-Oh! (H9f)', () => {
  it('un Link es link aunque traiga nivel (F-6: hay 110 asi)', () => {
    expect(marcaDeNivel('link', 4, 2)).toEqual({ clase: 'link', valor: 2 });
  });

  it('el rango de los Xyz va en `level`, y se pinta como rango', () => {
    expect(marcaDeNivel('xyz', 4, null)).toEqual({ clase: 'rango', valor: 4 });
    expect(marcaDeNivel('effect', 4, null)).toEqual({ clase: 'nivel', valor: 4 });
  });

  it('una magica o una trampa no tiene ninguno', () => {
    expect(marcaDeNivel(null, null, null)).toBeNull();
    expect(marcaDeNivel('link', null, null)).toBeNull();
  });

  it('el ATK -1 es el "?" (85 cartas)', () => {
    expect(cifraDeCombate(-1)).toBe(ES.simbolo.desconocido);
    expect(cifraDeCombate(2500)).toBe('2500');
    expect(cifraDeCombate(null)).toBeNull();
    expect(cifraDeCombate(undefined)).toBeNull();
  });
});
```

- [ ] **6. Ver que falla.** `npx vitest run apps/web/src/lib/ygo` → FAIL: no resuelve `./ygo.js`.

- [ ] **7. El texto** (`apps/web/src/i18n/es.ts`):

      - En `simbolo`, después de `caras: ' // ',`:

```ts
    /** El ATK o DEF variable: la base lo guarda como -1. */
    desconocido: '?',
```

      - En `ficha`, después de `otraCara: …`:

```ts
    efecto: 'Efecto',
    atk: 'ATK',
    def: 'DEF',
    escala: 'Escala de péndulo',
```

      - Un bloque nuevo, después de `mana`:

```ts
  /** Nivel, rango, link y flechas de Yu-Gi-Oh! (H9f). */
  ygo: {
    nivel: (n: number) => `Nivel ${n}`,
    rango: (n: number) => `Rango ${n}`,
    link: (n: number) => `Link ${n}`,
    /** Lo que se ve en la fila: estrella llena el nivel, hueca el rango. */
    corto: {
      nivel: (n: number) => `★${n}`,
      rango: (n: number) => `☆${n}`,
      link: (n: number) => `LINK-${n}`,
    },
    flecha: {
      'Top-Left': 'arriba a la izquierda', Top: 'arriba', 'Top-Right': 'arriba a la derecha',
      Left: 'izquierda', Right: 'derecha',
      'Bottom-Left': 'abajo a la izquierda', Bottom: 'abajo', 'Bottom-Right': 'abajo a la derecha',
    } as Record<string, string>,
    flechas: (lista: string[]) => `Flechas: ${lista.join(', ')}`,
  },
```

- [ ] **8. El módulo** (`apps/web/src/lib/ygo.ts`):

```ts
import { ES } from '../i18n/es.js';

/** Que marca lleva un monstruo: nivel (estrellas), rango (Xyz) o link. */
export type ClaseDeNivel = 'nivel' | 'rango' | 'link';

export interface MarcaDeNivel {
  clase: ClaseDeNivel;
  valor: number;
}

/**
 * La marca de un monstruo a partir de su marco.
 *
 * EL LINK MANDA SOBRE `level`: 110 monstruos Link traen tambien `level`, y sin
 * este orden saldrian con estrellas (F-6). El RANGO de los Xyz llega en
 * `level`: YGOPRODeck usa el mismo campo para los dos.
 */
export function marcaDeNivel(frame: string | null, level: number | null, linkVal: number | null): MarcaDeNivel | null {
  if (frame === 'link') return linkVal === null ? null : { clase: 'link', valor: linkVal };
  if (level === null) return null;
  return { clase: frame === 'xyz' ? 'rango' : 'nivel', valor: level };
}

/** ATK o DEF como se leen: -1 es el "?" de las cartas de ATK variable. */
export function cifraDeCombate(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  return n === -1 ? ES.simbolo.desconocido : String(n);
}

/** Las ocho flechas de un Link, en el orden de una rejilla de 3x3; el centro es null. */
export const FLECHAS = [
  'Top-Left', 'Top', 'Top-Right',
  'Left', null, 'Right',
  'Bottom-Left', 'Bottom', 'Bottom-Right',
] as const;
```

- [ ] **9. Ver que pasa.** `npx vitest run apps/web/src/lib/ygo` → 4 passed.

- [ ] **10. Los componentes** (`apps/web/src/components/NivelYgo.tsx`):

```tsx
import { FLECHAS, marcaDeNivel } from '../lib/ygo.js';
import { ES } from '../i18n/es.js';

/**
 * Nivel, rango o link (H9f): una sola imagen para el lector de pantalla
 * ("Rango 4"), y a la vista estrella llena, estrella hueca o "LINK-2".
 */
export function NivelYgo({ frame, level, linkVal }: { frame: string | null; level: number | null; linkVal: number | null }) {
  const marca = marcaDeNivel(frame, level, linkVal);
  if (!marca) return <span className="tenue">{ES.simbolo.vacio}</span>;
  return (
    <span className={`nivel-ygo nivel-ygo-${marca.clase}`} role="img" aria-label={ES.ygo[marca.clase](marca.valor)}>
      <span aria-hidden="true">{ES.ygo.corto[marca.clase](marca.valor)}</span>
    </span>
  );
}

/** Las flechas de un Link en su rejilla de 3x3, con el valor en el centro. Dibujadas en CSS. */
export function FlechasLink({ activas, valor }: { activas: readonly string[]; valor: number }) {
  return (
    <span className="flechas-link" role="img" aria-label={ES.ygo.flechas(activas.map((f) => ES.ygo.flecha[f] ?? f))}>
      {FLECHAS.map((f, i) =>
        f === null ? (
          <span key={i} className="flechas-centro" aria-hidden="true">{valor}</span>
        ) : (
          <span key={f} className="flecha" data-direccion={f} data-activa={activas.includes(f)} aria-hidden="true" />
        ),
      )}
    </span>
  );
}
```

      Y en `apps/web/src/lib/colores-de-juego.ts`, al final:

```ts
const ATRIBUTO: Readonly<Record<string, string>> = {
  DARK: 'oscuridad', LIGHT: 'luz', EARTH: 'tierra', WATER: 'agua',
  FIRE: 'fuego', WIND: 'viento', DIVINE: 'divinidad',
};

export function estiloDeAtributo(valor: string | null): CSSProperties | undefined {
  const token = valor ? ATRIBUTO[valor] : undefined;
  return token ? ({ '--tipo': `var(--atributo-${token})` } as CSSProperties) : undefined;
}
```

      En `apps/web/src/lib/facetas-web.ts`, importar también `estiloDeAtributo` y:

```ts
// antes
  attribute: { titulo: () => ES.facetas.titulo.atributo, etiqueta: de(ES.facetas.attribute) },
// despues
  attribute: {
    titulo: () => ES.facetas.titulo.atributo, etiqueta: de(ES.facetas.attribute), estilo: estiloDeAtributo,
  },
```

- [ ] **11. El CSS** (`apps/web/src/styles.css`), después del bloque de maná:

```css
/* ------------------------------------- nivel, rango y link de Yu-Gi-Oh! (H9f) */
.nivel-ygo { font-variant-numeric: tabular-nums; white-space: nowrap; }
.nivel-ygo-rango { color: var(--texto-tenue); }
.nivel-ygo-link { font-family: var(--fuente-datos); font-size: 11.5px; font-weight: 700; }
.flechas-link {
  display: inline-grid; grid-template-columns: repeat(3, 12px); grid-template-rows: repeat(3, 12px);
  gap: 2px; vertical-align: middle;
}
.flecha { background: var(--borde); }
.flecha[data-activa="true"] { background: var(--juego-acento, var(--acento)); }
.flecha[data-direccion="Top"] { clip-path: polygon(50% 15%, 90% 85%, 10% 85%); }
.flecha[data-direccion="Bottom"] { clip-path: polygon(10% 15%, 90% 15%, 50% 85%); }
.flecha[data-direccion="Left"] { clip-path: polygon(15% 50%, 85% 10%, 85% 90%); }
.flecha[data-direccion="Right"] { clip-path: polygon(15% 10%, 85% 50%, 15% 90%); }
.flecha[data-direccion="Top-Left"] { clip-path: polygon(10% 10%, 90% 10%, 10% 90%); }
.flecha[data-direccion="Top-Right"] { clip-path: polygon(10% 10%, 90% 10%, 90% 90%); }
.flecha[data-direccion="Bottom-Left"] { clip-path: polygon(10% 10%, 90% 90%, 10% 90%); }
.flecha[data-direccion="Bottom-Right"] { clip-path: polygon(90% 10%, 90% 90%, 10% 90%); }
.flechas-centro { display: grid; place-items: center; font: 700 10px/1 var(--fuente-datos); color: var(--texto); }
.col-atributo { inline-size: 7.5em; }
.col-nivel { inline-size: 5em; }
.col-atkdef { inline-size: 7em; text-align: right; }
.tabla-consulta th.col-atkdef { text-align: right; }
```

      Y en el `@media (max-width: 640px)`, añadir `.tabla-consulta .col-atkdef` y
      `.tabla-consulta .col-nivel` a la lista que se oculta.

- [ ] **12. Las celdas** (`apps/web/src/components/celdas.tsx`). Importar
      `estiloDeAtributo` de `../lib/colores-de-juego.js`, `cifraDeCombate` de `../lib/ygo.js` y
      `NivelYgo` de `./NivelYgo.js`, y sustituir tres pintores:

```tsx
// antes
  attribute: ({ carta }) => {
    const a = texto(carta.facetas.attribute);
    return <Td celda="attribute">{a ? ES.facetas.attribute[a] ?? a : <Vacio />}</Td>;
  },
// despues
  attribute: ({ carta }) => {
    const a = texto(carta.facetas.attribute);
    return (
      <Td celda="attribute">
        {a ? <span className="chip-tipo" style={estiloDeAtributo(a)}>{ES.facetas.attribute[a] ?? a}</span> : <Vacio />}
      </Td>
    );
  },
```

```tsx
// antes
  levelRankLink: ({ carta }) => {
    const f = carta.facetas;
    const n = texto(f.frame === 'link' ? f.linkVal : f.level);
    return <Td celda="levelRankLink">{n ?? <Vacio />}</Td>;
  },
// despues
  levelRankLink: ({ carta }) => {
    const f = carta.facetas;
    const numero = (v: string | number | null | undefined) => (typeof v === 'number' ? v : null);
    return (
      <Td celda="levelRankLink">
        <NivelYgo frame={texto(f.frame)} level={numero(f.level)} linkVal={numero(f.linkVal)} />
      </Td>
    );
  },
```

```tsx
// antes
    const a = texto(carta.facetas.atk);
    const d = texto(carta.facetas.def);
// despues
    const numero = (v: string | number | null | undefined) => (typeof v === 'number' ? v : null);
    const a = cifraDeCombate(numero(carta.facetas.atk));
    const d = cifraDeCombate(numero(carta.facetas.def));
```

- [ ] **13. La ficha de Yu-Gi-Oh!** (`apps/web/src/components/FichaDeCarta.tsx`). Añadir
      `YgoGameData` a la importación de tipos, importar `estiloDeAtributo`, `cifraDeCombate`,
      `NivelYgo` y `FlechasLink`, y antes de `ReglasDeLaCarta`:

```tsx
/**
 * Yu-Gi-Oh!, dentro de la cabecera (H9f): atributo, nivel/rango/link con sus
 * flechas (solo aqui: en la fila es "LINK-n"), y la raza con la clase.
 */
function CabeceraYgo({ carta }: { carta: CardDetail }) {
  const datos = carta.gameData as YgoGameData;
  const frame = typeof carta.facetas.frame === 'string' ? carta.facetas.frame : null;
  const kind = typeof carta.facetas.kind === 'string' ? carta.facetas.kind : null;
  return (
    <>
      <div className="ficha-insignias">
        {datos.attribute && (
          <span className="chip-tipo" style={estiloDeAtributo(datos.attribute)}>
            {ES.facetas.attribute[datos.attribute] ?? datos.attribute}
          </span>
        )}
        <NivelYgo frame={frame} level={datos.level ?? null} linkVal={datos.link_val ?? null} />
        {frame === 'link' && datos.link_markers && datos.link_val !== undefined && (
          <FlechasLink activas={datos.link_markers} valor={datos.link_val} />
        )}
      </div>
      <p className="ficha-linea">
        {ES.catalogo.tipoYgo(datos.race ?? null, kind ? ES.facetas.kind[kind] ?? kind : null)}
      </p>
    </>
  );
}

/** Yu-Gi-Oh!, el cuerpo: el efecto, y ATK/DEF con el "?" del -1 y la escala del pendulo. */
function CuerpoYgo({ carta }: { carta: CardDetail }) {
  const datos = carta.gameData as YgoGameData;
  const kind = typeof carta.facetas.kind === 'string' ? carta.facetas.kind : null;
  return (
    <>
      <Reglas titulo={ES.ficha.efecto} texto={carta.rulesText} />
      {kind === 'monster' && (
        <dl className="ficha-tira">
          <div>
            <dt>{ES.ficha.atk}</dt>
            <dd>{cifraDeCombate(datos.atk) ?? ES.simbolo.vacio}</dd>
          </div>
          <div>
            <dt>{ES.ficha.def}</dt>
            <dd>{cifraDeCombate(datos.def) ?? ES.simbolo.vacio}</dd>
          </div>
          {datos.scale !== undefined && (
            <div>
              <dt>{ES.ficha.escala}</dt>
              <dd>{datos.scale}</dd>
            </div>
          )}
        </dl>
      )}
    </>
  );
}
```

      y en `FICHAS`:

```tsx
// antes
  YGO: { cabecera: Nada, cuerpo: ReglasDeLaCarta, detalles: Nada },
// despues
  YGO: { cabecera: CabeceraYgo, cuerpo: CuerpoYgo, detalles: Nada },
```

      `ReglasDeLaCarta` ya no lo usa nadie: borrarlo.

- [ ] **14. Ver que pasa.** `npm test` → verde.

- [ ] **15. Commit:** `feat(web): Yu-Gi-Oh! attributes, level/rank/link and card sheet (T-113)`

---

## T-114 · La portada por año, las rutas y el inicio

**Ficheros**
- Crear: `apps/web/src/lib/juegos.ts`, `apps/web/src/lib/juegos.test.ts`, `apps/web/src/lib/anios.ts`,
  `apps/web/src/lib/anios.test.ts`, `apps/web/src/pages/PortadaPorAnio.tsx`
- Modificar: `apps/web/src/App.tsx`, `apps/web/src/layouts/JuegoLayout.tsx`,
  `apps/web/src/pages/Inicio.tsx`, `apps/web/src/i18n/es.ts`

- [ ] **1. Las pruebas que fallan.** `apps/web/src/lib/juegos.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { juegoDeRuta } from './juegos.js';

describe('el juego de una ruta (H9f)', () => {
  it('lo dice el primer segmento', () => {
    expect(juegoDeRuta('/mtg')).toBe('MTG');
    expect(juegoDeRuta('/ygo/catalogo')).toBe('YGO');
    expect(juegoDeRuta('/ptcg/catalogo')).toBe('PTCG');
  });

  it('fuera de un juego no hay juego', () => {
    expect(juegoDeRuta('/')).toBeNull();
    expect(juegoDeRuta('/mazos')).toBeNull();
    expect(juegoDeRuta('/mtgx')).toBeNull();
  });
});
```

      `apps/web/src/lib/anios.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { agruparPorAnio } from './anios.js';
import type { SetSummary } from './api.js';

const set = (id: number, releasedAt: string | null): SetSummary => ({
  id, externalId: `s${id}`, code: `S${id}`, name: `Set ${id}`, releasedAt, cardCount: 10,
  isOpenable: true, iconPath: null, poolSize: 10, palette: null, artKey: null,
});

describe('la portada por anio de salida (H9f, F-8)', () => {
  it('del mas reciente al mas antiguo, respetando el orden de dentro', () => {
    const g = agruparPorAnio([set(3, '2024-08-02'), set(1, '1993-08-05'), set(2, '2024-02-09')]);
    expect(g.map((x) => x.anio)).toEqual(['2024', '1993']);
    expect(g[0]!.sets.map((s) => s.id)).toEqual([3, 2]);
  });

  it('un set sin fecha va al final, en su propio grupo', () => {
    const g = agruparPorAnio([set(1, null), set(2, '2010-01-01')]);
    expect(g.map((x) => x.anio)).toEqual(['2010', null]);
  });
});
```

- [ ] **2. Ver que fallan.** `npx vitest run apps/web/src/lib/juegos apps/web/src/lib/anios` → FAIL.

- [ ] **3. Los módulos.** `apps/web/src/lib/juegos.ts`:

```ts
import type { GameCode } from '@tcg/shared';

/** El segmento de ruta de cada juego, y su `data-juego` (T-090). */
export const SEGMENTO: Readonly<Record<GameCode, 'mtg' | 'ygo' | 'ptcg'>> = {
  MTG: 'mtg',
  YGO: 'ygo',
  PTCG: 'ptcg',
};

/** El juego de una ruta, por su primer segmento. `null` fuera de un juego. */
export function juegoDeRuta(ruta: string): GameCode | null {
  const m = /^\/(mtg|ygo|ptcg)(?:\/|$)/.exec(ruta);
  if (!m) return null;
  return (Object.keys(SEGMENTO) as GameCode[]).find((g) => SEGMENTO[g] === m[1]) ?? null;
}
```

      `apps/web/src/lib/anios.ts`:

```ts
import type { SetSummary } from './api.js';

/**
 * Los sets de un juego agrupados por anio de salida (H9f, F-8).
 *
 * En Magic las epocas de `pack_templates` describen el PRODUCTO -- clasico,
 * Draft Booster, Play Booster -- y no le dicen a nadie donde esta un set; el
 * anio si. Pokemon conserva su portada por epocas.
 *
 * Comparacion de cadenas `YYYY`, como `epocas.ts`: sin husos horarios. Dentro
 * de cada anio se respeta el orden de la API (del mas reciente al mas antiguo).
 */
export interface AnioConSets {
  /** `YYYY`, o null para los sets sin fecha. */
  anio: string | null;
  sets: SetSummary[];
}

export function agruparPorAnio(sets: readonly SetSummary[]): AnioConSets[] {
  const grupos = new Map<string | null, SetSummary[]>();
  for (const s of sets) {
    const anio = s.releasedAt ? s.releasedAt.slice(0, 4) : null;
    grupos.set(anio, [...(grupos.get(anio) ?? []), s]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b.localeCompare(a)))
    .map(([anio, delAnio]) => ({ anio, sets: delAnio }));
}
```

- [ ] **4. Ver que pasan.** `npx vitest run apps/web/src/lib/juegos apps/web/src/lib/anios` → 4 passed.

- [ ] **5. El texto** (`apps/web/src/i18n/es.ts`), después de `portada`:

```ts
  /** La portada por año de Magic y Yu-Gi-Oh! (H9f, F-8). */
  portadaAnio: {
    entradilla: (sets: number, anios: number) =>
      `${sets} sets publicados a lo largo de ${anios} ${anios === 1 ? 'año' : 'años'}.`,
    sinFecha: 'Sin fecha',
  },
```

- [ ] **6. La portada** (`apps/web/src/pages/PortadaPorAnio.tsx`):

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link, useOutletContext } from 'react-router-dom';
import type { GameCode } from '@tcg/shared';
import { imageUrl } from '../lib/api.js';
import { consultaSets } from '../lib/consultas.js';
import { agruparPorAnio } from '../lib/anios.js';
import { SEGMENTO } from '../lib/juegos.js';
import { ES } from '../i18n/es.js';

/**
 * Portada de Magic y Yu-Gi-Oh!: los sets por anio de salida (H9f, F-8).
 *
 * Generica a proposito, al reves que la de Pokemon: el anio sirve igual a los
 * dos juegos. Cada set enlaza a su catalogo filtrado, como en Pokemon.
 */
export function PortadaPorAnio() {
  const { juego } = useOutletContext<{ juego: GameCode }>();
  const sets = useQuery(consultaSets(juego));

  if (sets.isPending) return <p className="vacio">{ES.portada.cargando}</p>;
  if (sets.isError) return <p className="aviso error">{ES.portada.error}</p>;

  const segmento = SEGMENTO[juego];
  // Un set sin cartas no tiene catalogo que ensenar; el selector del catalogo
  // tambien los aparta.
  const conCartas = sets.data.filter((s) => s.cardCount > 0);
  const grupos = agruparPorAnio(conCartas);

  return (
    <section className="portada">
      <header className="portada-cabecera">
        <h1>{ES.juegos[segmento].nombre}</h1>
        <p className="portada-entradilla">{ES.portadaAnio.entradilla(conCartas.length, grupos.length)}</p>
        <nav className="portada-accesos">
          <Link className="acceso-directo" to={`/${segmento}/catalogo`}>{ES.navegacion.catalogo}</Link>
          <Link className="acceso-directo" to="/sobres">{ES.navegacion.sobres}</Link>
          <Link className="acceso-directo" to="/coleccion">{ES.navegacion.coleccion}</Link>
        </nav>
      </header>

      {grupos.map(({ anio, sets: delAnio }) => (
        <section className="epoca" key={anio ?? 'sin-fecha'}>
          <h2 className="epoca-titulo">
            {anio ?? ES.portadaAnio.sinFecha}
            <span className="epoca-meta">{ES.portada.cuantosSets(delAnio.length)}</span>
          </h2>
          <ul className="epoca-sets">
            {delAnio.map((s) => (
              <li key={s.id}>
                {/* `encodeURIComponent`: los external_id de Yu-Gi-Oh! llevan
                    espacios ("THANK YOU PACK"). */}
                <Link className="ficha-set" to={`/${segmento}/catalogo?set=${encodeURIComponent(s.externalId)}`}>
                  {/* Ruta LOCAL siempre (P-001). */}
                  {s.iconPath ? (
                    <img className="icono-set" src={imageUrl(s.iconPath) ?? ''} alt="" width={22} height={22} loading="lazy" />
                  ) : (
                    <span className="icono-set icono-set-hueco" aria-hidden="true" />
                  )}
                  <span className="ficha-set-nombre">{s.name}</span>
                  <span className="ficha-set-meta">
                    {s.code}
                    {ES.simbolo.separador}
                    {s.releasedAt ?? ES.simbolo.vacio}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
```

- [ ] **7. El contenedor** (`apps/web/src/layouts/JuegoLayout.tsx`), entero. La tabla `ATRIBUTO`
      desaparece: el segmento de ruta y el `data-juego` son el mismo dato, y vive en `lib/juegos.ts`.

```tsx
import { Outlet } from 'react-router-dom';
import type { GameCode } from '@tcg/shared';
import { SEGMENTO } from '../lib/juegos.js';

/**
 * El contenedor de una seccion de juego (T-090).
 *
 * Su unico trabajo es poner `data-juego`, y eso basta: `tokens.css` cuelga de
 * ese atributo el acento y los colores de dorso de cada juego (T-088). El resto
 * de la interfaz no se entera de en que juego esta -- lee tokens -- que es
 * exactamente lo que hace posible compartir las primitivas (D-1 del spec).
 *
 * El valor del atributo es el segmento de ruta del juego (`SEGMENTO`): son el
 * mismo dato y se definen una sola vez (H9f).
 */
export function JuegoLayout({ juego }: { juego: GameCode }) {
  return (
    <div className="seccion-juego" data-juego={SEGMENTO[juego]}>
      <Outlet context={{ juego }} />
    </div>
  );
}
```

- [ ] **8. Las rutas y el menú** (`apps/web/src/App.tsx`):

      - Importaciones: añadir `import { useEffect, useState } from 'react';`,
        `import type { GameCode } from '@tcg/shared';`,
        `import { PortadaPorAnio } from './pages/PortadaPorAnio.js';` y
        `import { SEGMENTO, juegoDeRuta } from './lib/juegos.js';`.
      - Al principio de `App`, después de `const { pathname } = useLocation();`:

```tsx
  // "Catalogo" lleva al del juego en el que se esta; fuera de uno, al del
  // ultimo juego visitado en esta sesion; y si no ha habido ninguno, a elegir
  // juego (H9f). Lo segundo es lo que hace que ir de Pokemon a "Mis mazos" y
  // volver por el menu no te saque de Pokemon: lo comprueba humo.spec.ts.
  const juegoActual = juegoDeRuta(pathname);
  const [ultimoJuego, setUltimoJuego] = useState<GameCode | null>(juegoActual);
  useEffect(() => {
    if (juegoActual) setUltimoJuego(juegoActual);
  }, [juegoActual]);
  const juegoDelMenu = juegoActual ?? ultimoJuego;
  const destinoCatalogo = juegoDelMenu ? `/${SEGMENTO[juegoDelMenu]}/catalogo` : '/';
```

      - El enlace del menú:

```tsx
// antes
          <NavLink to="/ptcg/catalogo" className={({ isActive }) => (isActive ? 'activo' : '')}>
// despues
          <NavLink to={destinoCatalogo} end={destinoCatalogo === '/'} className={({ isActive }) => (isActive ? 'activo' : '')}>
```

      - Las rutas, sustituyendo el comentario «Hoy solo Pokemon…» y el bloque de `/ptcg`:

```tsx
          {/* Lo de cada juego cuelga de su ruta y su `data-juego`. Pokemon tiene
              su portada por epocas; Magic y Yu-Gi-Oh!, la de anios (H9f). */}
          <Route path="/ptcg" element={<JuegoLayout juego="PTCG" />}>
            <Route index element={<Portada />} />
            <Route path="catalogo" element={<Catalogo />} />
          </Route>
          <Route path="/mtg" element={<JuegoLayout juego="MTG" />}>
            <Route index element={<PortadaPorAnio />} />
            <Route path="catalogo" element={<Catalogo />} />
          </Route>
          <Route path="/ygo" element={<JuegoLayout juego="YGO" />}>
            <Route index element={<PortadaPorAnio />} />
            <Route path="catalogo" element={<Catalogo />} />
          </Route>
```

- [ ] **9. El inicio** (`apps/web/src/pages/Inicio.tsx`): en las entradas de `MTG` e `YGO`,
      `listo: false` → `listo: true`. La rama «En camino» se queda: es la de un juego futuro.

- [ ] **10. Ver que pasa.** `npm test` → verde.

- [ ] **11. Mirarlo**, en los dos temas: `/` (tres tarjetas activas), `/mtg` (años, del más reciente),
      `/mtg/catalogo?set=ecl` (raíl *Tu colección · Color · Tipo · Coste · Rareza*, fila con maná,
      tipo y F/R, la ficha de una criatura y la de una carta de dos caras), `/ygo`,
      `/ygo/catalogo?set=LOB` o el primero abrible (*Clase · Marco · Atributo · Nivel o rango · Link*,
      la ficha de un Xyz, de un Link con flechas y de un péndulo). Y la suite → **26 passed**:

```bash
# Docker (la web se reconstruye: lleva packages/shared/dist dentro)
docker compose up -d --build api web
docker compose --profile e2e run --rm --build e2e
# Local
cd e2e && E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test --reporter=line
```

- [ ] **12. Commit:** `feat(web): Magic and Yu-Gi-Oh! sections, home cards and year front page (T-114)`

---

## T-115 · Los E2E nuevos, cada garantía vista fallar, y el cierre del Vault

**Ficheros**
- Crear: `e2e/src/catalogos.spec.ts`
- Modificar: `e2e/src/fixtures.ts`
- Controlador: el cierre del Vault (paso 5)

- [ ] **1. La fecha del set, en la fixture.** En `e2e/src/fixtures.ts`, en `SetAbrible`, después de
      `name: string;`:

```ts
  /** `YYYY-MM-DD`: la portada por año lo agrupa por aquí (H9f). */
  releasedAt: string | null;
```

- [ ] **2. Las pruebas** (`e2e/src/catalogos.spec.ts`):

```ts
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { API, test, expect, abrirUnSobrePorApi, iniciarSesion, setAbrible } from './fixtures.js';

/**
 * H9f -- los catalogos de Magic y Yu-Gi-Oh!, y el perfil que los hace posibles.
 *
 * Como el resto de la suite: por rol y nombre accesible, y el texto esperado
 * escrito aqui con sus acentos, porque una prueba de extremo a extremo afirma
 * lo que el usuario LEE (ver humo.spec.ts).
 */

interface Recuento { value: string; count: number; owned: number | null }

const TIPO_DE_MAGIC = 'Criatura';
const ATRIBUTO: Record<string, string> = {
  DARK: 'Oscuridad', LIGHT: 'Luz', EARTH: 'Tierra', WATER: 'Agua', FIRE: 'Fuego', WIND: 'Viento', DIVINE: 'Divinidad',
};
const MARCO: Record<string, string> = {
  normal: 'Normal', effect: 'Efecto', ritual: 'Ritual', fusion: 'Fusión', synchro: 'Sincronía',
  xyz: 'Xyz', pendulum: 'Péndulo', link: 'Link', token: 'Ficha',
};

const rail = (page: Page) => page.getByRole('navigation', { name: 'Estructura' });
const seccion = (page: Page, nombre: string) => rail(page).getByRole('region', { name: nombre });
const filas = (page: Page): Locator =>
  page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') });
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "2 de 35" -> { tengo: 2, total: 35 }. */
function cifras(texto: string): { tengo: number; total: number } {
  const m = /(\d+) de (\d+)/.exec(texto);
  if (!m) throw new Error(`La fila del rail no dice "N de M": ${texto}`);
  return { tengo: Number(m[1]), total: Number(m[2]) };
}

async function recuentos(request: APIRequestContext, juego: string, set: string): Promise<Record<string, Recuento[]>> {
  const res = await request.get(`${API}/api/games/${juego}/facets?set=${encodeURIComponent(set)}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { data: { facetas: Record<string, Recuento[]> } }).data.facetas;
}

/** Cuantas cartas devuelve la API para una consulta; infinito si no caben en 100. */
async function contar(request: APIRequestContext, consulta: string): Promise<number> {
  const res = await request.get(`${API}/api/cards?${consulta}&limit=100`);
  expect(res.ok()).toBe(true);
  const cuerpo = (await res.json()) as { data: unknown[]; nextCursor: string | null };
  return cuerpo.nextCursor ? Number.POSITIVE_INFINITY : cuerpo.data.length;
}

test('Magic: un color de este set que me falta, el rail cuadra con la tabla, y un tipo encima', async ({
  page, request, usuario,
}) => {
  const set = await setAbrible(request, 'MTG');
  // Sin nada abierto, "me faltan" es el set entero y no distinguiria el filtro.
  await abrirUnSobrePorApi(request, usuario.token, set.id);
  await iniciarSesion(page, usuario.token);

  await page.goto(`/mtg/catalogo?set=${encodeURIComponent(set.externalId)}`);
  await expect(page.getByRole('heading', { level: 1, name: set.name })).toBeVisible();

  const colores = seccion(page, 'Color').getByRole('button');
  await expect(colores.first()).toBeVisible();
  let elegido: { nombre: string; faltan: number } | null = null;
  for (const fila of await colores.all()) {
    const texto = (await fila.textContent()) ?? '';
    const { tengo, total } = cifras(texto);
    if (total - tengo > 0 && total - tengo <= 60) {
      elegido = { nombre: texto.replace(/\d+ de \d+/, '').trim(), faltan: total - tengo };
      break;
    }
  }
  expect(elegido, 'ningun color del set tiene entre 1 y 60 cartas que falten').not.toBeNull();

  await rail(page).getByRole('button', { name: 'Me faltan' }).click();
  await seccion(page, 'Color').getByRole('button', { name: new RegExp(`^${escapar(elegido!.nombre)}`) }).click();
  await expect(page).toHaveURL(/owned=no/);
  await expect(page).toHaveURL(/color=/);

  // LA GARANTIA: lo que el rail dice que falta es lo que ensena la tabla.
  await expect(filas(page)).toHaveCount(elegido!.faltan);
  await expect(page.getByRole('table').getByRole('img', { name: 'La tienes' })).toHaveCount(0);

  // Antes del tipo tiene que haber filas de OTROS tipos: si el color elegido solo
  // trajera criaturas, romper el filtro de tipo no cambiaria nada y la comprobacion
  // de abajo pasaria sin probar nada.
  const noCriaturas = filas(page).filter({ hasNot: page.getByRole('cell', { name: TIPO_DE_MAGIC, exact: true }) });
  await expect(noCriaturas, 'el color elegido solo tiene criaturas: el tipo no filtraria nada').not.toHaveCount(0);

  // Un tipo encima: todas las filas que quedan son de ese tipo, y siguen faltando.
  await seccion(page, 'Tipo').getByRole('button', { name: new RegExp(`^${TIPO_DE_MAGIC}`) }).click();
  await expect(page).toHaveURL(/kind=creature/);
  await expect(filas(page).filter({ hasNot: page.getByRole('cell', { name: TIPO_DE_MAGIC, exact: true }) }))
    .toHaveCount(0);
  expect(await filas(page).count()).toBeLessThanOrEqual(elegido!.faltan);
  await expect(page.getByRole('table').getByRole('img', { name: 'La tienes' })).toHaveCount(0);

  const chips = page.getByRole('group', { name: 'Filtros activos' });
  await expect(chips.getByRole('button', { name: `Quitar el filtro ${TIPO_DE_MAGIC}` })).toBeVisible();
  await page.screenshot({ path: 'artefactos/catalogo-mtg.png', fullPage: true });
});

test('Yu-Gi-Oh!: atributo y marco a la vez, y la tabla es lo que dice la API', async ({ page, request }) => {
  const set = await setAbrible(request, 'YGO');
  const facetas = await recuentos(request, 'YGO', set.externalId);
  const base = `game=YGO&set=${encodeURIComponent(set.externalId)}`;

  // Un atributo que quepa en una pagina, y un marco que lo estreche sin vaciarlo.
  let par: { atributo: Recuento; marco: Recuento; esperadas: number } | null = null;
  for (const atributo of facetas.attribute ?? []) {
    if (atributo.count > 60) continue;
    for (const marco of facetas.frame ?? []) {
      const n = await contar(request, `${base}&attribute=${atributo.value}&frame=${marco.value}`);
      if (n > 0 && n < atributo.count) {
        par = { atributo, marco, esperadas: n };
        break;
      }
    }
    if (par) break;
  }
  expect(par, 'ningun par atributo + marco del set estrecha el atributo').not.toBeNull();
  const nombreAtributo = ATRIBUTO[par!.atributo.value]!;
  const nombreMarco = MARCO[par!.marco.value]!;

  await page.goto(`/ygo/catalogo?set=${encodeURIComponent(set.externalId)}`);
  await seccion(page, 'Atributo').getByRole('button', { name: new RegExp(`^${nombreAtributo}`) }).click();
  // Sin sesion el rail da la cifra a secas: es la de la tabla.
  await expect(filas(page)).toHaveCount(par!.atributo.count);

  await seccion(page, 'Marco').getByRole('button', { name: new RegExp(`^${nombreMarco}`) }).click();
  await expect(page).toHaveURL(/attribute=/);
  await expect(page).toHaveURL(/frame=/);
  await expect(filas(page)).toHaveCount(par!.esperadas);
  await expect(filas(page).filter({ hasNot: page.getByRole('cell', { name: nombreAtributo, exact: true }) }))
    .toHaveCount(0);

  const chips = page.getByRole('group', { name: 'Filtros activos' });
  await expect(chips.getByRole('button', { name: `Quitar el filtro ${nombreAtributo}` })).toBeVisible();
  await expect(chips.getByRole('button', { name: `Quitar el filtro ${nombreMarco}` })).toBeVisible();
});

test('la ficha de Magic: el coste en símbolos y la fuerza y resistencia', async ({ page, request }) => {
  const set = await setAbrible(request, 'MTG');
  const res = await request.get(
    `${API}/api/cards?game=MTG&set=${encodeURIComponent(set.externalId)}&kind=creature&limit=1`,
  );
  const { data } = (await res.json()) as { data: Array<{ printId: number; name: string }> };
  expect(data.length, 'el set no tiene criaturas').toBeGreaterThan(0);

  await page.goto(`/mtg/catalogo?set=${encodeURIComponent(set.externalId)}&kind=creature&carta=${data[0]!.printId}`);
  const ficha = page.getByRole('dialog', { name: data[0]!.name });
  await expect(ficha).toBeVisible();
  await expect(ficha.getByRole('img', { name: /^Coste: / })).toBeVisible();
  await expect(ficha.getByText('Fuerza/Resistencia')).toBeVisible();
  await page.screenshot({ path: 'artefactos/ficha-mtg.png' });
});

test('la ficha de Yu-Gi-Oh!: nivel, rango o link, y ATK y DEF', async ({ page, request }) => {
  const set = await setAbrible(request, 'YGO');
  const res = await request.get(
    `${API}/api/cards?game=YGO&set=${encodeURIComponent(set.externalId)}&kind=monster&limit=1`,
  );
  const { data } = (await res.json()) as { data: Array<{ printId: number; name: string }> };
  expect(data.length, 'el set no tiene monstruos').toBeGreaterThan(0);

  await page.goto(`/ygo/catalogo?set=${encodeURIComponent(set.externalId)}&carta=${data[0]!.printId}`);
  const ficha = page.getByRole('dialog', { name: data[0]!.name });
  await expect(ficha).toBeVisible();
  await expect(ficha.getByRole('img', { name: /^(Nivel|Rango|Link) \d+$/ })).toBeVisible();
  await expect(ficha.getByText('ATK', { exact: true })).toBeVisible();
  await expect(ficha.getByText('DEF', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artefactos/ficha-ygo.png' });
});

test('la portada de Magic agrupa por año y cada set lleva a su catálogo filtrado', async ({ page, request }) => {
  const set = await setAbrible(request, 'MTG');
  expect(set.releasedAt, 'el set abrible no tiene fecha').not.toBeNull();

  await page.goto('/');
  await page.getByRole('link', { name: /Magic: The Gathering/ }).click();
  await expect(page).toHaveURL(/\/mtg$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Magic: The Gathering' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${set.releasedAt!.slice(0, 4)}`) })).toBeVisible();

  await page.getByRole('link').filter({ has: page.getByText(set.name, { exact: true }) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/mtg/catalogo\\?set=${escapar(encodeURIComponent(set.externalId))}$`));
  await expect(page.getByRole('heading', { level: 1, name: set.name })).toBeVisible();
});

test('una faceta de otro juego es un 400 que la nombra', async ({ request }) => {
  const ajena = await request.get(`${API}/api/cards?game=PTCG&color=U`);
  expect(ajena.status()).toBe(400);
  expect(((await ajena.json()) as { message: string }).message).toContain('color');
  // Y la misma clave en su juego, no.
  expect((await request.get(`${API}/api/cards?game=MTG&color=U&limit=1`)).status()).toBe(200);
});
```

- [ ] **3. Ver que pasan** → **32 passed** (26 + 6):

```bash
# Docker: --build, porque la imagen de la suite copia e2e/src y ahora hay un spec nuevo
docker compose --profile e2e run --rm --build e2e
# Local
cd e2e && E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test --reporter=line
```

      Recuento de comprobación: `grep -c "^test(" e2e/src/*.spec.ts` suma 32 (catalogo 5 ·
      catalogos 6 · humo 3 · iconos 4 · mazos 2 · ritual 10 · sobres 2).

- [ ] **4. Verlas fallar, una por una** — rompiendo, corriendo y restaurando, como en T-095 y T-107:

| Garantía | Rotura | Debe fallar |
|---|---|---|
| El rail cuadra con la tabla | En `repartir` (`facetas-sql.ts`), `count: previo.count + Number(f.n)` → `count: previo.count + 1` | Magic: un color… (y la de Pokémon «las de un tipo…») |
| Un tipo encima filtra de verdad | `kind: porColumna('c.kind')` → `kind: { ...porColumna('c.kind'), filtro: () => ({ sql: '1 = 1', params: [] }) }` | Magic: un color… |
| Atributo + marco a la vez | En `leerFiltros`, `clavesDe(juego)` → `clavesDe(juego).filter((c) => c !== 'frame')` | Yu-Gi-Oh!: atributo y marco… |
| Ficha de Magic | En `FICHAS`, `cabecera: CabeceraMtg` → `cabecera: Nada` | la ficha de Magic… |
| Ficha de Yu-Gi-Oh! | En `FICHAS`, `cuerpo: CuerpoYgo` → `cuerpo: CuerpoMtg` | la ficha de Yu-Gi-Oh!… |
| La portada enlaza filtrado | En `PortadaPorAnio`, quitar `?set=${encodeURIComponent(s.externalId)}` del `to` | la portada de Magic… |
| 400 para una clave ajena | En `server.ts`, `if (!game \|\| !facetOf(game, clave))` → `if (!game)` | una faceta de otro juego… (y `server.test.ts`) |

      Cada vuelta, rotura → suite → restaurar, se corre sólo el fichero afectado:

```bash
# Docker: roturas del servidor (facetas-sql.ts, server.ts) -> reconstruir la API primero.
# Las de la web no lo necesitan: el contenedor web monta apps/web con sondeo.
docker compose up -d --build api
docker compose --profile e2e run --rm --build e2e npx playwright test src/catalogos.spec.ts src/catalogo.spec.ts --reporter=line

# Local: roturas del servidor -> `npx tsc --build` y reiniciar la API; las de la web las recoge Vite.
cd e2e && E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test src/catalogos.spec.ts src/catalogo.spec.ts --reporter=line
```

      (La imagen de la suite arranca con `CMD npx playwright test` desde `/app`, así que la orden se
      puede sobrescribir.) Cada rotura se deshace antes de la siguiente, y al final se vuelve a reconstruir la
      API sin roturas.

- [ ] **5. El cierre del Vault (controlador).**
      - `001Reportes/Tareas_Realizadas.md`: T-108 a T-115, sesión S038.
      - `001Reportes/Tareas_Pendientes.md`: cabecera cuadrada; H9f cerrado; H9c sigue.
      - `00Master/03_Hitos.md`: H9f completado.
      - `README.md` y `00Master/05_Continuar_Aqui.md`: **32 recorridos E2E** (la comprobación del
        Vault exige el número exacto en los dos).
      - `Claude.md`: la 0029 en el mapa (si no se puso ya en T-109), `004Arquitectura` con los
        documentos 20 y 21, `packages/shared/src/facet-profile.ts`, `db/facetas-sql.ts`,
        `lib/facetas-web`, `lib/celdas`, `lib/colores-de-juego`, `lib/mana`, `lib/ygo`, `lib/juegos`,
        `lib/anios`, `components/celdas`, `Mana`, `NivelYgo`, `pages/PortadaPorAnio` y
        `e2e/src/catalogos (T-115)`.
      - `00Master/04_Diccionario_Datos.md`: las cinco columnas de la 0029 y sus índices, con la guarda
        por clave JSON y por qué no `game_id`.
      - `003Problemas/Registro_Problemas.md`: un problema nuevo para las cinco migraciones ajenas de
        la base de desarrollo (corrección 3).
      - La bitácora de la sesión en `005Registro` (nombre: 2026-10-18_S038_FacetasPorJuego.md), con la
        duración del `ALTER`, las salidas de `EXPLAIN` y los tiempos del raíl.

- [ ] **6. `npm test`, la suite E2E, `npm audit` y `npm run vault:mutar`** en verde. `npm audit` no
      cambia: H9f no toca dependencias.

- [ ] **7. Commit:** `test(e2e): Magic and Yu-Gi-Oh! catalogs, every guarantee seen failing (T-115)`

---

## Cierre del hito

- [ ] El criterio del spec, **mirado**: en Magic, «las criaturas azules de *Lorwyn Eclipsed* que me
      faltan» sin instrucciones; en Yu-Gi-Oh!, «los Xyz de OSCURIDAD» de un set. En los dos temas.
- [ ] Presupuestos apuntados en la bitácora: duración del `ALTER` de la 0029, tiempos del raíl de Magic
      sin set (tres medidas), y si alguno pasó de 400 ms, qué se hizo.
- [ ] La pregunta que deja H9f: ¿el subtipo de mágicas y trampas (Normal, Rápida, Continua…) merece
      faceta? Si sí, es la primera prueba real de F-3 con `propio` sobre `race` + `kind`.

---

## Riesgos abiertos

1. **Los 400 ms del raíl de Magic sin set.** Cada recuento recorre las 117.152 impresiones (0,18-0,31 s
   medidos por consulta suelta) y son cuatro en paralelo sobre un pool de diez conexiones. La de color
   agrupa por la lista JSON y es la más cara. Si T-110 paso 13 da más de 0,4 s, la salida barata es
   no pedir el raíl de Magic sin set hasta que se elija uno, o cachear en memoria la parte anónima
   (sin tenencia) unos minutos; las dos son decisiones de producto y no van en este plan.
2. **La base de desarrollo no es la del repositorio** (corrección 3). La 0029 está escrita para
   aplicarse igual, pero un `docker compose down -v` y una base limpia darían otro esquema que el que
   se midió. Antes de producción conviene saber de dónde salieron 0028_ygo_indice_de_nivel a
   0032_entidades_html.
3. **La restricción de MySQL sobre `game_id`** no se ha ejecutado (sesión de sólo lectura). El plan no
   depende de ella: la guarda por clave JSON vale tanto si MySQL lo admitiera como si no.
4. **Datos de las pruebas E2E.** Los recorridos de Magic necesitan un color con 1-60 cartas que falten
   tras abrir un sobre, y los de Yu-Gi-Oh! un par atributo + marco que estreche; con el set abrible de
   hoy (*Lorwyn Eclipsed*, 408 impresiones; *THANK YOU PACK*, 24) se cumple, y si no, la prueba falla
   con un mensaje que dice qué falta, no en silencio.
