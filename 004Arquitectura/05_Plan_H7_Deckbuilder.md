# Plan de implementación — H7, 1.ª pasada (backend del constructor de mazos)

> **Para quien ejecute esto:** las tareas se hacen **en orden** y cada una acaba con su commit.
> Los pasos llevan casilla (`- [ ]`) para ir marcándolos. Spec de referencia:
> [`04_Spec_H7_Deckbuilder.md`](04_Spec_H7_Deckbuilder.md).

**Objetivo:** que un usuario autenticado pueda crear mazos, llenarlos con cartas del catálogo y
recibir, en cada lectura y en cada guardado, un informe de validación según las reglas de su juego.

**Arquitectura:** el motor de reglas es puro y vive en `@tcg/shared`, sin acceso a base de datos, de
modo que el frontend pueda reutilizarlo más adelante sin ir al servidor. La API lee el mazo, lo
traduce a la entrada del motor y devuelve el informe junto al contenido. La validación **nunca**
impide guardar y **nunca** se persiste.

**Stack:** TypeScript estricto, Vitest, Fastify 5, `mysql2` con SQL plano. Sin ORM (ADR-006).

**Antes de empezar:** `npm install && npm run build && npm test` deben estar limpios, y el entorno
de Docker levantado (`docker compose up -d`), porque las tareas 7 y 10 verifican contra MySQL real.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `packages/shared/src/deck-rules/types.ts` | Contrato: `DeckEntry`, `DeckIssue`, `DeckValidation`, `DeckValidator` |
| `packages/shared/src/deck-rules/predicates.ts` | Los cuatro predicados de 3.3 del spec. Es donde viven las trampas |
| `packages/shared/src/deck-rules/aggregate.ts` | Conteo por zona y por carta. Común a los tres juegos |
| `packages/shared/src/deck-rules/mtg.ts` · `ygo.ts` · `ptcg.ts` | Una estrategia por juego |
| `packages/shared/src/deck-rules/index.ts` | `validateDeck` y el registro de estrategias |
| `apps/api/src/db/deck-repository.ts` | CRUD de `decks`/`deck_cards` y resolución de impresiones |
| `apps/api/src/api/require-user.ts` | Extracción del usuario del JWT, compartida por rutas |
| `apps/api/src/api/deck-schemas.ts` | Esquemas de entrada y salida de las 6 rutas |
| `apps/api/src/api/deck-routes.ts` | Las 6 rutas |

Un fichero por juego a propósito: las reglas de los tres divergen y meterlas juntas produciría el
`switch` gigante que ADR-003 evitó en los adaptadores.

---

## Tarea 1 — Predicados de dominio

Aquí viven las cuatro trampas del spec. Se hacen primero y con test, porque fallan en silencio.

**Ficheros:**
- Crear: `packages/shared/src/deck-rules/predicates.ts`
- Crear: `packages/shared/src/deck-rules/predicates.test.ts`

- [ ] **Paso 1: escribir el test que falla**

`packages/shared/src/deck-rules/predicates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  typesOf,
  isMtgBasicLand,
  isYgoExtraDeckCard,
  ygoCopyLimit,
  isPtcgBasicEnergy,
  YGO_DEFAULT_COPY_LIMIT,
} from './predicates.js';

/**
 * Los casos de aqui NO son inventados. Los de Yu-Gi-Oh! salen de un
 * SELECT DISTINCT type_line sobre el catalogo ingestado el 2026-08-25; los de
 * Magic y Pokemon, del formato documentado de Scryfall y de la API de Pokemon.
 * Ver 004Arquitectura/04_Spec_H7_Deckbuilder.md, seccion 3.3.
 */

const EM_DASH = String.fromCharCode(0x2014);

describe('typesOf', () => {
  it('se queda con lo que hay antes del guion largo', () => {
    expect(typesOf(`Basic Land ${EM_DASH} Forest`)).toBe('Basic Land');
    expect(typesOf(`Legendary Creature ${EM_DASH} Elf Druid`)).toBe('Legendary Creature');
  });

  it('tolera que no haya separador', () => {
    // Yu-Gi-Oh! nunca lo lleva, y en Magic tampoco lo llevan los hechizos.
    expect(typesOf('Continuous Spell')).toBe('Continuous Spell');
    expect(typesOf('Instant')).toBe('Instant');
  });

  it('tolera la ausencia de type_line', () => {
    expect(typesOf(null)).toBe('');
    expect(typesOf(undefined)).toBe('');
  });
});

describe('isMtgBasicLand', () => {
  it('reconoce la tierra basica', () => {
    expect(isMtgBasicLand(`Basic Land ${EM_DASH} Forest`)).toBe(true);
    expect(isMtgBasicLand('Basic Land')).toBe(true);
  });

  it('reconoce la tierra basica NEVADA (la trampa)', () => {
    // "Basic Snow Land" NO contiene la cadena "Basic Land". Un includes()
    // limitaria las nevadas a 4 copias, que es incorrecto: el predicado es el
    // supertipo "Basic", no la subcadena.
    expect(isMtgBasicLand(`Basic Snow Land ${EM_DASH} Forest`)).toBe(true);
  });

  it('no confunde una tierra no basica', () => {
    expect(isMtgBasicLand(`Land ${EM_DASH} Forest Island`)).toBe(false);
    expect(isMtgBasicLand(`Snow Land ${EM_DASH} Forest`)).toBe(false);
    expect(isMtgBasicLand(`Legendary Creature ${EM_DASH} Elf`)).toBe(false);
    expect(isMtgBasicLand(null)).toBe(false);
  });

  it('no mira los subtipos', () => {
    // Un subtipo llamado "Basic" no existe, pero si existiera no debe contar.
    expect(isMtgBasicLand(`Creature ${EM_DASH} Basic`)).toBe(false);
  });
});

describe('isYgoExtraDeckCard', () => {
  it('reconoce las cuatro familias con la grafia REAL del catalogo', () => {
    // El catalogo dice "Xyz Effect Monster", NO "XYZ". Un includes('XYZ')
    // dejaria los Xyz en el Main Deck sin un solo error.
    expect(isYgoExtraDeckCard('Xyz Effect Monster')).toBe(true);
    expect(isYgoExtraDeckCard('Fusion Effect Monster')).toBe(true);
    expect(isYgoExtraDeckCard('Synchro Effect Monster')).toBe(true);
    expect(isYgoExtraDeckCard('Link Effect Monster')).toBe(true);
  });

  it('reconoce los Pendulo que SI son de Extra Deck', () => {
    expect(isYgoExtraDeckCard('Fusion Pendulum Effect Monster')).toBe(true);
    expect(isYgoExtraDeckCard('Synchro Pendulum Effect Monster')).toBe(true);
  });

  it('deja en el Main Deck lo que le corresponde', () => {
    expect(isYgoExtraDeckCard('Effect Monster')).toBe(false);
    expect(isYgoExtraDeckCard('Toon Effect Monster')).toBe(false);
    expect(isYgoExtraDeckCard('Pendulum Effect Monster')).toBe(false);
    // Ritual NO es Extra Deck: el monstruo de Ritual vive en el Main Deck.
    expect(isYgoExtraDeckCard('Ritual Effect Monster')).toBe(false);
    expect(isYgoExtraDeckCard('Continuous Spell')).toBe(false);
    expect(isYgoExtraDeckCard('Quick-Play Spell')).toBe(false);
    expect(isYgoExtraDeckCard('Continuous Trap')).toBe(false);
    expect(isYgoExtraDeckCard(null)).toBe(false);
  });
});

describe('ygoCopyLimit', () => {
  it('aplica la banlist del TCG', () => {
    expect(ygoCopyLimit({ banlist_info: { ban_tcg: 'Banned' } })).toBe(0);
    expect(ygoCopyLimit({ banlist_info: { ban_tcg: 'Limited' } })).toBe(1);
    expect(ygoCopyLimit({ banlist_info: { ban_tcg: 'Semi-Limited' } })).toBe(2);
  });

  it('AUSENCIA de banlist_info significa 3 copias, no "no lo se" (la trampa)', () => {
    // El adaptador OMITE el campo cuando viene vacio: solo las cartas
    // restringidas lo llevan. Tratar la ausencia como desconocido dejaria el
    // 99 % del catalogo sin limite.
    expect(ygoCopyLimit({})).toBe(YGO_DEFAULT_COPY_LIMIT);
    expect(ygoCopyLimit({ banlist_info: {} })).toBe(YGO_DEFAULT_COPY_LIMIT);
    expect(YGO_DEFAULT_COPY_LIMIT).toBe(3);
  });

  it('ignora las banlists de OCG y GOAT', () => {
    // El proyecto valida contra el TCG. Mezclarlas prohibiria cartas legales.
    expect(ygoCopyLimit({ banlist_info: { ban_ocg: 'Banned' } })).toBe(3);
    expect(ygoCopyLimit({ banlist_info: { ban_goat: 'Limited' } })).toBe(3);
  });
});

describe('isPtcgBasicEnergy', () => {
  it('reconoce la Energia Basica', () => {
    expect(isPtcgBasicEnergy({ supertype: 'Energy', subtypes: ['Basic'] })).toBe(true);
  });

  it('NO considera basica la Energia Especial (la trampa)', () => {
    // supertype === 'Energy' a secas incluiria las Especiales, que SI estan
    // limitadas a 4 copias.
    expect(isPtcgBasicEnergy({ supertype: 'Energy', subtypes: ['Special'] })).toBe(false);
    expect(isPtcgBasicEnergy({ supertype: 'Energy' })).toBe(false);
  });

  it('no confunde un Pokemon Basico con una Energia Basica', () => {
    expect(isPtcgBasicEnergy({ supertype: 'Pokemon', subtypes: ['Basic'] })).toBe(false);
    expect(isPtcgBasicEnergy({ supertype: 'Trainer', subtypes: ['Item'] })).toBe(false);
    expect(isPtcgBasicEnergy({})).toBe(false);
  });
});
```

- [ ] **Paso 2: ejecutar el test y comprobar que falla**

```bash
npx vitest run packages/shared/src/deck-rules/predicates.test.ts
```

Esperado: falla al resolver el módulo — `Failed to load .../predicates.js`.

- [ ] **Paso 3: escribir la implementación mínima**

`packages/shared/src/deck-rules/predicates.ts`:

```ts
import type { PtcgGameData, YgoGameData } from '../game-data.js';

/**
 * Separador de Scryfall entre supertipos/tipos y subtipos: un guion largo
 * (U+2014). El codigo fuente se mantiene en ASCII puro, asi que se construye en
 * vez de escribirse como literal.
 */
const EM_DASH = String.fromCharCode(0x2014);

/**
 * Parte de TIPOS de un `type_line`, sin los subtipos.
 *
 * Yu-Gi-Oh! nunca trae separador (`humanReadableCardType` es una frase suelta) y
 * en Magic tampoco lo traen los hechizos: cuando falta, la linea entera son
 * tipos.
 */
export function typesOf(typeLine: string | null | undefined): string {
  if (!typeLine) return '';
  const corte = typeLine.indexOf(EM_DASH);
  return (corte === -1 ? typeLine : typeLine.slice(0, corte)).trim();
}

/** Palabras del texto, en minusculas y sin puntuacion. */
function tokens(texto: string): string[] {
  return texto
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((token) => token !== '');
}

/**
 * Magic: una carta con el supertipo `Basic` no tiene limite de copias.
 *
 * El predicado es el SUPERTIPO, no la subcadena "Basic Land": la tierra nevada
 * es `Basic Snow Land` y no contiene esa cadena. Mirar solo la parte de tipos
 * evita ademas confundir un subtipo con un supertipo.
 */
export function isMtgBasicLand(typeLine: string | null | undefined): boolean {
  return tokens(typesOf(typeLine)).includes('basic');
}

/** Familias que viven en el Extra Deck de Yu-Gi-Oh!. */
const YGO_EXTRA_TOKENS = ['fusion', 'synchro', 'xyz', 'link'] as const;

/**
 * Yu-Gi-Oh!: si la carta pertenece al Extra Deck.
 *
 * La comparacion es por PALABRA y en minusculas. El catalogo real dice
 * `Xyz Effect Monster`, no `XYZ`: un `includes('XYZ')` dejaria todos los Xyz en
 * el Main Deck sin producir ningun error.
 *
 * Se exige ademas la palabra `monster` porque las cuatro familias son siempre
 * monstruos; sin ella, cualquier tipo futuro que contuviera una de las palabras
 * caeria en el Extra Deck por accidente.
 */
export function isYgoExtraDeckCard(typeLine: string | null | undefined): boolean {
  const palabras = tokens(typesOf(typeLine));
  if (!palabras.includes('monster')) return false;
  return YGO_EXTRA_TOKENS.some((token) => palabras.includes(token));
}

/** Copias permitidas de una carta de Yu-Gi-Oh! cuando la banlist no dice nada. */
export const YGO_DEFAULT_COPY_LIMIT = 3;

/**
 * Copias permitidas segun la banlist vigente del TCG.
 *
 * `banlist_info` SOLO existe en las cartas restringidas: el adaptador omite el
 * campo cuando el origen no lo trae. Por eso la ausencia significa "3 copias",
 * nunca "desconocido".
 *
 * Es el snapshot ingestado, no una consulta en vivo (RN-05).
 */
export function ygoCopyLimit(gameData: YgoGameData): number {
  const estado = gameData.banlist_info?.ban_tcg?.trim().toLowerCase();
  if (estado === 'banned') return 0;
  if (estado === 'limited') return 1;
  if (estado === 'semi-limited') return 2;
  return YGO_DEFAULT_COPY_LIMIT;
}

/**
 * Pokemon: si la carta es Energia Basica, que no tiene limite de copias.
 *
 * Exige las dos condiciones. `supertype === 'Energy'` a secas incluiria las
 * Energias Especiales, que SI estan limitadas a 4.
 */
export function isPtcgBasicEnergy(gameData: PtcgGameData): boolean {
  if (gameData.supertype?.trim().toLowerCase() !== 'energy') return false;
  return (gameData.subtypes ?? []).some((sub) => sub.trim().toLowerCase() === 'basic');
}
```

- [ ] **Paso 4: ejecutar el test y comprobar que pasa**

```bash
npx vitest run packages/shared/src/deck-rules/predicates.test.ts
```

Esperado: `Tests  16 passed`.

- [ ] **Paso 5: commit**

```bash
git add packages/shared/src/deck-rules/ && git commit -m "feat(deck-rules): add domain predicates for the three games (T-044)"
```

---

## Tarea 2 — Contrato y agregación

**Ficheros:**
- Crear: `packages/shared/src/deck-rules/types.ts`
- Crear: `packages/shared/src/deck-rules/aggregate.ts`
- Crear: `packages/shared/src/deck-rules/aggregate.test.ts`

- [ ] **Paso 1: escribir el contrato** (no lleva test: son tipos, los verifica `tsc`)

`packages/shared/src/deck-rules/types.ts`:

```ts
import type { GameCode } from '../game.js';
import type { GameDataByGame } from '../game-data.js';

/**
 * Zonas de un mazo. Coincide con el ENUM de `deck_cards.zone` en la migracion
 * 0001: cambiar una sin la otra rompe la escritura en silencio.
 */
export type DeckZone = 'main' | 'extra' | 'side' | 'commander';

/**
 * Una carta del mazo, con lo justo que las reglas necesitan.
 *
 * El validador NO consulta nada: recibe el mazo ya resuelto. Por eso aqui no
 * hay `printId` ni nada de la impresion — dos impresiones distintas de la misma
 * carta comparten `oracleKey` y cuentan como UNA a efectos de RN-04.
 */
export interface DeckEntry<G extends GameCode = GameCode> {
  oracleKey: string;
  name: string;
  typeLine: string | null;
  gameData: GameDataByGame[G];
  zone: DeckZone;
  quantity: number;
}

/**
 * Codigo estable de problema. Es un codigo y no un texto porque la interfaz
 * tendra que agrupar y traducir: comparar cadenas en espanol seria fragil.
 */
export type DeckIssueCode =
  | 'main_too_small'
  | 'main_too_large'
  | 'extra_too_large'
  | 'side_too_large'
  | 'too_many_copies'
  | 'banned_card'
  | 'wrong_zone'
  | 'unsupported_zone';

export interface DeckIssue {
  code: DeckIssueCode;
  message: string;
  /** Carta implicada. Los problemas de tamano no la llevan. */
  oracleKey?: string;
  cardName?: string;
  zone?: DeckZone;
  /** Cuantas hay y cuantas se permiten. */
  actual?: number;
  allowed?: number;
}

export interface DeckValidation {
  valid: boolean;
  counts: Record<DeckZone, number>;
  issues: DeckIssue[];
}

/** Estrategia por juego (RN-04). Mismo patron que `GameAdapter` (ADR-003). */
export interface DeckValidator<G extends GameCode> {
  readonly game: G;
  validate(entries: readonly DeckEntry<G>[]): DeckValidation;
}
```

- [ ] **Paso 2: escribir el test de agregación que falla**

`packages/shared/src/deck-rules/aggregate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aggregate, emptyCounts, sumZones } from './aggregate.js';
import type { DeckEntry } from './types.js';

function entry(over: Partial<DeckEntry>): DeckEntry {
  return {
    oracleKey: 'x', name: 'X', typeLine: null, gameData: {},
    zone: 'main', quantity: 1, ...over,
  };
}

describe('aggregate', () => {
  it('cuenta por zona', () => {
    const { counts } = aggregate([
      entry({ zone: 'main', quantity: 40 }),
      entry({ oracleKey: 'y', zone: 'extra', quantity: 15 }),
      entry({ oracleKey: 'z', zone: 'side', quantity: 15 }),
    ]);
    expect(counts).toEqual({ main: 40, extra: 15, side: 15, commander: 0 });
  });

  it('SUMA las impresiones distintas de la misma carta (P-009 y familia)', () => {
    // Dos card_print_id, un oracle_key: es UNA carta a efectos de RN-04. Es el
    // error que ha costado cinco problemas en este proyecto.
    const { byCard } = aggregate([
      entry({ oracleKey: 'blue-eyes', name: 'Blue-Eyes', quantity: 2 }),
      entry({ oracleKey: 'blue-eyes', name: 'Blue-Eyes', quantity: 2 }),
    ]);
    expect(byCard.size).toBe(1);
    expect(byCard.get('blue-eyes')?.perZone.main).toBe(4);
  });

  it('no colapsa dos cartas con oracle_key distinto (Nidoran, P-013)', () => {
    const { byCard } = aggregate([
      entry({ oracleKey: 'nidoran-m', name: 'Nidoran' }),
      entry({ oracleKey: 'nidoran-f', name: 'Nidoran' }),
    ]);
    expect(byCard.size).toBe(2);
  });

  it('ignora cantidades no positivas en vez de restar', () => {
    const { counts } = aggregate([
      entry({ quantity: 3 }),
      entry({ oracleKey: 'y', quantity: 0 }),
      entry({ oracleKey: 'z', quantity: -5 }),
    ]);
    expect(counts.main).toBe(3);
  });

  it('el mazo vacio no lanza', () => {
    expect(aggregate([]).counts).toEqual(emptyCounts());
  });
});

describe('sumZones', () => {
  it('suma solo las zonas pedidas', () => {
    const perZone = { main: 3, extra: 2, side: 1, commander: 0 };
    expect(sumZones(perZone, ['main', 'side'])).toBe(4);
    expect(sumZones(perZone, ['main'])).toBe(3);
  });
});
```

- [ ] **Paso 3: ejecutar y comprobar que falla**

```bash
npx vitest run packages/shared/src/deck-rules/aggregate.test.ts
```

Esperado: falla al resolver `./aggregate.js`.

- [ ] **Paso 4: escribir la implementación**

`packages/shared/src/deck-rules/aggregate.ts`:

```ts
import type { DeckEntry, DeckZone } from './types.js';

export const DECK_ZONES: readonly DeckZone[] = ['main', 'extra', 'side', 'commander'];

export interface CardTally {
  name: string;
  perZone: Record<DeckZone, number>;
}

export interface DeckAggregate {
  counts: Record<DeckZone, number>;
  /** oracleKey -> reparto por zona. La clave es la CARTA, no la impresion. */
  byCard: Map<string, CardTally>;
}

export function emptyCounts(): Record<DeckZone, number> {
  return { main: 0, extra: 0, side: 0, commander: 0 };
}

/**
 * Conteo por zona y por carta.
 *
 * Agrupa por `oracleKey` a proposito: `deck_cards` referencia IMPRESIONES, y
 * cuatro impresiones distintas de la misma carta son cuatro filas y una sola
 * carta a efectos del limite de copias (RN-04, D3 del spec).
 */
export function aggregate(entries: readonly DeckEntry[]): DeckAggregate {
  const counts = emptyCounts();
  const byCard = new Map<string, CardTally>();

  for (const entry of entries) {
    // Una cantidad no positiva se ignora; jamas resta. La columna tiene un
    // CHECK BETWEEN 1 AND 99, pero el motor no depende de la base de datos.
    const cantidad = Number.isFinite(entry.quantity) ? Math.trunc(entry.quantity) : 0;
    if (cantidad <= 0) continue;

    counts[entry.zone] += cantidad;

    let tally = byCard.get(entry.oracleKey);
    if (!tally) {
      tally = { name: entry.name, perZone: emptyCounts() };
      byCard.set(entry.oracleKey, tally);
    }
    tally.perZone[entry.zone] += cantidad;
  }

  return { counts, byCard };
}

export function sumZones(
  perZone: Record<DeckZone, number>,
  zones: readonly DeckZone[],
): number {
  return zones.reduce((total, zone) => total + perZone[zone], 0);
}
```

- [ ] **Paso 5: ejecutar y comprobar que pasa**

```bash
npx vitest run packages/shared/src/deck-rules/aggregate.test.ts
```

Esperado: `Tests  6 passed`.

- [ ] **Paso 6: commit**

```bash
git add packages/shared/src/deck-rules/ && git commit -m "feat(deck-rules): add validation contract and per-card aggregation (T-044)"
```

---

## Tarea 3 — Validador de Magic

**Ficheros:**
- Crear: `packages/shared/src/deck-rules/mtg.ts`
- Crear: `packages/shared/src/deck-rules/mtg.test.ts`

- [ ] **Paso 1: escribir el test que falla**

`packages/shared/src/deck-rules/mtg.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mtgValidator, MTG_MIN_MAIN, MTG_MAX_SIDE, MTG_MAX_COPIES } from './mtg.js';
import type { DeckEntry, DeckIssueCode } from './types.js';

const EM_DASH = String.fromCharCode(0x2014);

function card(over: Partial<DeckEntry<'MTG'>>): DeckEntry<'MTG'> {
  return {
    oracleKey: 'lightning-bolt', name: 'Lightning Bolt', typeLine: 'Instant',
    gameData: {}, zone: 'main', quantity: 1, ...over,
  };
}

/** Rellena el main hasta 60 con cartas distintas, para aislar lo que se prueba. */
function relleno(cuantas: number): DeckEntry<'MTG'>[] {
  return Array.from({ length: cuantas }, (_, i) =>
    card({ oracleKey: `relleno-${i}`, name: `Relleno ${i}`, quantity: 1 }),
  );
}

function codigos(entries: DeckEntry<'MTG'>[]): DeckIssueCode[] {
  return mtgValidator.validate(entries).issues.map((issue) => issue.code);
}

describe('mtgValidator', () => {
  it('un mazo de 60 cartas distintas es valido', () => {
    const resultado = mtgValidator.validate(relleno(60));
    expect(resultado.valid).toBe(true);
    expect(resultado.counts.main).toBe(60);
  });

  it('menos de 60 en el main es main_too_small', () => {
    const resultado = mtgValidator.validate(relleno(59));
    expect(resultado.valid).toBe(false);
    expect(resultado.issues[0]?.code).toBe('main_too_small');
    expect(resultado.issues[0]?.actual).toBe(59);
    expect(resultado.issues[0]?.allowed).toBe(MTG_MIN_MAIN);
  });

  it('mas de 60 en el main es valido: Magic no tiene maximo', () => {
    expect(mtgValidator.validate(relleno(75)).valid).toBe(true);
  });

  it('mas de 15 en el sideboard es side_too_large', () => {
    const entries = [...relleno(60), ...Array.from({ length: 16 }, (_, i) =>
      card({ oracleKey: `side-${i}`, name: `Side ${i}`, zone: 'side' }))];
    expect(codigos(entries)).toContain('side_too_large');
    expect(MTG_MAX_SIDE).toBe(15);
  });

  it('mas de 4 copias por nombre es too_many_copies', () => {
    const entries = [...relleno(56), card({ quantity: 5 })];
    const issue = mtgValidator.validate(entries).issues.find((i) => i.code === 'too_many_copies');
    expect(issue?.cardName).toBe('Lightning Bolt');
    expect(issue?.actual).toBe(5);
    expect(issue?.allowed).toBe(MTG_MAX_COPIES);
  });

  it('el limite de copias suma main Y sideboard', () => {
    // Asi cuenta Magic: el sideboard no es un mazo aparte a estos efectos.
    const entries = [...relleno(57), card({ quantity: 3 }), card({ zone: 'side', quantity: 2 })];
    expect(codigos(entries)).toContain('too_many_copies');
  });

  it('la tierra basica no tiene limite', () => {
    const bosque = card({
      oracleKey: 'forest', name: 'Forest',
      typeLine: `Basic Land ${EM_DASH} Forest`, quantity: 24,
    });
    expect(mtgValidator.validate([...relleno(36), bosque]).valid).toBe(true);
  });

  it('la tierra basica NEVADA tampoco (la trampa)', () => {
    const nevado = card({
      oracleKey: 'snow-forest', name: 'Snow-Covered Forest',
      typeLine: `Basic Snow Land ${EM_DASH} Forest`, quantity: 24,
    });
    expect(mtgValidator.validate([...relleno(36), nevado]).valid).toBe(true);
  });

  it('la misma carta en dos impresiones cuenta como UNA', () => {
    const entries = [
      ...relleno(57),
      card({ quantity: 2 }),
      card({ quantity: 2 }), // otra impresion, mismo oracleKey
    ];
    // 4 copias en total: legal. Contar por impresion daria 2 y 2 y no avisaria
    // nunca de la quinta.
    expect(mtgValidator.validate(entries).valid).toBe(true);
    expect(codigos([...relleno(56), card({ quantity: 3 }), card({ quantity: 2 })]))
      .toContain('too_many_copies');
  });

  it('rechaza las zonas que Magic no usa en v1', () => {
    const entries = [...relleno(60), card({ zone: 'extra' })];
    expect(codigos(entries)).toContain('unsupported_zone');
  });

  it('el mazo vacio es invalido pero no lanza', () => {
    const resultado = mtgValidator.validate([]);
    expect(resultado.valid).toBe(false);
    expect(resultado.counts.main).toBe(0);
  });
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
npx vitest run packages/shared/src/deck-rules/mtg.test.ts
```

Esperado: falla al resolver `./mtg.js`.

- [ ] **Paso 3: escribir la implementación**

`packages/shared/src/deck-rules/mtg.ts`:

```ts
import { aggregate, sumZones } from './aggregate.js';
import { isMtgBasicLand } from './predicates.js';
import type { DeckIssue, DeckValidation, DeckValidator, DeckZone } from './types.js';

export const MTG_MIN_MAIN = 60;
export const MTG_MAX_SIDE = 15;
export const MTG_MAX_COPIES = 4;

/** Magic no usa Extra Deck. `commander` queda para cuando se aborde el formato. */
const ALLOWED_ZONES: readonly DeckZone[] = ['main', 'side'];

/** El limite de copias suma main y sideboard: asi cuenta Magic. */
const COUNTED_ZONES: readonly DeckZone[] = ['main', 'side'];

export const mtgValidator: DeckValidator<'MTG'> = {
  game: 'MTG',

  validate(entries): DeckValidation {
    const issues: DeckIssue[] = [];

    for (const entry of entries) {
      if (!ALLOWED_ZONES.includes(entry.zone)) {
        issues.push({
          code: 'unsupported_zone',
          message: `Magic no usa la zona "${entry.zone}"`,
          oracleKey: entry.oracleKey,
          cardName: entry.name,
          zone: entry.zone,
        });
      }
    }

    const { counts, byCard } = aggregate(entries);

    if (counts.main < MTG_MIN_MAIN) {
      issues.push({
        code: 'main_too_small',
        message: `El mazo principal tiene ${counts.main} cartas y el minimo son ${MTG_MIN_MAIN}`,
        actual: counts.main,
        allowed: MTG_MIN_MAIN,
      });
    }

    // Sin maximo para el main: Magic permite mazos mas grandes de 60.

    if (counts.side > MTG_MAX_SIDE) {
      issues.push({
        code: 'side_too_large',
        message: `El sideboard tiene ${counts.side} cartas y el maximo son ${MTG_MAX_SIDE}`,
        actual: counts.side,
        allowed: MTG_MAX_SIDE,
      });
    }

    const sinLimite = new Set<string>();
    for (const entry of entries) {
      if (isMtgBasicLand(entry.typeLine)) sinLimite.add(entry.oracleKey);
    }

    for (const [oracleKey, tally] of byCard) {
      if (sinLimite.has(oracleKey)) continue;
      const total = sumZones(tally.perZone, COUNTED_ZONES);
      if (total > MTG_MAX_COPIES) {
        issues.push({
          code: 'too_many_copies',
          message: `"${tally.name}" aparece ${total} veces y el maximo son ${MTG_MAX_COPIES}`,
          oracleKey,
          cardName: tally.name,
          actual: total,
          allowed: MTG_MAX_COPIES,
        });
      }
    }

    return { valid: issues.length === 0, counts, issues };
  },
};
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

```bash
npx vitest run packages/shared/src/deck-rules/mtg.test.ts
```

Esperado: `Tests  11 passed`.

- [ ] **Paso 5: commit**

```bash
git add packages/shared/src/deck-rules/ && git commit -m "feat(deck-rules): add MTG deck validator (T-044)"
```

---

## Tarea 4 — Validador de Yu-Gi-Oh!

**Ficheros:**
- Crear: `packages/shared/src/deck-rules/ygo.ts`
- Crear: `packages/shared/src/deck-rules/ygo.test.ts`

- [ ] **Paso 1: escribir el test que falla**

`packages/shared/src/deck-rules/ygo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ygoValidator, YGO_MIN_MAIN, YGO_MAX_MAIN, YGO_MAX_EXTRA, YGO_MAX_SIDE,
} from './ygo.js';
import type { DeckEntry, DeckIssueCode } from './types.js';

function card(over: Partial<DeckEntry<'YGO'>>): DeckEntry<'YGO'> {
  return {
    oracleKey: 'blue-eyes', name: 'Blue-Eyes White Dragon',
    typeLine: 'Normal Monster', gameData: {}, zone: 'main', quantity: 1, ...over,
  };
}

function relleno(cuantas: number, zone: DeckEntry<'YGO'>['zone'] = 'main'): DeckEntry<'YGO'>[] {
  return Array.from({ length: cuantas }, (_, i) =>
    card({ oracleKey: `relleno-${i}`, name: `Relleno ${i}`, zone }));
}

function codigos(entries: DeckEntry<'YGO'>[]): DeckIssueCode[] {
  return ygoValidator.validate(entries).issues.map((issue) => issue.code);
}

describe('ygoValidator', () => {
  it('40 cartas en el main es valido', () => {
    const resultado = ygoValidator.validate(relleno(40));
    expect(resultado.valid).toBe(true);
    expect(resultado.counts.main).toBe(40);
  });

  it('39 es main_too_small y 61 es main_too_large', () => {
    expect(codigos(relleno(39))).toContain('main_too_small');
    expect(codigos(relleno(61))).toContain('main_too_large');
    expect([YGO_MIN_MAIN, YGO_MAX_MAIN]).toEqual([40, 60]);
  });

  it('mas de 15 en el extra o en el side es demasiado', () => {
    const extra = Array.from({ length: 16 }, (_, i) =>
      card({ oracleKey: `x-${i}`, name: `Xyz ${i}`, typeLine: 'Xyz Effect Monster', zone: 'extra' }));
    expect(codigos([...relleno(40), ...extra])).toContain('extra_too_large');
    expect(codigos([...relleno(40), ...relleno(16, 'side')])).toContain('side_too_large');
    expect([YGO_MAX_EXTRA, YGO_MAX_SIDE]).toEqual([15, 15]);
  });

  it('un Xyz en el Main Deck es wrong_zone (la trampa de la grafia)', () => {
    // El catalogo real dice "Xyz Effect Monster", no "XYZ".
    const xyz = card({ oracleKey: 'utopia', name: 'Utopia', typeLine: 'Xyz Effect Monster' });
    expect(codigos([...relleno(39), xyz])).toContain('wrong_zone');
  });

  it('un monstruo normal en el Extra Deck es wrong_zone', () => {
    expect(codigos([...relleno(40), card({ zone: 'extra' })])).toContain('wrong_zone');
  });

  it('un monstruo de Ritual va en el Main Deck y no es wrong_zone', () => {
    const ritual = card({ oracleKey: 'garlandolf', name: 'Garlandolf', typeLine: 'Ritual Effect Monster' });
    expect(codigos([...relleno(39), ritual])).not.toContain('wrong_zone');
  });

  it('el Side Deck admite cartas de Extra Deck', () => {
    // Es legal: se cambian entre partidas. Solo main vs extra estan reganidos.
    const xyz = card({ oracleKey: 'utopia', name: 'Utopia', typeLine: 'Xyz Effect Monster', zone: 'side' });
    expect(codigos([...relleno(40), xyz])).not.toContain('wrong_zone');
  });

  it('mas de 3 copias es too_many_copies', () => {
    expect(codigos([...relleno(36), card({ quantity: 4 })])).toContain('too_many_copies');
  });

  it('la banlist aprieta el limite: Limited admite 1', () => {
    const limitada = card({ quantity: 2, gameData: { banlist_info: { ban_tcg: 'Limited' } } });
    const issue = ygoValidator.validate([...relleno(38), limitada]).issues
      .find((i) => i.code === 'banned_card');
    expect(issue?.allowed).toBe(1);
    expect(issue?.actual).toBe(2);
  });

  it('Semi-Limited admite 2 y Banned ninguna', () => {
    const semi = card({ quantity: 3, gameData: { banlist_info: { ban_tcg: 'Semi-Limited' } } });
    expect(codigos([...relleno(37), semi])).toContain('banned_card');
    const prohibida = card({ quantity: 1, gameData: { banlist_info: { ban_tcg: 'Banned' } } });
    expect(codigos([...relleno(39), prohibida])).toContain('banned_card');
  });

  it('SIN banlist_info se permiten 3 copias (la trampa)', () => {
    expect(ygoValidator.validate([...relleno(37), card({ quantity: 3 })]).valid).toBe(true);
  });

  it('el limite de copias suma las tres zonas', () => {
    const entries = [
      ...relleno(38),
      card({ quantity: 2 }),
      card({ quantity: 2, zone: 'side' }),
    ];
    expect(codigos(entries)).toContain('too_many_copies');
  });

  it('rechaza la zona commander', () => {
    expect(codigos([...relleno(40), card({ zone: 'commander' })])).toContain('unsupported_zone');
  });
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
npx vitest run packages/shared/src/deck-rules/ygo.test.ts
```

Esperado: falla al resolver `./ygo.js`.

- [ ] **Paso 3: escribir la implementación**

`packages/shared/src/deck-rules/ygo.ts`:

```ts
import { aggregate, sumZones } from './aggregate.js';
import { isYgoExtraDeckCard, ygoCopyLimit, YGO_DEFAULT_COPY_LIMIT } from './predicates.js';
import type { DeckIssue, DeckValidation, DeckValidator, DeckZone } from './types.js';

export const YGO_MIN_MAIN = 40;
export const YGO_MAX_MAIN = 60;
export const YGO_MAX_EXTRA = 15;
export const YGO_MAX_SIDE = 15;

const ALLOWED_ZONES: readonly DeckZone[] = ['main', 'extra', 'side'];
const COUNTED_ZONES: readonly DeckZone[] = ['main', 'extra', 'side'];

export const ygoValidator: DeckValidator<'YGO'> = {
  game: 'YGO',

  validate(entries): DeckValidation {
    const issues: DeckIssue[] = [];

    for (const entry of entries) {
      if (!ALLOWED_ZONES.includes(entry.zone)) {
        issues.push({
          code: 'unsupported_zone',
          message: `Yu-Gi-Oh! no usa la zona "${entry.zone}"`,
          oracleKey: entry.oracleKey,
          cardName: entry.name,
          zone: entry.zone,
        });
        continue;
      }

      // El Side Deck admite las dos clases de carta: se cambian entre partidas.
      // Solo el Main y el Extra estan renidos.
      const esExtra = isYgoExtraDeckCard(entry.typeLine);
      if (esExtra && entry.zone === 'main') {
        issues.push({
          code: 'wrong_zone',
          message: `"${entry.name}" es carta de Extra Deck y no puede ir en el Main Deck`,
          oracleKey: entry.oracleKey,
          cardName: entry.name,
          zone: entry.zone,
        });
      } else if (!esExtra && entry.zone === 'extra') {
        issues.push({
          code: 'wrong_zone',
          message: `"${entry.name}" no es carta de Extra Deck`,
          oracleKey: entry.oracleKey,
          cardName: entry.name,
          zone: entry.zone,
        });
      }
    }

    const { counts, byCard } = aggregate(entries);

    if (counts.main < YGO_MIN_MAIN) {
      issues.push({
        code: 'main_too_small',
        message: `El Main Deck tiene ${counts.main} cartas y el minimo son ${YGO_MIN_MAIN}`,
        actual: counts.main,
        allowed: YGO_MIN_MAIN,
      });
    } else if (counts.main > YGO_MAX_MAIN) {
      issues.push({
        code: 'main_too_large',
        message: `El Main Deck tiene ${counts.main} cartas y el maximo son ${YGO_MAX_MAIN}`,
        actual: counts.main,
        allowed: YGO_MAX_MAIN,
      });
    }

    if (counts.extra > YGO_MAX_EXTRA) {
      issues.push({
        code: 'extra_too_large',
        message: `El Extra Deck tiene ${counts.extra} cartas y el maximo son ${YGO_MAX_EXTRA}`,
        actual: counts.extra,
        allowed: YGO_MAX_EXTRA,
      });
    }

    if (counts.side > YGO_MAX_SIDE) {
      issues.push({
        code: 'side_too_large',
        message: `El Side Deck tiene ${counts.side} cartas y el maximo son ${YGO_MAX_SIDE}`,
        actual: counts.side,
        allowed: YGO_MAX_SIDE,
      });
    }

    // El limite de una carta es el mas restrictivo que se haya visto para ella:
    // dos impresiones de la misma carta traen el mismo estado de banlist, pero
    // depender de que la primera fila lo traiga seria fragil.
    const limites = new Map<string, number>();
    for (const entry of entries) {
      const limite = ygoCopyLimit(entry.gameData);
      const previo = limites.get(entry.oracleKey);
      limites.set(entry.oracleKey, previo === undefined ? limite : Math.min(previo, limite));
    }

    for (const [oracleKey, tally] of byCard) {
      const limite = limites.get(oracleKey) ?? YGO_DEFAULT_COPY_LIMIT;
      const total = sumZones(tally.perZone, COUNTED_ZONES);
      if (total <= limite) continue;

      const restringida = limite < YGO_DEFAULT_COPY_LIMIT;
      issues.push({
        code: restringida ? 'banned_card' : 'too_many_copies',
        message:
          limite === 0
            ? `"${tally.name}" esta prohibida por la banlist vigente`
            : `"${tally.name}" aparece ${total} veces y el maximo son ${limite}`,
        oracleKey,
        cardName: tally.name,
        actual: total,
        allowed: limite,
      });
    }

    return { valid: issues.length === 0, counts, issues };
  },
};
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

```bash
npx vitest run packages/shared/src/deck-rules/ygo.test.ts
```

Esperado: `Tests  13 passed`.

- [ ] **Paso 5: commit**

```bash
git add packages/shared/src/deck-rules/ && git commit -m "feat(deck-rules): add Yu-Gi-Oh! deck validator with TCG banlist (T-044)"
```

---

## Tarea 5 — Validador de Pokémon

**Ficheros:**
- Crear: `packages/shared/src/deck-rules/ptcg.ts`
- Crear: `packages/shared/src/deck-rules/ptcg.test.ts`

- [ ] **Paso 1: escribir el test que falla**

`packages/shared/src/deck-rules/ptcg.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ptcgValidator, PTCG_DECK_SIZE, PTCG_MAX_COPIES } from './ptcg.js';
import type { DeckEntry, DeckIssueCode } from './types.js';

function card(over: Partial<DeckEntry<'PTCG'>>): DeckEntry<'PTCG'> {
  return {
    oracleKey: 'pikachu', name: 'Pikachu', typeLine: 'Pokemon - Basic',
    gameData: { supertype: 'Pokemon', subtypes: ['Basic'] },
    zone: 'main', quantity: 1, ...over,
  };
}

function relleno(cuantas: number): DeckEntry<'PTCG'>[] {
  return Array.from({ length: cuantas }, (_, i) =>
    card({ oracleKey: `relleno-${i}`, name: `Relleno ${i}` }));
}

function codigos(entries: DeckEntry<'PTCG'>[]): DeckIssueCode[] {
  return ptcgValidator.validate(entries).issues.map((issue) => issue.code);
}

const ENERGIA_BASICA: Partial<DeckEntry<'PTCG'>> = {
  oracleKey: 'basic-fire', name: 'Basic Fire Energy',
  typeLine: 'Energy - Basic',
  gameData: { supertype: 'Energy', subtypes: ['Basic'] },
};

const ENERGIA_ESPECIAL: Partial<DeckEntry<'PTCG'>> = {
  oracleKey: 'double-turbo', name: 'Double Turbo Energy',
  typeLine: 'Energy - Special',
  gameData: { supertype: 'Energy', subtypes: ['Special'] },
};

describe('ptcgValidator', () => {
  it('exactamente 60 cartas es valido', () => {
    const resultado = ptcgValidator.validate(relleno(60));
    expect(resultado.valid).toBe(true);
    expect(PTCG_DECK_SIZE).toBe(60);
  });

  it('59 y 61 son invalidos: el tamano es EXACTO', () => {
    expect(codigos(relleno(59))).toContain('main_too_small');
    expect(codigos(relleno(61))).toContain('main_too_large');
  });

  it('mas de 4 copias por nombre es too_many_copies', () => {
    const issue = ptcgValidator.validate([...relleno(55), card({ quantity: 5 })]).issues
      .find((i) => i.code === 'too_many_copies');
    expect(issue?.actual).toBe(5);
    expect(issue?.allowed).toBe(PTCG_MAX_COPIES);
  });

  it('la Energia Basica no tiene limite', () => {
    const energia = card({ ...ENERGIA_BASICA, quantity: 15 });
    expect(ptcgValidator.validate([...relleno(45), energia]).valid).toBe(true);
  });

  it('la Energia ESPECIAL si esta limitada a 4 (la trampa)', () => {
    const energia = card({ ...ENERGIA_ESPECIAL, quantity: 5 });
    expect(codigos([...relleno(55), energia])).toContain('too_many_copies');
  });

  it('rechaza cualquier zona que no sea main', () => {
    expect(codigos([...relleno(60), card({ zone: 'side' })])).toContain('unsupported_zone');
    expect(codigos([...relleno(60), card({ zone: 'extra' })])).toContain('unsupported_zone');
  });

  it('el mazo vacio es invalido pero no lanza', () => {
    expect(ptcgValidator.validate([]).valid).toBe(false);
  });
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
npx vitest run packages/shared/src/deck-rules/ptcg.test.ts
```

Esperado: falla al resolver `./ptcg.js`.

- [ ] **Paso 3: escribir la implementación**

`packages/shared/src/deck-rules/ptcg.ts`:

```ts
import { aggregate, sumZones } from './aggregate.js';
import { isPtcgBasicEnergy } from './predicates.js';
import type { DeckIssue, DeckValidation, DeckValidator, DeckZone } from './types.js';

/** Pokemon exige EXACTAMENTE 60 cartas. Ni 59 ni 61. */
export const PTCG_DECK_SIZE = 60;
export const PTCG_MAX_COPIES = 4;

const ALLOWED_ZONES: readonly DeckZone[] = ['main'];
const COUNTED_ZONES: readonly DeckZone[] = ['main'];

export const ptcgValidator: DeckValidator<'PTCG'> = {
  game: 'PTCG',

  validate(entries): DeckValidation {
    const issues: DeckIssue[] = [];

    for (const entry of entries) {
      if (!ALLOWED_ZONES.includes(entry.zone)) {
        issues.push({
          code: 'unsupported_zone',
          message: `Pokemon no usa la zona "${entry.zone}"`,
          oracleKey: entry.oracleKey,
          cardName: entry.name,
          zone: entry.zone,
        });
      }
    }

    const { counts, byCard } = aggregate(entries);

    if (counts.main < PTCG_DECK_SIZE) {
      issues.push({
        code: 'main_too_small',
        message: `El mazo tiene ${counts.main} cartas y deben ser exactamente ${PTCG_DECK_SIZE}`,
        actual: counts.main,
        allowed: PTCG_DECK_SIZE,
      });
    } else if (counts.main > PTCG_DECK_SIZE) {
      issues.push({
        code: 'main_too_large',
        message: `El mazo tiene ${counts.main} cartas y deben ser exactamente ${PTCG_DECK_SIZE}`,
        actual: counts.main,
        allowed: PTCG_DECK_SIZE,
      });
    }

    const sinLimite = new Set<string>();
    for (const entry of entries) {
      if (isPtcgBasicEnergy(entry.gameData)) sinLimite.add(entry.oracleKey);
    }

    for (const [oracleKey, tally] of byCard) {
      if (sinLimite.has(oracleKey)) continue;
      const total = sumZones(tally.perZone, COUNTED_ZONES);
      if (total > PTCG_MAX_COPIES) {
        issues.push({
          code: 'too_many_copies',
          message: `"${tally.name}" aparece ${total} veces y el maximo son ${PTCG_MAX_COPIES}`,
          oracleKey,
          cardName: tally.name,
          actual: total,
          allowed: PTCG_MAX_COPIES,
        });
      }
    }

    return { valid: issues.length === 0, counts, issues };
  },
};
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

```bash
npx vitest run packages/shared/src/deck-rules/ptcg.test.ts
```

Esperado: `Tests  7 passed`.

- [ ] **Paso 5: commit**

```bash
git add packages/shared/src/deck-rules/ && git commit -m "feat(deck-rules): add Pokemon TCG deck validator (T-044)"
```

---

## Tarea 6 — `validateDeck` y exportación del paquete

**Ficheros:**
- Crear: `packages/shared/src/deck-rules/index.ts`
- Crear: `packages/shared/src/deck-rules/index.test.ts`
- Modificar: `packages/shared/src/index.ts`

- [ ] **Paso 1: escribir el test que falla**

`packages/shared/src/deck-rules/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateDeck, DECK_VALIDATORS } from './index.js';
import { GAME_CODES } from '../game.js';

describe('validateDeck', () => {
  it('hay una estrategia por juego, sin huecos', () => {
    for (const game of GAME_CODES) {
      expect(DECK_VALIDATORS[game]?.game).toBe(game);
    }
    expect(Object.keys(DECK_VALIDATORS).sort()).toEqual([...GAME_CODES].sort());
  });

  it('delega en la estrategia del juego pedido', () => {
    // 45 cartas discriminan los tres juegos de una vez: Magic exige 60 como
    // minimo, Yu-Gi-Oh! admite entre 40 y 60, y Pokemon exige 60 exactas.
    const entries = Array.from({ length: 45 }, (_, i) => ({
      oracleKey: `c-${i}`, name: `C ${i}`, typeLine: null,
      gameData: {}, zone: 'main' as const, quantity: 1,
    }));
    expect(validateDeck('MTG', entries).valid).toBe(false); // minimo 60
    expect(validateDeck('YGO', entries).valid).toBe(true);  // entre 40 y 60
    expect(validateDeck('PTCG', entries).valid).toBe(false); // exactamente 60
  });

  it('el mazo vacio devuelve conteos a cero en los tres juegos', () => {
    for (const game of GAME_CODES) {
      const resultado = validateDeck(game, []);
      expect(resultado.counts).toEqual({ main: 0, extra: 0, side: 0, commander: 0 });
      expect(resultado.valid).toBe(false);
    }
  });
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
npx vitest run packages/shared/src/deck-rules/index.test.ts
```

Esperado: falla al resolver `./index.js`.

- [ ] **Paso 3: escribir la implementación**

`packages/shared/src/deck-rules/index.ts`:

```ts
import type { GameCode } from '../game.js';
import { mtgValidator } from './mtg.js';
import { ptcgValidator } from './ptcg.js';
import { ygoValidator } from './ygo.js';
import type { DeckEntry, DeckValidation, DeckValidator } from './types.js';

/**
 * Registro de estrategias por juego (RN-04).
 *
 * Mismo patron que `GameAdapter` (ADR-003): anadir un cuarto juego es escribir
 * un fichero y anadir una linea aqui, no tocar un `switch` repartido.
 */
export const DECK_VALIDATORS = {
  MTG: mtgValidator,
  YGO: ygoValidator,
  PTCG: ptcgValidator,
} as const;

/** Valida un mazo contra las reglas de su juego. Funcion pura: no consulta nada. */
export function validateDeck<G extends GameCode>(
  game: G,
  entries: readonly DeckEntry<G>[],
): DeckValidation {
  const validator = DECK_VALIDATORS[game] as unknown as DeckValidator<G>;
  return validator.validate(entries);
}

export { aggregate, emptyCounts, sumZones, DECK_ZONES } from './aggregate.js';
export type { CardTally, DeckAggregate } from './aggregate.js';
export {
  typesOf, isMtgBasicLand, isYgoExtraDeckCard, ygoCopyLimit, isPtcgBasicEnergy,
  YGO_DEFAULT_COPY_LIMIT,
} from './predicates.js';
export { mtgValidator, MTG_MIN_MAIN, MTG_MAX_SIDE, MTG_MAX_COPIES } from './mtg.js';
export {
  ygoValidator, YGO_MIN_MAIN, YGO_MAX_MAIN, YGO_MAX_EXTRA, YGO_MAX_SIDE,
} from './ygo.js';
export { ptcgValidator, PTCG_DECK_SIZE, PTCG_MAX_COPIES } from './ptcg.js';
export type {
  DeckZone, DeckEntry, DeckIssue, DeckIssueCode, DeckValidation, DeckValidator,
} from './types.js';
```

- [ ] **Paso 4: exportar desde el barrel del paquete**

En `packages/shared/src/index.ts`, añadir al final:

```ts
export {
  validateDeck,
  DECK_VALIDATORS,
  DECK_ZONES,
  aggregate,
  emptyCounts,
  sumZones,
  typesOf,
  isMtgBasicLand,
  isYgoExtraDeckCard,
  ygoCopyLimit,
  isPtcgBasicEnergy,
  YGO_DEFAULT_COPY_LIMIT,
  mtgValidator,
  ygoValidator,
  ptcgValidator,
  MTG_MIN_MAIN,
  MTG_MAX_SIDE,
  MTG_MAX_COPIES,
  YGO_MIN_MAIN,
  YGO_MAX_MAIN,
  YGO_MAX_EXTRA,
  YGO_MAX_SIDE,
  PTCG_DECK_SIZE,
  PTCG_MAX_COPIES,
} from './deck-rules/index.js';
export type {
  DeckZone,
  DeckEntry,
  DeckIssue,
  DeckIssueCode,
  DeckValidation,
  DeckValidator,
  CardTally,
  DeckAggregate,
} from './deck-rules/index.js';
```

- [ ] **Paso 5: ejecutar todo y comprobar que pasa**

```bash
npm run build && npm test
```

Esperado: `tsc --build` sin salida, y `Tests  258 passed` — los 202 previos más los 56 de las
tareas 1 a 6 (16 + 6 + 11 + 13 + 7 + 3). Si el número no cuadra exactamente, lo que importa es que
**no falle ninguno** y que los 202 previos sigan verdes.

- [ ] **Paso 6: commit**

```bash
git add packages/shared/src/ && git commit -m "feat(deck-rules): expose validateDeck from @tcg/shared (T-044)"
```

---

## Tarea 7 — `DeckRepository`

Los repositorios de este proyecto no se prueban con dobles: se verifican contra MySQL real (S011,
S013, S014). Aquí se hace igual, y ahora es cómodo porque el entorno de Docker está levantado.

**Ficheros:**
- Crear: `apps/api/src/db/deck-repository.ts`
- Modificar: `apps/api/src/db/index.ts`
- Crear (temporal, no se commitea): un script de verificación en el scratchpad

- [ ] **Paso 1: escribir el repositorio**

`apps/api/src/db/deck-repository.ts`:

```ts
import type { GameCode, DeckZone, GameData } from '@tcg/shared';
import { GAME_IDS } from '@tcg/shared';
import type { Database } from './connection.js';

export interface DeckSummary {
  id: number;
  game: GameCode;
  name: string;
  description: string | null;
  format: string | null;
  isPublic: boolean;
  counts: Record<DeckZone, number>;
  createdAt: string;
  updatedAt: string;
}

/** Una carta del mazo, ya resuelta contra el catalogo y contra la coleccion. */
export interface DeckCardRow {
  printId: number;
  cardId: number;
  oracleKey: string;
  name: string;
  typeLine: string | null;
  gameData: GameData;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  zone: DeckZone;
  quantity: number;
  imagePath: string | null;
  /** Copias que el usuario posee, sumando acabados. 0 si no la tiene (RN-03). */
  owned: number;
}

export interface DeckDetail extends DeckSummary {
  cards: DeckCardRow[];
}

export interface DeckInput {
  game: GameCode;
  name: string;
  description?: string | null;
  format?: string | null;
  isPublic?: boolean;
}

export interface DeckHeaderPatch {
  name?: string;
  description?: string | null;
  format?: string | null;
  isPublic?: boolean;
}

export interface DeckCardInput {
  printId: number;
  zone: DeckZone;
  quantity: number;
}

/** Impresion resuelta: sirve para comprobar existencia y juego de golpe. */
export interface ResolvedPrint {
  printId: number;
  game: GameCode;
}

const EMPTY_COUNTS: Record<DeckZone, number> = { main: 0, extra: 0, side: 0, commander: 0 };

/**
 * Acceso a `decks` y `deck_cards` en SQL plano (ADR-006).
 *
 * TODA operacion lleva `user_id` en el WHERE. No se lee primero y se comprueba
 * despues: la pertenencia es parte de la consulta. Un `findById` que devolviera
 * el mazo y dejara la comprobacion a la capa de arriba seria una fuga esperando
 * a que alguien olvide el `if`.
 */
export class DeckRepository {
  constructor(private readonly db: Database) {}

  async listByUser(userId: number, game?: GameCode): Promise<DeckSummary[]> {
    const where = ['d.user_id = ?'];
    const params: unknown[] = [userId];
    if (game) {
      where.push('d.game_id = ?');
      params.push(GAME_IDS[game]);
    }

    const rows = await this.db.select<{
      id: number; game: string; name: string; description: string | null;
      format: string | null; is_public: number; created_at: string; updated_at: string;
      main: number; extra: number; side: number; commander: number;
    }>(
      `SELECT d.id, g.code AS game, d.name, d.description, d.format, d.is_public,
              d.created_at, d.updated_at,
              COALESCE(SUM(CASE WHEN dc.zone = 'main' THEN dc.quantity END), 0) AS main,
              COALESCE(SUM(CASE WHEN dc.zone = 'extra' THEN dc.quantity END), 0) AS extra,
              COALESCE(SUM(CASE WHEN dc.zone = 'side' THEN dc.quantity END), 0) AS side,
              COALESCE(SUM(CASE WHEN dc.zone = 'commander' THEN dc.quantity END), 0) AS commander
       FROM decks d
       JOIN games g ON g.id = d.game_id
       LEFT JOIN deck_cards dc ON dc.deck_id = d.id
       WHERE ${where.join(' AND ')}
       GROUP BY d.id
       ORDER BY d.updated_at DESC, d.id DESC`,
      params,
    );

    return rows.map((row) => this.#toSummary(row));
  }

  /**
   * Mazo completo. Dos consultas —cabecera y cartas—, nunca una por carta.
   *
   * El JOIN con `cards` trae lo que el motor de reglas necesita (`oracle_key`,
   * `type_line`, `game_data`); el LEFT JOIN correlacionado con `user_collection`
   * trae las copias poseidas. Es LEFT y no INNER a proposito: una carta que no
   * posees debe aparecer con 0, no desaparecer (RN-03).
   */
  async findById(deckId: number, userId: number): Promise<DeckDetail | null> {
    const cabeceras = await this.db.select<{
      id: number; game: string; name: string; description: string | null;
      format: string | null; is_public: number; created_at: string; updated_at: string;
    }>(
      `SELECT d.id, g.code AS game, d.name, d.description, d.format, d.is_public,
              d.created_at, d.updated_at
       FROM decks d
       JOIN games g ON g.id = d.game_id
       WHERE d.id = ? AND d.user_id = ?`,
      [deckId, userId],
    );

    const cabecera = cabeceras[0];
    if (!cabecera) return null;

    const filas = await this.db.select<{
      print_id: number; card_id: number; oracle_key: string; name: string;
      type_line: string | null; game_data: GameData; set_code: string; set_name: string;
      collector_number: string; rarity: string; zone: DeckZone; quantity: number;
      image_local_path: string | null; owned: number;
    }>(
      `SELECT p.id AS print_id, c.id AS card_id, c.oracle_key, c.name, c.type_line,
              c.game_data, s.code AS set_code, s.name AS set_name,
              p.collector_number, r.code AS rarity, dc.zone, dc.quantity,
              p.image_local_path,
              (SELECT COALESCE(SUM(uc.quantity), 0)
                 FROM user_collection uc
                WHERE uc.user_id = ? AND uc.card_print_id = p.id) AS owned
       FROM deck_cards dc
       JOIN card_prints p ON p.id = dc.card_print_id
       JOIN cards c ON c.id = p.card_id
       JOIN sets s ON s.id = p.set_id
       JOIN rarities r ON r.id = p.rarity_id
       WHERE dc.deck_id = ?
       ORDER BY dc.zone, c.name, p.id`,
      [userId, deckId],
    );

    const counts = { ...EMPTY_COUNTS };
    const cards: DeckCardRow[] = filas.map((fila) => {
      counts[fila.zone] += Number(fila.quantity);
      return {
        printId: Number(fila.print_id),
        cardId: Number(fila.card_id),
        oracleKey: fila.oracle_key,
        name: fila.name,
        typeLine: fila.type_line,
        gameData: fila.game_data,
        setCode: fila.set_code,
        setName: fila.set_name,
        collectorNumber: fila.collector_number,
        rarity: fila.rarity,
        zone: fila.zone,
        quantity: Number(fila.quantity),
        imagePath: fila.image_local_path,
        owned: Number(fila.owned),
      };
    });

    return { ...this.#toSummary({ ...cabecera, ...EMPTY_COUNTS }), counts, cards };
  }

  /**
   * Crea el mazo y devuelve su resumen.
   *
   * El id sale de `insertId`, como en `PackRepositoryMysql`: MySQL 8 no soporta
   * `INSERT ... RETURNING` (eso es de MariaDB). Va en transaccion para que el
   * INSERT y la lectura posterior compartan conexion.
   */
  async create(userId: number, input: DeckInput): Promise<DeckSummary> {
    const id = await this.db.transaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO decks (user_id, game_id, name, description, format, is_public)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          GAME_IDS[input.game],
          input.name,
          input.description ?? null,
          input.format ?? null,
          input.isPublic ? 1 : 0,
        ],
      );
      return Number((result as { insertId: number }).insertId);
    });

    const mazo = (await this.listByUser(userId)).find((d) => d.id === id);
    if (!mazo) throw new Error(`El mazo ${id} no aparece tras crearlo`);
    return mazo;
  }

  async updateHeader(
    deckId: number,
    userId: number,
    patch: DeckHeaderPatch,
  ): Promise<DeckSummary | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
    if (patch.description !== undefined) { sets.push('description = ?'); params.push(patch.description); }
    if (patch.format !== undefined) { sets.push('format = ?'); params.push(patch.format); }
    if (patch.isPublic !== undefined) { sets.push('is_public = ?'); params.push(patch.isPublic ? 1 : 0); }

    if (sets.length > 0) {
      params.push(deckId, userId);
      await this.db.query(
        `UPDATE decks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
        params,
      );
    }

    const mazos = await this.listByUser(userId);
    return mazos.find((d) => d.id === deckId) ?? null;
  }

  /**
   * Reemplaza el contenido entero, en una transaccion.
   *
   * Sin transaccion, un fallo a mitad deja el mazo vacio. El `SELECT ... FOR
   * UPDATE` inicial hace dos cosas a la vez: comprueba la pertenencia y bloquea
   * la fila mientras se reescribe.
   *
   * Devuelve false si el mazo no existe o no es del usuario, para que la ruta
   * responda 404 sin una consulta previa.
   */
  async replaceCards(
    deckId: number,
    userId: number,
    entries: readonly DeckCardInput[],
  ): Promise<boolean> {
    // Dos filas con la misma (impresion, zona) violarian uq_deck_card_zone. Se
    // fusionan sumando: el cliente manda una lista, no un conjunto.
    const fusionadas = new Map<string, DeckCardInput>();
    for (const entry of entries) {
      const clave = `${entry.printId}:${entry.zone}`;
      const previa = fusionadas.get(clave);
      fusionadas.set(
        clave,
        previa
          ? { ...previa, quantity: previa.quantity + entry.quantity }
          : { ...entry },
      );
    }

    return this.db.transaction(async (conn) => {
      const [propias] = await conn.query(
        'SELECT id FROM decks WHERE id = ? AND user_id = ? FOR UPDATE',
        [deckId, userId],
      );
      if ((propias as unknown[]).length === 0) return false;

      await conn.query('DELETE FROM deck_cards WHERE deck_id = ?', [deckId]);

      const filas = [...fusionadas.values()];
      if (filas.length > 0) {
        const valores = filas.map(() => '(?, ?, ?, ?)').join(', ');
        const params = filas.flatMap((f) => [deckId, f.printId, f.zone, f.quantity]);
        await conn.query(
          `INSERT INTO deck_cards (deck_id, card_print_id, zone, quantity) VALUES ${valores}`,
          params,
        );
      }

      // updated_at solo salta si cambia alguna columna de `decks`; se toca a
      // mano para que la lista ordenada por fecha refleje la edicion.
      await conn.query('UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deckId]);
      return true;
    });
  }

  async remove(deckId: number, userId: number): Promise<boolean> {
    const filas = await this.db.select<{ id: number }>(
      'SELECT id FROM decks WHERE id = ? AND user_id = ?',
      [deckId, userId],
    );
    if (filas.length === 0) return false;
    // deck_cards cae por ON DELETE CASCADE.
    await this.db.query('DELETE FROM decks WHERE id = ? AND user_id = ?', [deckId, userId]);
    return true;
  }

  /**
   * Resuelve impresiones a su juego, en UNA consulta.
   *
   * La ruta lo usa para distinguir "no existe" de "es de otro juego" sin pedir
   * las cartas una a una.
   */
  async resolvePrints(printIds: readonly number[]): Promise<ResolvedPrint[]> {
    if (printIds.length === 0) return [];
    const huecos = printIds.map(() => '?').join(', ');
    const filas = await this.db.select<{ print_id: number; game: string }>(
      `SELECT p.id AS print_id, g.code AS game
       FROM card_prints p
       JOIN sets s ON s.id = p.set_id
       JOIN games g ON g.id = s.game_id
       WHERE p.id IN (${huecos})`,
      [...printIds],
    );
    return filas.map((fila) => ({
      printId: Number(fila.print_id),
      game: fila.game as GameCode,
    }));
  }

  #toSummary(row: {
    id: number; game: string; name: string; description: string | null;
    format: string | null; is_public: number; created_at: string; updated_at: string;
    main: number; extra: number; side: number; commander: number;
  }): DeckSummary {
    return {
      id: Number(row.id),
      game: row.game as GameCode,
      name: row.name,
      description: row.description,
      format: row.format,
      isPublic: row.is_public === 1,
      counts: {
        main: Number(row.main),
        extra: Number(row.extra),
        side: Number(row.side),
        commander: Number(row.commander),
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
```

- [ ] **Paso 2: exportar desde el barrel**

En `apps/api/src/db/index.ts`, añadir:

```ts
export { DeckRepository } from './deck-repository.js';
export type {
  DeckSummary, DeckDetail, DeckCardRow, DeckInput, DeckHeaderPatch, DeckCardInput, ResolvedPrint,
} from './deck-repository.js';
```

- [ ] **Paso 3: compilar y verificar contra MySQL real**

```bash
npm run build
```

Crea `%TEMP%\claude\...\scratchpad\verificar-decks.mjs` (ruta del scratchpad de la sesión) con:

```js
import { Database } from '../../../../../../TCGProyect/apps/api/dist/db/connection.js';
import { DeckRepository } from '../../../../../../TCGProyect/apps/api/dist/db/deck-repository.js';

const db = new Database({ url: 'mysql://tcg:cambiame@127.0.0.1:3307/proyecto_tcg' });
const repo = new DeckRepository(db);

// Usuario de prueba. Se crea a pelo: esta verificacion no pasa por la API.
// El hash es basura a proposito — aqui nadie hace login.
await db.query(
  `INSERT IGNORE INTO users (email, display_name, password_hash)
   VALUES ('deck-test@example.com', 'Deck Test', 'sin-login')`,
);
const [usuario] = await db.select('SELECT id FROM users WHERE email = ?', ['deck-test@example.com']);
const userId = Number(usuario.id);

const mazo = await repo.create(userId, { game: 'YGO', name: 'Mazo de prueba' });
console.log('creado:', mazo.id, mazo.counts);

const prints = await db.select('SELECT id FROM card_prints LIMIT 2');
const ok = await repo.replaceCards(mazo.id, userId, [
  { printId: prints[0].id, zone: 'main', quantity: 3 },
  { printId: prints[0].id, zone: 'main', quantity: 1 }, // duplicado: debe fusionarse a 4
  { printId: prints[1].id, zone: 'main', quantity: 2 },
]);
console.log('replaceCards:', ok);

const detalle = await repo.findById(mazo.id, userId);
console.log('cartas:', detalle.cards.length, 'counts:', detalle.counts);
console.log('duplicado fusionado a:', detalle.cards.find((c) => c.printId === prints[0].id).quantity);
console.log('owned del primero:', detalle.cards[0].owned);

console.log('mazo ajeno (userId+9999):', await repo.findById(mazo.id, userId + 9999));

console.log('remove:', await repo.remove(mazo.id, userId));
const [{ n }] = await db.select('SELECT COUNT(*) AS n FROM deck_cards WHERE deck_id = ?', [mazo.id]);
console.log('deck_cards tras el borrado (debe ser 0):', n);

await db.close();
```

```bash
node <ruta-del-scratchpad>/verificar-decks.mjs
```

Esperado, línea a línea:
- `creado: <n> { main: 0, extra: 0, side: 0, commander: 0 }`
- `replaceCards: true`
- `cartas: 2` — dos filas, no tres: el duplicado se fusionó
- `duplicado fusionado a: 4`
- `owned del primero:` un número (0 si el usuario no tiene la carta)
- `mazo ajeno (userId+9999): null`
- `remove: true`
- `deck_cards tras el borrado (debe ser 0): 0`

Si algo no cuadra, **el dato manda**: corrige el repositorio y vuelve a ejecutar.

- [ ] **Paso 4: commit**

```bash
git add apps/api/src/db/ && git commit -m "feat(decks): add DeckRepository with transactional content replace (T-045)"
```

---

## Tarea 8 — Esquemas de las rutas

**Ficheros:**
- Crear: `apps/api/src/api/deck-schemas.ts`

- [ ] **Paso 1: escribir los esquemas**

`apps/api/src/api/deck-schemas.ts`:

```ts
/**
 * Esquemas de las rutas de mazos.
 *
 * Fastify los APLICA: lo que no este declarado en `response` NO sale. Aqui eso
 * protege lo de siempre — `card_prints.image_source_url` no aparece, y por tanto
 * no puede filtrarse (P-001). `sets.icon_url` tampoco (P-022).
 */

const ERROR = {
  type: 'object',
  properties: { error: { type: 'string' }, message: { type: 'string' } },
} as const;

const COUNTS = {
  type: 'object',
  properties: {
    main: { type: 'integer' },
    extra: { type: 'integer' },
    side: { type: 'integer' },
    commander: { type: 'integer' },
  },
} as const;

const DECK_SUMMARY = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    game: { type: 'string' },
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    format: { type: ['string', 'null'] },
    isPublic: { type: 'boolean' },
    counts: COUNTS,
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

const DECK_CARD = {
  type: 'object',
  properties: {
    printId: { type: 'integer' },
    cardId: { type: 'integer' },
    name: { type: 'string' },
    typeLine: { type: ['string', 'null'] },
    setCode: { type: 'string' },
    setName: { type: 'string' },
    collectorNumber: { type: 'string' },
    rarity: { type: 'string' },
    zone: { type: 'string' },
    quantity: { type: 'integer' },
    imagePath: { type: ['string', 'null'] },
    owned: { type: 'integer' },
  },
} as const;

const VALIDATION = {
  type: 'object',
  properties: {
    valid: { type: 'boolean' },
    counts: COUNTS,
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          oracleKey: { type: 'string' },
          cardName: { type: 'string' },
          zone: { type: 'string' },
          actual: { type: 'integer' },
          allowed: { type: 'integer' },
        },
      },
    },
  },
} as const;

const DECK_DETAIL = {
  type: 'object',
  properties: {
    ...DECK_SUMMARY.properties,
    cards: { type: 'array', items: DECK_CARD },
    validation: VALIDATION,
  },
} as const;

export const LIST_DECKS = {
  querystring: {
    type: 'object',
    properties: { game: { type: 'string', enum: ['MTG', 'YGO', 'PTCG'] } },
    additionalProperties: false,
  },
  response: {
    200: { type: 'object', properties: { data: { type: 'array', items: DECK_SUMMARY } } },
    401: ERROR,
  },
} as const;

export const CREATE_DECK = {
  body: {
    type: 'object',
    required: ['game', 'name'],
    properties: {
      game: { type: 'string', enum: ['MTG', 'YGO', 'PTCG'] },
      name: { type: 'string', minLength: 1, maxLength: 120 },
      description: { type: ['string', 'null'], maxLength: 2000 },
      format: { type: ['string', 'null'], maxLength: 32 },
      isPublic: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  response: {
    201: { type: 'object', properties: { data: DECK_SUMMARY } },
    400: ERROR,
    401: ERROR,
  },
} as const;

export const GET_DECK = {
  params: { type: 'object', properties: { id: { type: 'integer' } } },
  response: {
    200: { type: 'object', properties: { data: DECK_DETAIL } },
    401: ERROR,
    404: ERROR,
  },
} as const;

export const PATCH_DECK = {
  params: { type: 'object', properties: { id: { type: 'integer' } } },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      description: { type: ['string', 'null'], maxLength: 2000 },
      format: { type: ['string', 'null'], maxLength: 32 },
      isPublic: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  response: {
    200: { type: 'object', properties: { data: DECK_SUMMARY } },
    400: ERROR,
    401: ERROR,
    404: ERROR,
  },
} as const;

/** Tope de filas por peticion: un cuerpo enorme se rechaza antes de tocar la BD. */
export const MAX_DECK_CARD_ROWS = 400;

export const PUT_DECK_CARDS = {
  params: { type: 'object', properties: { id: { type: 'integer' } } },
  body: {
    type: 'object',
    required: ['cards'],
    properties: {
      cards: {
        type: 'array',
        maxItems: MAX_DECK_CARD_ROWS,
        items: {
          type: 'object',
          required: ['printId', 'zone', 'quantity'],
          properties: {
            printId: { type: 'integer', minimum: 1 },
            zone: { type: 'string', enum: ['main', 'extra', 'side', 'commander'] },
            // El CHECK de la tabla es BETWEEN 1 AND 99. El esquema lo repite
            // para que el error salga en la API y no como fallo de MySQL.
            quantity: { type: 'integer', minimum: 1, maximum: 99 },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  response: {
    200: { type: 'object', properties: { data: DECK_DETAIL } },
    400: ERROR,
    401: ERROR,
    404: ERROR,
    422: ERROR,
  },
} as const;

export const DELETE_DECK = {
  params: { type: 'object', properties: { id: { type: 'integer' } } },
  response: {
    200: { type: 'object', properties: { data: { type: 'object', properties: { id: { type: 'integer' } } } } },
    401: ERROR,
    404: ERROR,
  },
} as const;
```

- [ ] **Paso 2: compilar**

```bash
npm run build
```

Esperado: sin salida.

- [ ] **Paso 3: commit**

```bash
git add apps/api/src/api/deck-schemas.ts && git commit -m "feat(decks): add request and response schemas for deck routes (T-046)"
```

---

## Tarea 9 — Las rutas

**Ficheros:**
- Crear: `apps/api/src/api/require-user.ts`
- Modificar: `apps/api/src/api/auth-routes.ts` (usar el helper extraído)
- Crear: `apps/api/src/api/deck-routes.ts`
- Crear: `apps/api/src/api/deck-routes.test.ts`
- Modificar: `apps/api/src/api/server.ts`
- Modificar: `apps/api/src/api/index.ts`

- [ ] **Paso 1: extraer `requireUser`**

Hoy vive dentro de `registerAuthRoutes`. Las rutas de mazos necesitan lo mismo y copiarlo sería
duplicar una comprobación de seguridad, que es la peor clase de duplicación.

Crear `apps/api/src/api/require-user.ts`:

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Extrae el usuario del token. Devuelve null y responde 401 si no es valido.
 *
 * El `user_id` sale SIEMPRE del token, nunca del cuerpo ni de la ruta: si
 * viniera de fuera, cualquiera podria pedir la coleccion o los mazos de otro.
 */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ id: number } | null> {
  try {
    await request.jwtVerify();
    const payload = request.user as { sub?: unknown };
    const id = Number(payload?.sub);
    if (!Number.isInteger(id) || id <= 0) throw new Error('sub invalido');
    return { id };
  } catch {
    await reply.code(401).send({ error: 'unauthorized', message: 'Token ausente o invalido' });
    return null;
  }
}
```

En `apps/api/src/api/auth-routes.ts`, borrar la definición local de `requireUser`
(la constante `const requireUser = async (...)` que hay dentro de `registerAuthRoutes`) y añadir
arriba:

```ts
import { requireUser } from './require-user.js';
```

- [ ] **Paso 2: comprobar que no se ha roto nada**

```bash
npm run build && npx vitest run apps/api/src/api/auth-routes.test.ts
```

Esperado: build sin salida y todos los tests de `auth-routes` en verde. Es una refactorización pura:
si algo falla, es que se ha cambiado comportamiento.

- [ ] **Paso 3: escribir el test de rutas que falla**

`apps/api/src/api/deck-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildFullServer } from './server.js';
import { hashPassword, warmUp } from '../auth/password.js';
import type { PublicUser, UserRecord } from '../auth/user-repository.js';
import { EmailAlreadyExistsError } from '../auth/user-repository.js';
import type { DeckCardInput, DeckDetail, DeckSummary } from '../db/deck-repository.js';

const SECRETO = 'un-secreto-suficientemente-largo-para-produccion-2026';

class FakeUsers {
  readonly porEmail = new Map<string, UserRecord>();
  #siguienteId = 1;
  async findByEmail(email: string) { return this.porEmail.get(email) ?? null; }
  async findById(id: number): Promise<PublicUser | null> {
    for (const u of this.porEmail.values()) {
      if (u.id === id) return { id: u.id, email: u.email, displayName: u.displayName };
    }
    return null;
  }
  async create(email: string, displayName: string, passwordHash: string): Promise<PublicUser> {
    if (this.porEmail.has(email)) throw new EmailAlreadyExistsError(email);
    const user: UserRecord = {
      id: this.#siguienteId++, email, displayName, passwordHash,
      createdAt: '2026-08-25T00:00:00Z',
    };
    this.porEmail.set(email, user);
    return { id: user.id, email, displayName };
  }
}

class FakeCollection {
  async list() { return { items: [], nextCursor: null }; }
  async completion() { return []; }
  async summary() { return { entries: 0, copies: 0, openings: 0 }; }
}

class FakePacks {
  async open() { throw new Error('no usado'); }
  async replay() { return null; }
}

/** Repositorio de mazos en memoria con la MISMA semantica que el real. */
class FakeDecks {
  readonly mazos = new Map<number, DeckSummary & { userId: number; cards: DeckCardInput[] }>();
  #siguienteId = 1;
  /** printId -> juego. Fija lo que "existe" en el catalogo del doble. */
  readonly catalogo = new Map<number, 'MTG' | 'YGO' | 'PTCG'>([
    [10, 'YGO'], [11, 'YGO'], [90, 'MTG'],
  ]);

  async listByUser(userId: number, game?: string) {
    return [...this.mazos.values()]
      .filter((d) => d.userId === userId && (!game || d.game === game))
      .map(({ userId: _u, cards: _c, ...resto }) => resto);
  }

  async create(userId: number, input: { game: 'MTG' | 'YGO' | 'PTCG'; name: string }) {
    const mazo = {
      id: this.#siguienteId++, userId, game: input.game, name: input.name,
      description: null, format: null, isPublic: false,
      counts: { main: 0, extra: 0, side: 0, commander: 0 },
      createdAt: '2026-08-25T00:00:00Z', updatedAt: '2026-08-25T00:00:00Z',
      cards: [] as DeckCardInput[],
    };
    this.mazos.set(mazo.id, mazo);
    const { userId: _u, cards: _c, ...resto } = mazo;
    return resto;
  }

  async findById(deckId: number, userId: number): Promise<DeckDetail | null> {
    const mazo = this.mazos.get(deckId);
    if (!mazo || mazo.userId !== userId) return null;
    const counts = { main: 0, extra: 0, side: 0, commander: 0 };
    const cards = mazo.cards.map((c, i) => {
      counts[c.zone] += c.quantity;
      return {
        printId: c.printId, cardId: c.printId, oracleKey: `carta-${c.printId}`,
        name: `Carta ${c.printId}`, typeLine: 'Effect Monster', gameData: {},
        setCode: 'TST', setName: 'Test', collectorNumber: String(i + 1), rarity: 'common',
        zone: c.zone, quantity: c.quantity, imagePath: null, owned: 0,
      };
    });
    const { userId: _u, cards: _c, ...resto } = mazo;
    return { ...resto, counts, cards };
  }

  async updateHeader(deckId: number, userId: number, patch: Record<string, unknown>) {
    const mazo = this.mazos.get(deckId);
    if (!mazo || mazo.userId !== userId) return null;
    Object.assign(mazo, patch);
    const { userId: _u, cards: _c, ...resto } = mazo;
    return resto;
  }

  async replaceCards(deckId: number, userId: number, entries: DeckCardInput[]) {
    const mazo = this.mazos.get(deckId);
    if (!mazo || mazo.userId !== userId) return false;
    mazo.cards = [...entries];
    return true;
  }

  async remove(deckId: number, userId: number) {
    const mazo = this.mazos.get(deckId);
    if (!mazo || mazo.userId !== userId) return false;
    this.mazos.delete(deckId);
    return true;
  }

  async resolvePrints(printIds: number[]) {
    return printIds
      .filter((id) => this.catalogo.has(id))
      .map((id) => ({ printId: id, game: this.catalogo.get(id)! }));
  }
}

/** Mismo doble de catalogo que `auth-routes.test.ts`: estas rutas no lo tocan. */
const catalogoFalso = {
  listGames: async () => [],
  listSets: async () => [],
  listRarities: async () => [],
  searchCards: async () => ({ items: [], nextCursor: null }),
  findCard: async () => null,
};

let app: FastifyInstance;
let decks: FakeDecks;
let tokenA = '';
let tokenB = '';

beforeAll(async () => {
  await warmUp();
  decks = new FakeDecks();
  app = await buildFullServer({
    catalog: catalogoFalso as never,
    auth: {
      users: new FakeUsers() as never,
      collection: new FakeCollection() as never,
      packs: new FakePacks() as never,
      decks: decks as never,
      jwtSecret: SECRETO,
    },
  });

  for (const email of ['a@example.com', 'b@example.com']) {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email, displayName: 'Usuario', password: 'contrasena-larga-1' },
    });
    const token = res.json().token as string;
    if (email === 'a@example.com') tokenA = token; else tokenB = token;
  }
});

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe('rutas de mazos', () => {
  it('sin token responde 401 en todas', async () => {
    for (const [method, url] of [
      ['GET', '/api/decks'], ['POST', '/api/decks'], ['GET', '/api/decks/1'],
      ['PATCH', '/api/decks/1'], ['PUT', '/api/decks/1/cards'], ['DELETE', '/api/decks/1'],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode).toBe(401);
    }
  });

  it('crea un mazo vacio y lo lista', async () => {
    const creado = await app.inject({
      method: 'POST', url: '/api/decks', headers: auth(tokenA),
      payload: { game: 'YGO', name: 'Mi mazo' },
    });
    expect(creado.statusCode).toBe(201);
    expect(creado.json().data.name).toBe('Mi mazo');

    const lista = await app.inject({ method: 'GET', url: '/api/decks', headers: auth(tokenA) });
    expect(lista.json().data).toHaveLength(1);
  });

  it('devuelve la validacion junto al contenido y NO bloquea el guardado', async () => {
    const creado = await app.inject({
      method: 'POST', url: '/api/decks', headers: auth(tokenA),
      payload: { game: 'YGO', name: 'Incompleto' },
    });
    const id = creado.json().data.id as number;

    // Tres cartas: invalido en Yu-Gi-Oh!, pero se guarda igual (D2).
    const guardado = await app.inject({
      method: 'PUT', url: `/api/decks/${id}/cards`, headers: auth(tokenA),
      payload: { cards: [{ printId: 10, zone: 'main', quantity: 3 }] },
    });
    expect(guardado.statusCode).toBe(200);
    expect(guardado.json().data.validation.valid).toBe(false);
    expect(guardado.json().data.validation.issues.map((i: { code: string }) => i.code))
      .toContain('main_too_small');
    expect(guardado.json().data.cards).toHaveLength(1);
  });

  it('una impresion de otro juego es 422 game_mismatch', async () => {
    const creado = await app.inject({
      method: 'POST', url: '/api/decks', headers: auth(tokenA),
      payload: { game: 'YGO', name: 'Mezclado' },
    });
    const id = creado.json().data.id as number;
    const res = await app.inject({
      method: 'PUT', url: `/api/decks/${id}/cards`, headers: auth(tokenA),
      payload: { cards: [{ printId: 90, zone: 'main', quantity: 1 }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('game_mismatch');
  });

  it('una impresion inexistente es 422 unknown_print', async () => {
    const creado = await app.inject({
      method: 'POST', url: '/api/decks', headers: auth(tokenA),
      payload: { game: 'YGO', name: 'Fantasma' },
    });
    const id = creado.json().data.id as number;
    const res = await app.inject({
      method: 'PUT', url: `/api/decks/${id}/cards`, headers: auth(tokenA),
      payload: { cards: [{ printId: 999999, zone: 'main', quantity: 1 }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('unknown_print');
  });

  it('el mazo de OTRO usuario responde 404, no 403', async () => {
    const creado = await app.inject({
      method: 'POST', url: '/api/decks', headers: auth(tokenA),
      payload: { game: 'YGO', name: 'Privado' },
    });
    const id = creado.json().data.id as number;

    for (const peticion of [
      { method: 'GET' as const, url: `/api/decks/${id}`, payload: undefined },
      { method: 'PATCH' as const, url: `/api/decks/${id}`, payload: { name: 'Robado' } },
      { method: 'PUT' as const, url: `/api/decks/${id}/cards`, payload: { cards: [] } },
      { method: 'DELETE' as const, url: `/api/decks/${id}`, payload: undefined },
    ]) {
      const res = await app.inject({ ...peticion, headers: auth(tokenB) });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('not_found');
    }
  });

  it('un PUT vacio deja el mazo vacio sin borrarlo', async () => {
    const creado = await app.inject({
      method: 'POST', url: '/api/decks', headers: auth(tokenA),
      payload: { game: 'YGO', name: 'Se vacia' },
    });
    const id = creado.json().data.id as number;
    await app.inject({
      method: 'PUT', url: `/api/decks/${id}/cards`, headers: auth(tokenA),
      payload: { cards: [{ printId: 10, zone: 'main', quantity: 3 }] },
    });
    const vaciado = await app.inject({
      method: 'PUT', url: `/api/decks/${id}/cards`, headers: auth(tokenA),
      payload: { cards: [] },
    });
    expect(vaciado.statusCode).toBe(200);
    expect(vaciado.json().data.cards).toHaveLength(0);
    const sigue = await app.inject({ method: 'GET', url: `/api/decks/${id}`, headers: auth(tokenA) });
    expect(sigue.statusCode).toBe(200);
  });

  it('ninguna respuesta contiene una URL externa (P-001, P-022)', async () => {
    const creado = await app.inject({
      method: 'POST', url: '/api/decks', headers: auth(tokenA),
      payload: { game: 'YGO', name: 'Sin URLs' },
    });
    const id = creado.json().data.id as number;
    await app.inject({
      method: 'PUT', url: `/api/decks/${id}/cards`, headers: auth(tokenA),
      payload: { cards: [{ printId: 10, zone: 'main', quantity: 1 }] },
    });
    const res = await app.inject({ method: 'GET', url: `/api/decks/${id}`, headers: auth(tokenA) });
    expect(res.body).not.toContain('http');
  });

  it('borra el mazo', async () => {
    const creado = await app.inject({
      method: 'POST', url: '/api/decks', headers: auth(tokenA),
      payload: { game: 'YGO', name: 'Efimero' },
    });
    const id = creado.json().data.id as number;
    expect((await app.inject({ method: 'DELETE', url: `/api/decks/${id}`, headers: auth(tokenA) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/decks/${id}`, headers: auth(tokenA) })).statusCode).toBe(404);
  });
});
```

- [ ] **Paso 4: ejecutar y comprobar que falla**

```bash
npx vitest run apps/api/src/api/deck-routes.test.ts
```

Esperado: falla al resolver `./deck-routes.js` o por `decks` no reconocido en `auth`.

- [ ] **Paso 5: escribir las rutas**

`apps/api/src/api/deck-routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { DeckEntry, DeckValidation, GameCode } from '@tcg/shared';
import { validateDeck } from '@tcg/shared';
import type {
  DeckCardInput, DeckDetail, DeckRepository,
} from '../db/deck-repository.js';
import { requireUser } from './require-user.js';
import {
  CREATE_DECK, DELETE_DECK, GET_DECK, LIST_DECKS, PATCH_DECK, PUT_DECK_CARDS,
} from './deck-schemas.js';

export interface DeckRoutesOptions {
  decks: DeckRepository;
}

const NO_ENCONTRADO = { error: 'not_found', message: 'El mazo no existe' };

/**
 * Traduce el mazo leido a la entrada del motor de reglas.
 *
 * El motor agrupa por `oracleKey`: dos impresiones distintas de la misma carta
 * llegan como dos entradas y cuentan como UNA (D3 del spec).
 */
function toEntries(detalle: DeckDetail): DeckEntry[] {
  return detalle.cards.map((card) => ({
    oracleKey: card.oracleKey,
    name: card.name,
    typeLine: card.typeLine,
    gameData: card.gameData,
    zone: card.zone,
    quantity: card.quantity,
  }));
}

function withValidation(detalle: DeckDetail): DeckDetail & { validation: DeckValidation } {
  return { ...detalle, validation: validateDeck(detalle.game, toEntries(detalle)) };
}

export async function registerDeckRoutes(
  app: FastifyInstance,
  options: DeckRoutesOptions,
): Promise<void> {
  const { decks } = options;

  app.get<{ Querystring: { game?: GameCode } }>(
    '/api/decks',
    { schema: LIST_DECKS },
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      return { data: await decks.listByUser(user.id, request.query.game) };
    },
  );

  app.post<{
    Body: { game: GameCode; name: string; description?: string | null; format?: string | null; isPublic?: boolean };
  }>('/api/decks', { schema: CREATE_DECK }, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const mazo = await decks.create(user.id, request.body);
    return reply.code(201).send({ data: mazo });
  });

  app.get<{ Params: { id: number } }>(
    '/api/decks/:id',
    { schema: GET_DECK },
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const detalle = await decks.findById(request.params.id, user.id);
      // 404 y no 403: decir "existe pero no es tuyo" convierte la API en un
      // enumerador de identificadores (D6).
      if (!detalle) return reply.code(404).send(NO_ENCONTRADO);
      return { data: withValidation(detalle) };
    },
  );

  app.patch<{
    Params: { id: number };
    Body: { name?: string; description?: string | null; format?: string | null; isPublic?: boolean };
  }>('/api/decks/:id', { schema: PATCH_DECK }, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const mazo = await decks.updateHeader(request.params.id, user.id, request.body);
    if (!mazo) return reply.code(404).send(NO_ENCONTRADO);
    return { data: mazo };
  });

  app.put<{ Params: { id: number }; Body: { cards: DeckCardInput[] } }>(
    '/api/decks/:id/cards',
    { schema: PUT_DECK_CARDS },
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const actual = await decks.findById(request.params.id, user.id);
      if (!actual) return reply.code(404).send(NO_ENCONTRADO);

      const { cards } = request.body;
      const ids = [...new Set(cards.map((card) => card.printId))];
      const resueltas = await decks.resolvePrints(ids);
      const porId = new Map(resueltas.map((p) => [p.printId, p.game]));

      const desconocida = ids.find((id) => !porId.has(id));
      if (desconocida !== undefined) {
        return reply.code(422).send({
          error: 'unknown_print',
          message: `La impresion ${desconocida} no existe en el catalogo`,
        });
      }

      const ajena = ids.find((id) => porId.get(id) !== actual.game);
      if (ajena !== undefined) {
        return reply.code(422).send({
          error: 'game_mismatch',
          message: `La impresion ${ajena} no es de ${actual.game}`,
        });
      }

      const ok = await decks.replaceCards(request.params.id, user.id, cards);
      if (!ok) return reply.code(404).send(NO_ENCONTRADO);

      const detalle = await decks.findById(request.params.id, user.id);
      if (!detalle) return reply.code(404).send(NO_ENCONTRADO);
      return { data: withValidation(detalle) };
    },
  );

  app.delete<{ Params: { id: number } }>(
    '/api/decks/:id',
    { schema: DELETE_DECK },
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const borrado = await decks.remove(request.params.id, user.id);
      if (!borrado) return reply.code(404).send(NO_ENCONTRADO);
      return { data: { id: request.params.id } };
    },
  );
}
```

- [ ] **Paso 6: registrar las rutas en el servidor**

En `apps/api/src/api/server.ts`:

1. Añadir el import junto a los demás:

```ts
import { registerDeckRoutes } from './deck-routes.js';
import type { DeckRepository } from '../db/deck-repository.js';
```

2. En `ApiOptions`, dentro de `auth`, añadir la dependencia:

```ts
    decks: DeckRepository;
```

3. En `buildFullServer`, justo después de `await registerAuthRoutes(...)`:

```ts
  await registerDeckRoutes(app, { decks: options.auth.decks });
```

En `apps/api/src/api/index.ts`, añadir:

```ts
export { registerDeckRoutes } from './deck-routes.js';
export type { DeckRoutesOptions } from './deck-routes.js';
```

- [ ] **Paso 7: conectar el arranque real**

En `apps/api/src/index.ts`, añadir `DeckRepository` al import de `./db/index.js` y pasarlo:

```ts
    auth: {
      users: new UserRepository(db),
      collection: new CollectionRepository(db),
      packs: new PackService({ repository: new PackRepositoryMysql(db) }),
      decks: new DeckRepository(db),
      jwtSecret: config.jwtSecret,
    },
```

- [ ] **Paso 8: ejecutar y comprobar que pasa**

```bash
npm run build && npm test
```

Esperado: build sin salida y **toda** la suite en verde, incluidos los 202 tests previos.

- [ ] **Paso 9: commit**

```bash
git add apps/api/src/ && git commit -m "feat(decks): add six authenticated deck endpoints (T-046)"
```

---

## Tarea 10 — Verificación extremo a extremo y documentación

- [ ] **Paso 1: levantar el entorno y poblar el catálogo**

```bash
docker compose up -d --build
docker compose --profile ingest run --rm ingest --game YGO --sets 3 --no-images
```

Esperado: la API arranca *healthy* y la ingesta reporta impresiones procesadas y 0 fallidos.

- [ ] **Paso 2: recorrido completo contra la API real**

Script en el scratchpad, `verificar-h7.mjs`, contra `http://localhost:3000`:

```js
const API = 'http://localhost:3000';

async function json(method, url, { token, body } = {}) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.text() };
}

const sufijo = process.argv[2] ?? '1';
const reg = async (email) =>
  JSON.parse((await json('POST', '/api/auth/register', {
    body: { email, displayName: 'QA', password: 'contrasena-larga-1' },
  })).body).token;

const tokenA = await reg(`qa-a-${sufijo}@example.com`);
const tokenB = await reg(`qa-b-${sufijo}@example.com`);

const mazo = JSON.parse((await json('POST', '/api/decks', {
  token: tokenA, body: { game: 'YGO', name: 'Mazo QA' },
})).body).data;
console.log('1. mazo creado:', mazo.id);

// 40 impresiones de Main Deck (ni Fusion, ni Synchro, ni Xyz, ni Link).
const cards = JSON.parse((await json('GET', '/api/cards?game=YGO&limit=100')).body).data;
const main = cards.filter((c) => !/fusion|synchro|xyz|link/i.test(c.typeLine ?? '')).slice(0, 40);
const extra = cards.find((c) => /xyz|fusion|synchro|link/i.test(c.typeLine ?? ''));

const put = async (payload) => json('PUT', `/api/decks/${mazo.id}/cards`, { token: tokenA, body: { cards: payload } });

let r = await put(main.map((c) => ({ printId: c.printId, zone: 'main', quantity: 1 })));
let v = JSON.parse(r.body).data.validation;
console.log('2. 40 cartas -> valid:', v.valid, 'issues:', v.issues.map((i) => i.code));

r = await put([
  ...main.slice(0, 39).map((c) => ({ printId: c.printId, zone: 'main', quantity: 1 })),
  { printId: extra.printId, zone: 'main', quantity: 1 },
]);
v = JSON.parse(r.body).data.validation;
console.log('3. Extra Deck en el main -> issues:', v.issues.map((i) => i.code));

r = await put([
  ...main.slice(0, 36).map((c) => ({ printId: c.printId, zone: 'main', quantity: 1 })),
  { printId: main[0].printId, zone: 'main', quantity: 4 },
]);
v = JSON.parse(r.body).data.validation;
console.log('4. cuatro copias -> issues:', v.issues.map((i) => i.code));

console.log('6. mazo ajeno:', (await json('GET', `/api/decks/${mazo.id}`, { token: tokenB })).status);
console.log('7. borrado:', (await json('DELETE', `/api/decks/${mazo.id}`, { token: tokenA })).status);
console.log('   tras borrar:', (await json('GET', `/api/decks/${mazo.id}`, { token: tokenA })).status);

const cuerpo = (await json('GET', '/api/decks', { token: tokenA })).body;
console.log('URLs externas en la respuesta:', cuerpo.includes('http'));
```

```bash
node <ruta-del-scratchpad>/verificar-h7.mjs
```

Esperado:
- `2. 40 cartas -> valid: true issues: []`
- `3. Extra Deck en el main -> issues: [ 'wrong_zone' ]`
- `4. cuatro copias -> issues:` incluye `too_many_copies`
- `6. mazo ajeno: 404`
- `7. borrado: 200` y `tras borrar: 404`
- `URLs externas en la respuesta: false`

- [ ] **Paso 3: confirmar los predicados de MTG y PTCG contra datos reales**

Es el paso 8 de la verificación del spec: hoy esos dos predicados están razonados, no medidos.

```bash
docker compose --profile ingest run --rm ingest --game MTG --sets 2 --no-images
docker compose --profile ingest run --rm ingest --game PTCG --sets 2 --no-images
docker compose exec -T mysql mysql -uroot -proot proyecto_tcg -e "SELECT DISTINCT type_line FROM cards WHERE game_id = 1 AND type_line LIKE 'Basic%' LIMIT 10; SELECT name, JSON_EXTRACT(game_data,'\$.supertype'), JSON_EXTRACT(game_data,'\$.subtypes') FROM cards WHERE game_id = 3 AND JSON_EXTRACT(game_data,'\$.supertype') = 'Energy' LIMIT 10;"
```

Comprueba que las tierras básicas empiezan por `Basic` y que las Energías traen `subtypes` con
`Basic` o `Special`. **Si el dato no coincide con lo que supone `predicates.ts`, manda el dato:**
corrige el predicado, añade el caso real al test y vuelve a ejecutar la suite.

- [ ] **Paso 4: criterios de aceptación**

```bash
npm run build && npm test && npm audit
```

Esperado: build sin salida, toda la suite en verde, `found 0 vulnerabilities`.

- [ ] **Paso 5: actualizar el Vault**

- `005Registro/2026-08-25_S020_ConstructorDeMazos.md` — bitácora: qué se construyó, qué reveló la
  verificación, y cualquier problema nuevo con su número `P-0##`.
- `001Reportes/Tareas_Realizadas.md` — T-044, T-045, T-046, T-046v.
- `001Reportes/Tareas_Pendientes.md` — añadir T-047 (interfaz) y T-048 (import/export).
- `00Master/03_Hitos.md` — H7 pasa a 🟡 EN CURSO con el backend hecho.
- `00Master/05_Continuar_Aqui.md` — el siguiente paso natural pasa a ser T-047.
- `Claude.md` — añadir `deck-rules/` y los ficheros nuevos al mapa del Vault.

- [ ] **Paso 6: commit**

```bash
git add -A && git commit -m "docs(h7): record the deckbuilder backend session (S020)"
```

---

## Revisión del plan contra el spec

| Requisito del spec | Tarea |
|---|---|
| §3.1 contrato `DeckEntry`/`DeckIssue`/`DeckValidation`/`DeckValidator` | 2 |
| §3.2 reglas de MTG, YGO y PTCG | 3, 4, 5 |
| §3.3 las cuatro trampas | 1 (predicados) y 10 paso 3 (confirmación con datos reales) |
| §3.4 tests obligatorios | 1, 2, 3, 4, 5 |
| §4 repositorio, `userId` en el WHERE, transacción, sin N+1, `LEFT JOIN` de posesión | 7 |
| §5 seis endpoints, 404 en vez de 403, 422, sin URLs externas | 8, 9 |
| §6 verificación contra MySQL real, criterios de aceptación | 7, 10 |
| §7 T-044, T-045, T-046, T-046v y alta de T-047/T-048 | 1–6, 7, 9, 10 |

**Desviación consciente respecto al spec:** §4 dice "una consulta"; el plan usa **dos** —cabecera y
cartas—. Lo que el spec prohíbe es N+1 (una consulta por carta), y dos consultas fijas no lo son.
Fundir la cabecera en la consulta de cartas la repetiría en cada fila sin ganar nada.
