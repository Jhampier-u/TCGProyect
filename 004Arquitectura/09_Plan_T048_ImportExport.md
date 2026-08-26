# Plan de implementación — T-048, import/export de mazos

> **Para quien ejecute esto:** las tareas se hacen **en orden** y cada una acaba con su commit.
> Spec de referencia: [`08_Spec_T048_ImportExport.md`](08_Spec_T048_ImportExport.md).

**Objetivo:** exportar un mazo al formato de texto de su juego sin tocar el servidor, y reconstruirlo
pegándolo de vuelta, con un informe honesto de lo que no está en nuestro catálogo.

**Arquitectura:** los códecs son puros y viven en `@tcg/shared`, como el motor de reglas: convertir
texto en líneas no necesita base de datos, y así el editor exporta con lo que ya tiene en memoria.
La resolución contra el catálogo es lo único que va al servidor, en un endpoint que **no muta nada**.

**Tech stack:** TypeScript estricto, Vitest, Fastify 5, `mysql2`, React 18. Sin librerías nuevas.

**Antes de empezar:** `npm run build && npm test` limpios y `docker compose up -d` levantado.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `packages/shared/src/deck-rules/aggregate.ts` | **Modificar**: agrupar por nombre (P-027) |
| `packages/shared/src/deck-rules/{mtg,ygo,ptcg}.ts` | **Modificar**: reindexar excepciones por nombre |
| `packages/shared/src/deck-formats/types.ts` | `DeckLine`, `FormatWarning`, `DeckExportEntry` |
| `packages/shared/src/deck-formats/mtg.ts` · `ygo.ts` · `ptcg.ts` | Un códec por juego |
| `packages/shared/src/deck-formats/index.ts` | `parseDeck` / `serializeDeck` y el registro |
| `apps/api/src/db/catalog-query-repository.ts` | **Modificar**: `oracleKey` en `CardSummary` |
| `apps/api/src/api/schemas.ts` | **Modificar**: `oracleKey` en `CARD_SUMMARY` |
| `apps/api/src/db/deck-repository.ts` | **Modificar**: `resolveLines` |
| `apps/api/src/api/deck-{routes,schemas}.ts` | **Modificar**: `POST /api/decks/resolve` |
| `apps/web/src/lib/{api,deck-draft}.ts` | **Modificar**: `oracleKey` en `DraftCard`, método `resolve` |
| `apps/web/src/components/DeckTransferencia.tsx` | Exportar e importar |
| `apps/web/src/pages/MazoEditor.tsx` | **Modificar**: montar el componente |

---

## Tarea 1 — P-027: contar copias por nombre

El orden importa: **primero se cambia y se ven los tests en rojo.** Si al cambiar `aggregate` no se
pone nada en rojo, es que los tests de las excepciones no cubrían nada y hay que arreglar eso antes.

**Ficheros:**
- Modificar: `packages/shared/src/deck-rules/aggregate.ts`, `aggregate.test.ts`
- Modificar: `packages/shared/src/deck-rules/mtg.ts`, `ygo.ts`, `ptcg.ts`
- Modificar: `packages/shared/src/deck-rules/ptcg.test.ts`

- [ ] **Paso 1: corregir la fixture falsa y añadir el caso que hoy falla**

En `packages/shared/src/deck-rules/aggregate.test.ts`, sustituir el test de Nidoran entero por:

```ts
  it('no colapsa Nidoran macho y hembra, que NO se llaman igual (P-013)', () => {
    // La fixture anterior daba a las dos cartas el nombre "Nidoran" a secas, que
    // no existe en ningun catalogo. P-013 registro que se llaman Nidoran seguido
    // del signo de macho y del de hembra, y colapsarlas fue justo el bug. El
    // fuente se mantiene en ASCII puro, asi que los signos se construyen.
    const MACHO = `Nidoran${String.fromCharCode(0x2642)}`;
    const HEMBRA = `Nidoran${String.fromCharCode(0x2640)}`;
    const { byCard } = aggregate([
      entry({ oracleKey: 'nidoran-m', name: MACHO }),
      entry({ oracleKey: 'nidoran-f', name: HEMBRA }),
    ]);
    expect(byCard.size).toBe(2);
  });

  it('P-027: la MISMA carta con oracle_key distinto cuenta como una sola', () => {
    // En Pokemon `oracle_key` es `set-numero`, o sea uno por IMPRESION: la misma
    // carta en cuatro sets son cuatro claves. Agrupar por ahi dejaba pasar 16
    // copias. RN-04 cuenta por NOMBRE.
    const { byCard } = aggregate([
      entry({ oracleKey: 'me2pt5-180', name: "Acerola's Mischief", quantity: 4 }),
      entry({ oracleKey: 'me1-113', name: "Acerola's Mischief", quantity: 4 }),
      entry({ oracleKey: 'me1-165', name: "Acerola's Mischief", quantity: 4 }),
    ]);
    expect(byCard.size).toBe(1);
    expect(byCard.get("Acerola's Mischief")?.perZone.main).toBe(12);
  });
```

En `packages/shared/src/deck-rules/ptcg.test.ts`, añadir dentro del `describe('ptcgValidator', ...)`:

```ts
  it('P-027: 16 copias en cuatro impresiones distintas son ilegales', () => {
    const impresiones = ['me2pt5-180', 'me1-113', 'me1-165', 'me1-183'];
    const entries = [
      ...impresiones.map((k) =>
        card({ oracleKey: k, name: "Acerola's Mischief", quantity: 4 }),
      ),
      ...relleno(44),
    ];
    const issue = ptcgValidator.validate(entries).issues.find((i) => i.code === 'too_many_copies');
    expect(issue?.cardName).toBe("Acerola's Mischief");
    expect(issue?.actual).toBe(16);
  });
```

- [ ] **Paso 2: ejecutar y comprobar que los dos nuevos fallan**

```bash
npx vitest run packages/shared/src/deck-rules/
```

Esperado: fallan `P-027: la MISMA carta con oracle_key distinto...` (da 3 grupos en vez de 1) y
`P-027: 16 copias...` (no encuentra el problema). El de Nidoran pasa: con agrupación por `oracleKey`
sigue dando 2.

- [ ] **Paso 3: agrupar por nombre**

En `packages/shared/src/deck-rules/aggregate.ts`, sustituir `CardTally` y el cuerpo de `aggregate`:

```ts
export interface CardTally {
  name: string;
  /**
   * Primer `oracleKey` visto para esta carta. NO es la clave de agrupacion:
   * solo sirve para que la interfaz pueda referenciar la carta implicada.
   */
  oracleKey: string;
  perZone: Record<DeckZone, number>;
}
```

```ts
/**
 * Conteo por zona y por carta.
 *
 * Agrupa por NOMBRE porque es lo que dice RN-04 para los tres juegos. Antes
 * agrupaba por `oracleKey`, y en Pokemon esa clave es `set-numero` —una por
 * impresion—, asi que 16 copias de la misma carta en cuatro sets pasaban como
 * mazo legal (P-027).
 *
 * En Magic y Yu-Gi-Oh! el cambio es inocuo: sus claves son el `oracle_id` y el
 * passcode, estables entre impresiones. Medido en el catalogo: 92/92 y 290/290
 * nombres unicos.
 */
export function aggregate(entries: readonly DeckEntry[]): DeckAggregate {
  const counts = emptyCounts();
  const byCard = new Map<string, CardTally>();

  for (const entry of entries) {
    const cantidad = Number.isFinite(entry.quantity) ? Math.trunc(entry.quantity) : 0;
    if (cantidad <= 0) continue;

    counts[entry.zone] += cantidad;

    let tally = byCard.get(entry.name);
    if (!tally) {
      tally = { name: entry.name, oracleKey: entry.oracleKey, perZone: emptyCounts() };
      byCard.set(entry.name, tally);
    }
    tally.perZone[entry.zone] += cantidad;
  }

  return { counts, byCard };
}
```

- [ ] **Paso 4: ejecutar y VER EL ROJO de las tres excepciones**

```bash
npx vitest run packages/shared/src/deck-rules/
```

Esperado: los dos tests de P-027 ya pasan, **y ahora fallan tres que antes pasaban**:

- `mtg > la tierra basica no tiene limite`
- `ptcg > la Energia Basica no tiene limite`
- `ygo > la banlist aprieta el limite: Limited admite 1`

Es lo que se buscaba. Los tres validadores indexan sus excepciones por `oracleKey` y las consultan
con la clave de `byCard`, que ahora es el nombre. **Si alguno de estos tres no aparece en rojo, ese
test no cubría nada y hay que arreglarlo antes de seguir.**

- [ ] **Paso 5: reindexar las tres excepciones por nombre**

En `packages/shared/src/deck-rules/mtg.ts`, sustituir el bloque final de copias por:

```ts
    // Indexado por NOMBRE, igual que `byCard` (P-027).
    const sinLimite = new Set<string>();
    for (const entry of entries) {
      if (isMtgBasicLand(entry.typeLine)) sinLimite.add(entry.name);
    }

    for (const [nombre, tally] of byCard) {
      if (sinLimite.has(nombre)) continue;
      const total = sumZones(tally.perZone, COUNTED_ZONES);
      if (total > MTG_MAX_COPIES) {
        issues.push({
          code: 'too_many_copies',
          message: `"${tally.name}" aparece ${total} veces y el maximo son ${MTG_MAX_COPIES}`,
          oracleKey: tally.oracleKey,
          cardName: tally.name,
          actual: total,
          allowed: MTG_MAX_COPIES,
        });
      }
    }
```

En `packages/shared/src/deck-rules/ptcg.ts`, el equivalente:

```ts
    // Indexado por NOMBRE, igual que `byCard` (P-027).
    const sinLimite = new Set<string>();
    for (const entry of entries) {
      if (isPtcgBasicEnergy(entry.gameData)) sinLimite.add(entry.name);
    }

    for (const [nombre, tally] of byCard) {
      if (sinLimite.has(nombre)) continue;
      const total = sumZones(tally.perZone, COUNTED_ZONES);
      if (total > PTCG_MAX_COPIES) {
        issues.push({
          code: 'too_many_copies',
          message: `"${tally.name}" aparece ${total} veces y el maximo son ${PTCG_MAX_COPIES}`,
          oracleKey: tally.oracleKey,
          cardName: tally.name,
          actual: total,
          allowed: PTCG_MAX_COPIES,
        });
      }
    }
```

En `packages/shared/src/deck-rules/ygo.ts`, el mapa de la banlist:

```ts
    // El limite de una carta es el mas restrictivo que se haya visto para ella.
    // Indexado por NOMBRE, igual que `byCard` (P-027).
    const limites = new Map<string, number>();
    for (const entry of entries) {
      const limite = ygoCopyLimit(entry.gameData);
      const previo = limites.get(entry.name);
      limites.set(entry.name, previo === undefined ? limite : Math.min(previo, limite));
    }

    for (const [nombre, tally] of byCard) {
      const limite = limites.get(nombre) ?? YGO_DEFAULT_COPY_LIMIT;
      const total = sumZones(tally.perZone, COUNTED_ZONES);
      if (total <= limite) continue;

      const restringida = limite < YGO_DEFAULT_COPY_LIMIT;
      issues.push({
        code: restringida ? 'banned_card' : 'too_many_copies',
        message:
          limite === 0
            ? `"${tally.name}" esta prohibida por la banlist vigente`
            : `"${tally.name}" aparece ${total} veces y el maximo son ${limite}`,
        oracleKey: tally.oracleKey,
        cardName: tally.name,
        actual: total,
        allowed: limite,
      });
    }
```

- [ ] **Paso 6: ejecutar y comprobar que todo vuelve a verde**

```bash
npm run build && npm test
```

Esperado: build sin salida y toda la suite en verde, con los dos tests nuevos.

- [ ] **Paso 7: commit**

```bash
git add packages/shared/src/deck-rules/
git commit -m "fix(deck-rules): count copies by name, not by oracle key (P-027)"
```

---

## Tarea 2 — Contrato de los códecs y el de Magic

**Ficheros:**
- Crear: `packages/shared/src/deck-formats/types.ts`
- Crear: `packages/shared/src/deck-formats/mtg.ts`, `mtg.test.ts`

- [ ] **Paso 1: escribir el contrato** (son tipos; los verifica `tsc`)

`packages/shared/src/deck-formats/types.ts`:

```ts
import type { DeckZone } from '../deck-rules/types.js';
import type { GameData } from '../game-data.js';

/**
 * Una linea de una lista de mazo, ya interpretada.
 *
 * Lleva `name` o `externalId`, o los dos: el `.ydk` de Yu-Gi-Oh! solo trae
 * passcodes y ningun nombre, y el formato de Magic solo trae nombres.
 */
export interface DeckLine {
  quantity: number;
  zone: DeckZone;
  name?: string;
  /** Passcode en Yu-Gi-Oh!, `set-numero` en Pokemon. Es nuestro `oracle_key`. */
  externalId?: string;
  setCode?: string;
  collectorNumber?: string;
}

export interface FormatWarning {
  /** 1-indexado, como lo cuenta un editor de texto. */
  line: number;
  text: string;
  reason: 'unparsable' | 'zero_quantity';
}

export interface ParsedDeck {
  lines: DeckLine[];
  warnings: FormatWarning[];
}

/** Lo minimo que hace falta para escribir una lista. */
export interface DeckExportEntry {
  name: string;
  /** Passcode en Yu-Gi-Oh!, `set-numero` en Pokemon. */
  oracleKey: string;
  setCode: string;
  collectorNumber: string;
  zone: DeckZone;
  quantity: number;
  /** Solo lo usa Pokemon, para agrupar en secciones por supertipo. */
  gameData?: GameData;
}

export interface DeckCodec {
  parse(texto: string): ParsedDeck;
  serialize(entries: readonly DeckExportEntry[]): string;
}
```

- [ ] **Paso 2: escribir el test de Magic que falla**

`packages/shared/src/deck-formats/mtg.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mtgCodec } from './mtg.js';
import type { DeckExportEntry } from './types.js';

function entrada(over: Partial<DeckExportEntry>): DeckExportEntry {
  return {
    name: 'Lightning Bolt',
    oracleKey: 'oracle-bolt',
    setCode: 'M10',
    collectorNumber: '146',
    zone: 'main',
    quantity: 4,
    ...over,
  };
}

describe('mtgCodec.parse', () => {
  it('lee la forma basica', () => {
    const { lines, warnings } = mtgCodec.parse('4 Lightning Bolt\n2 Mountain');
    expect(warnings).toEqual([]);
    expect(lines).toEqual([
      { quantity: 4, zone: 'main', name: 'Lightning Bolt' },
      { quantity: 2, zone: 'main', name: 'Mountain' },
    ]);
  });

  it('acepta la forma "4x Nombre"', () => {
    expect(mtgCodec.parse('4x Lightning Bolt').lines[0]).toEqual({
      quantity: 4,
      zone: 'main',
      name: 'Lightning Bolt',
    });
  });

  it('lee el sufijo de impresion (SET) NUM', () => {
    expect(mtgCodec.parse('4 Lightning Bolt (M10) 146').lines[0]).toEqual({
      quantity: 4,
      zone: 'main',
      name: 'Lightning Bolt',
      setCode: 'M10',
      collectorNumber: '146',
    });
  });

  it('reconoce el sideboard por cabecera', () => {
    const { lines } = mtgCodec.parse('4 Lightning Bolt\nSideboard\n2 Pyroblast');
    expect(lines.map((l) => l.zone)).toEqual(['main', 'side']);
  });

  it('reconoce el sideboard por LINEA EN BLANCO, que es como lo escribe media internet', () => {
    const { lines } = mtgCodec.parse('4 Lightning Bolt\n\n2 Pyroblast');
    expect(lines.map((l) => l.zone)).toEqual(['main', 'side']);
  });

  it('la cabecera Deck no empuja nada al sideboard', () => {
    const { lines } = mtgCodec.parse('Deck\n4 Lightning Bolt\n\n2 Mountain');
    // La primera linea en blanco sigue separando: es la convencion.
    expect(lines.map((l) => l.zone)).toEqual(['main', 'side']);
  });

  it('tolera CRLF y espacios de sobra', () => {
    const { lines, warnings } = mtgCodec.parse('  4   Lightning Bolt  \r\n\r\n  2 Pyroblast\r\n');
    expect(warnings).toEqual([]);
    expect(lines).toEqual([
      { quantity: 4, zone: 'main', name: 'Lightning Bolt' },
      { quantity: 2, zone: 'side', name: 'Pyroblast' },
    ]);
  });

  it('avisa de lo que no entiende, sin lanzar', () => {
    const { lines, warnings } = mtgCodec.parse('4 Lightning Bolt\nesto no es una carta');
    expect(lines).toHaveLength(1);
    expect(warnings).toEqual([{ line: 2, text: 'esto no es una carta', reason: 'unparsable' }]);
  });

  it('descarta la cantidad cero con aviso', () => {
    const { lines, warnings } = mtgCodec.parse('0 Lightning Bolt');
    expect(lines).toEqual([]);
    expect(warnings[0]?.reason).toBe('zero_quantity');
  });

  it('el texto vacio no lanza', () => {
    expect(mtgCodec.parse('')).toEqual({ lines: [], warnings: [] });
  });
});

describe('mtgCodec.serialize', () => {
  it('escribe main y sideboard', () => {
    const texto = mtgCodec.serialize([
      entrada({ name: 'Lightning Bolt', quantity: 4 }),
      entrada({ name: 'Pyroblast', quantity: 2, zone: 'side' }),
    ]);
    expect(texto).toBe('4 Lightning Bolt\n\nSideboard\n2 Pyroblast');
  });

  it('sin sideboard no escribe la cabecera', () => {
    expect(mtgCodec.serialize([entrada({ quantity: 4 })])).toBe('4 Lightning Bolt');
  });

  it('ida y vuelta: serialize -> parse -> serialize es identico', () => {
    const entradas = [
      entrada({ name: 'Lightning Bolt', quantity: 4 }),
      entrada({ name: 'Snow-Covered Forest', quantity: 12 }),
      entrada({ name: 'Pyroblast', quantity: 2, zone: 'side' }),
    ];
    const primera = mtgCodec.serialize(entradas);
    const vuelta = mtgCodec.parse(primera).lines.map((l) => entrada({
      name: l.name!,
      quantity: l.quantity,
      zone: l.zone,
    }));
    expect(mtgCodec.serialize(vuelta)).toBe(primera);
  });
});
```

- [ ] **Paso 3: ejecutar y comprobar que falla**

```bash
npx vitest run packages/shared/src/deck-formats/mtg.test.ts
```

Esperado: falla al resolver `./mtg.js`.

- [ ] **Paso 4: escribir el códec de Magic**

`packages/shared/src/deck-formats/mtg.ts`:

```ts
import type { DeckCodec, DeckExportEntry, DeckLine, FormatWarning, ParsedDeck } from './types.js';

/**
 * Formato de texto de Magic, el que aceptan Arena y los constructores web.
 *
 *   4 Lightning Bolt
 *   2 Snow-Covered Forest
 *
 *   Sideboard
 *   2 Pyroblast
 *
 * El sideboard se marca con la cabecera `Sideboard` O con una linea en blanco,
 * que es como lo escribe media internet. Cualquiera de las dos vale.
 */

/**
 * `4 Nombre`, `4x Nombre`, con `(SET) NUM` opcional al final.
 *
 * La `x` va dentro de su propio grupo opcional: si se escribe `\s*[xX]?\s+`, la
 * forma sin `x` no casa, porque solo hay un espacio que repartir entre los dos.
 */
const LINEA = /^(\d+)(?:\s*[xX])?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([A-Za-z0-9-]+))?)?$/;

export const mtgCodec: DeckCodec = {
  parse(texto: string): ParsedDeck {
    const lines: DeckLine[] = [];
    const warnings: FormatWarning[] = [];
    let zone: DeckLine['zone'] = 'main';
    let vistaAlgunaCarta = false;

    texto.split(/\r?\n/).forEach((cruda, i) => {
      const linea = cruda.trim();

      if (linea === '') {
        // Primera linea en blanco despues de contenido: empieza el sideboard.
        if (vistaAlgunaCarta && zone === 'main') zone = 'side';
        return;
      }
      if (/^sideboard\b/i.test(linea)) {
        zone = 'side';
        return;
      }
      if (/^deck\b/i.test(linea)) {
        zone = 'main';
        return;
      }

      const m = LINEA.exec(linea);
      if (!m) {
        warnings.push({ line: i + 1, text: linea, reason: 'unparsable' });
        return;
      }

      const quantity = Number(m[1]);
      if (quantity <= 0) {
        warnings.push({ line: i + 1, text: linea, reason: 'zero_quantity' });
        return;
      }

      vistaAlgunaCarta = true;
      const entrada: DeckLine = { quantity, zone, name: m[2]!.trim() };
      if (m[3]) entrada.setCode = m[3];
      if (m[4]) entrada.collectorNumber = m[4];
      lines.push(entrada);
    });

    return { lines, warnings };
  },

  serialize(entries: readonly DeckExportEntry[]): string {
    const main = entries.filter((e) => e.zone === 'main');
    const side = entries.filter((e) => e.zone === 'side');

    const bloque = (xs: readonly DeckExportEntry[]) =>
      xs.map((e) => `${e.quantity} ${e.name}`).join('\n');

    if (side.length === 0) return bloque(main);
    return `${bloque(main)}\n\nSideboard\n${bloque(side)}`;
  },
};
```

- [ ] **Paso 5: ejecutar y comprobar que pasa**

```bash
npx vitest run packages/shared/src/deck-formats/mtg.test.ts
```

Esperado: `Tests  12 passed`.

- [ ] **Paso 6: commit**

```bash
git add packages/shared/src/deck-formats/
git commit -m "feat(deck-formats): add the Magic deck list codec (T-048)"
```

---

## Tarea 3 — El `.ydk` de Yu-Gi-Oh!

**Ficheros:**
- Crear: `packages/shared/src/deck-formats/ygo.ts`, `ygo.test.ts`

- [ ] **Paso 1: escribir el test que falla**

`packages/shared/src/deck-formats/ygo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ygoCodec } from './ygo.js';
import type { DeckExportEntry } from './types.js';

function entrada(over: Partial<DeckExportEntry>): DeckExportEntry {
  return {
    name: 'Blue-Eyes White Dragon',
    oracleKey: '89631139',
    setCode: 'LOB',
    collectorNumber: '001',
    zone: 'main',
    quantity: 3,
    ...over,
  };
}

const YDK = ['#created by ProyectoTCG', '#main', '89631139', '89631139', '#extra', '!side'].join(
  '\n',
);

describe('ygoCodec.parse', () => {
  it('agrupa las copias repetidas en una linea con cantidad', () => {
    // El .ydk NO tiene cantidades: tres copias son tres lineas iguales.
    const { lines } = ygoCodec.parse(YDK);
    expect(lines).toEqual([{ quantity: 2, zone: 'main', externalId: '89631139' }]);
  });

  it('reparte por zonas, y el side lleva ! y no #', () => {
    const texto = ['#main', '111', '#extra', '222', '!side', '333'].join('\n');
    expect(ygoCodec.parse(texto).lines).toEqual([
      { quantity: 1, zone: 'main', externalId: '111' },
      { quantity: 1, zone: 'extra', externalId: '222' },
      { quantity: 1, zone: 'side', externalId: '333' },
    ]);
  });

  it('ignora los comentarios y no avisa de ellos', () => {
    const { lines, warnings } = ygoCodec.parse('#created by alguien\n#main\n111');
    expect(lines).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('avisa de una linea que no es un passcode', () => {
    const { warnings } = ygoCodec.parse('#main\n111\nno soy un numero');
    expect(warnings).toEqual([{ line: 3, text: 'no soy un numero', reason: 'unparsable' }]);
  });

  it('tolera CRLF y lineas en blanco', () => {
    const { lines, warnings } = ygoCodec.parse('#main\r\n111\r\n\r\n111\r\n');
    expect(warnings).toEqual([]);
    expect(lines).toEqual([{ quantity: 2, zone: 'main', externalId: '111' }]);
  });

  it('sin cabecera de zona todo cae en el main', () => {
    expect(ygoCodec.parse('111').lines[0]?.zone).toBe('main');
  });

  it('el texto vacio no lanza', () => {
    expect(ygoCodec.parse('')).toEqual({ lines: [], warnings: [] });
  });
});

describe('ygoCodec.serialize', () => {
  it('repite el passcode una vez por copia', () => {
    const texto = ygoCodec.serialize([entrada({ quantity: 3 })]);
    expect(texto).toBe(
      ['#created by ProyectoTCG', '#main', '89631139', '89631139', '89631139', '#extra', '!side'].join(
        '\n',
      ),
    );
  });

  it('escribe siempre las tres cabeceras, aunque haya zonas vacias', () => {
    const texto = ygoCodec.serialize([]);
    expect(texto).toBe(['#created by ProyectoTCG', '#main', '#extra', '!side'].join('\n'));
  });

  it('ida y vuelta EXACTA: el .ydk no tiene ambiguedad', () => {
    const entradas = [
      entrada({ oracleKey: '89631139', quantity: 3 }),
      entrada({ oracleKey: '46986414', quantity: 1 }),
      entrada({ oracleKey: '84013237', quantity: 2, zone: 'extra' }),
      entrada({ oracleKey: '14558127', quantity: 1, zone: 'side' }),
    ];
    const primera = ygoCodec.serialize(entradas);
    const vuelta = ygoCodec.parse(primera).lines.map((l) =>
      entrada({ oracleKey: l.externalId!, quantity: l.quantity, zone: l.zone }),
    );
    expect(ygoCodec.serialize(vuelta)).toBe(primera);
  });
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
npx vitest run packages/shared/src/deck-formats/ygo.test.ts
```

Esperado: falla al resolver `./ygo.js`.

- [ ] **Paso 3: escribir el códec**

`packages/shared/src/deck-formats/ygo.ts`:

```ts
import type { DeckZone } from '../deck-rules/types.js';
import type { DeckCodec, DeckExportEntry, DeckLine, FormatWarning, ParsedDeck } from './types.js';

/**
 * El `.ydk`, formato universal de Yu-Gi-Oh!.
 *
 *   #created by ProyectoTCG
 *   #main
 *   89631139
 *   89631139
 *   #extra
 *   !side
 *
 * Dos cosas que se olvidan al escribir un parser de esto:
 *  - NO hay cantidades. Tres copias son tres lineas iguales.
 *  - El separador del side es `!`, no `#`.
 *
 * El passcode es exactamente nuestro `oracle_key` para este juego, asi que la
 * ida y vuelta es exacta y no hay ninguna ambiguedad que resolver.
 */

const CABECERA = 'created by ProyectoTCG';

export const ygoCodec: DeckCodec = {
  parse(texto: string): ParsedDeck {
    const warnings: FormatWarning[] = [];
    // Se cuenta por (zona, passcode) y se agrupa al final, porque el formato
    // repite la linea una vez por copia.
    const cuenta = new Map<string, { zone: DeckZone; externalId: string; quantity: number }>();

    let zone: DeckZone = 'main';

    texto.split(/\r?\n/).forEach((cruda, i) => {
      const linea = cruda.trim();
      if (linea === '') return;

      if (linea.startsWith('!')) {
        if (/^!side\b/i.test(linea)) zone = 'side';
        return;
      }
      if (linea.startsWith('#')) {
        if (/^#main\b/i.test(linea)) zone = 'main';
        else if (/^#extra\b/i.test(linea)) zone = 'extra';
        // Cualquier otro `#` es un comentario: `#created by ...`. No se avisa.
        return;
      }

      if (!/^\d+$/.test(linea)) {
        warnings.push({ line: i + 1, text: linea, reason: 'unparsable' });
        return;
      }

      const clave = `${zone}:${linea}`;
      const previo = cuenta.get(clave);
      if (previo) previo.quantity += 1;
      else cuenta.set(clave, { zone, externalId: linea, quantity: 1 });
    });

    const lines: DeckLine[] = [...cuenta.values()].map((c) => ({
      quantity: c.quantity,
      zone: c.zone,
      externalId: c.externalId,
    }));

    return { lines, warnings };
  },

  serialize(entries: readonly DeckExportEntry[]): string {
    const bloque = (zone: DeckZone) =>
      entries
        .filter((e) => e.zone === zone)
        .flatMap((e) => Array.from({ length: e.quantity }, () => e.oracleKey));

    return [
      `#${CABECERA}`,
      '#main',
      ...bloque('main'),
      '#extra',
      ...bloque('extra'),
      '!side',
      ...bloque('side'),
    ].join('\n');
  },
};
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

```bash
npx vitest run packages/shared/src/deck-formats/ygo.test.ts
```

Esperado: `Tests  10 passed`.

- [ ] **Paso 5: commit**

```bash
git add packages/shared/src/deck-formats/
git commit -m "feat(deck-formats): add the Yu-Gi-Oh! .ydk codec (T-048)"
```

---

## Tarea 4 — El formato de PTCG Live

**Ficheros:**
- Crear: `packages/shared/src/deck-formats/ptcg.ts`, `ptcg.test.ts`

- [ ] **Paso 1: escribir el test que falla**

`packages/shared/src/deck-formats/ptcg.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ptcgCodec } from './ptcg.js';
import type { DeckExportEntry } from './types.js';

const ACENTO = `Pok${String.fromCharCode(0x00e9)}mon`;

function entrada(over: Partial<DeckExportEntry>): DeckExportEntry {
  return {
    name: 'Pikachu',
    oracleKey: 'svi-47',
    setCode: 'SVI',
    collectorNumber: '47',
    zone: 'main',
    quantity: 4,
    gameData: { supertype: 'Pokemon' },
    ...over,
  };
}

describe('ptcgCodec.parse', () => {
  it('lee nombre, set y numero, y compone el oracle_key', () => {
    expect(ptcgCodec.parse('4 Pikachu SVI 47').lines[0]).toEqual({
      quantity: 4,
      zone: 'main',
      name: 'Pikachu',
      setCode: 'SVI',
      collectorNumber: '47',
      externalId: 'svi-47',
    });
  });

  it('acepta la cabecera con acento y sin el', () => {
    const conAcento = ptcgCodec.parse(`${ACENTO}: 12\n4 Pikachu SVI 47`);
    const sinAcento = ptcgCodec.parse('Pokemon: 12\n4 Pikachu SVI 47');
    expect(conAcento.warnings).toEqual([]);
    expect(sinAcento.warnings).toEqual([]);
    expect(conAcento.lines).toEqual(sinAcento.lines);
  });

  it('ignora Total Cards y las demas cabeceras', () => {
    const texto = ['Trainer: 30', "4 Acerola's Mischief ME1 113", 'Energy: 18', 'Total Cards: 60'];
    const { lines, warnings } = ptcgCodec.parse(texto.join('\n'));
    expect(warnings).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.name).toBe("Acerola's Mischief");
  });

  it('todo cae en main: Pokemon no usa otras zonas', () => {
    const { lines } = ptcgCodec.parse('4 Pikachu SVI 47\n2 Bulbasaur ME1 1');
    expect(lines.every((l) => l.zone === 'main')).toBe(true);
  });

  it('un nombre que acaba en numero no confunde al parser', () => {
    expect(ptcgCodec.parse("4 Team Rocket's Great Ball ME2PT5 205").lines[0]).toEqual({
      quantity: 4,
      zone: 'main',
      name: "Team Rocket's Great Ball",
      setCode: 'ME2PT5',
      collectorNumber: '205',
      externalId: 'me2pt5-205',
    });
  });

  it('sin set ni numero se queda con el nombre', () => {
    expect(ptcgCodec.parse('4 Pikachu').lines[0]).toEqual({
      quantity: 4,
      zone: 'main',
      name: 'Pikachu',
    });
  });

  it('tolera CRLF y lineas en blanco', () => {
    const { lines, warnings } = ptcgCodec.parse('4 Pikachu SVI 47\r\n\r\n2 Bulbasaur ME1 1\r\n');
    expect(warnings).toEqual([]);
    expect(lines).toHaveLength(2);
  });

  it('descarta la cantidad cero con aviso y el texto vacio no lanza', () => {
    expect(ptcgCodec.parse('0 Pikachu SVI 47').warnings[0]?.reason).toBe('zero_quantity');
    expect(ptcgCodec.parse('')).toEqual({ lines: [], warnings: [] });
  });
});

describe('ptcgCodec.serialize', () => {
  it('agrupa en secciones por supertipo y cierra con el total', () => {
    const texto = ptcgCodec.serialize([
      entrada({ name: 'Pikachu', quantity: 4, gameData: { supertype: 'Pokemon' } }),
      entrada({
        name: "Acerola's Mischief",
        oracleKey: 'me1-113',
        setCode: 'ME1',
        collectorNumber: '113',
        quantity: 2,
        gameData: { supertype: 'Trainer' },
      }),
    ]);
    expect(texto).toBe(
      [`${ACENTO}: 4`, '4 Pikachu SVI 47', '', 'Trainer: 2', "2 Acerola's Mischief ME1 113", '', 'Total Cards: 6'].join('\n'),
    );
  });

  it('ida y vuelta: serialize -> parse -> serialize es identico', () => {
    const entradas = [
      entrada({ name: 'Pikachu', quantity: 4, gameData: { supertype: 'Pokemon' } }),
      entrada({
        name: 'Basic Fire Energy',
        oracleKey: 'sve-2',
        setCode: 'SVE',
        collectorNumber: '2',
        quantity: 8,
        gameData: { supertype: 'Energy' },
      }),
    ];
    const primera = ptcgCodec.serialize(entradas);
    const vuelta = ptcgCodec.parse(primera).lines.map((l) => {
      const original = entradas.find((e) => e.name === l.name)!;
      return entrada({ ...original, quantity: l.quantity });
    });
    expect(ptcgCodec.serialize(vuelta)).toBe(primera);
  });
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
npx vitest run packages/shared/src/deck-formats/ptcg.test.ts
```

Esperado: falla al resolver `./ptcg.js`.

- [ ] **Paso 3: escribir el códec**

`packages/shared/src/deck-formats/ptcg.ts`:

```ts
import type { PtcgGameData } from '../game-data.js';
import type { DeckCodec, DeckExportEntry, DeckLine, FormatWarning, ParsedDeck } from './types.js';

/**
 * Formato de PTCG Live.
 *
 *   Pokemon: 12
 *   4 Pikachu SVI 47
 *
 *   Trainer: 30
 *   4 Acerola's Mischief ME1 113
 *
 *   Total Cards: 60
 *
 * Las cabeceras agrupan por SUPERTIPO, no por zona: Pokemon solo usa `main`. Al
 * leer se ignoran; al escribir se emiten porque es lo que espera el juego.
 *
 * La cabecera lleva `Pokemon` con acento en la e. El fuente se mantiene en ASCII
 * puro, asi que se construye; al leer se aceptan las dos grafias.
 */
const POKEMON_ACENTUADO = `Pok${String.fromCharCode(0x00e9)}mon`;

/**
 * `4 Resto`. El set y el numero se separan DESPUES, mirando los dos ultimos
 * tokens: meterlo todo en una regex con grupo opcional y nombre perezoso es
 * fragil con nombres que acaban en numero.
 */
const LINEA = /^(\d+)\s+(.+)$/;
const SET = /^[A-Za-z][A-Za-z0-9]{1,9}$/;
const NUMERO = /^[A-Za-z0-9]{1,6}$/;

/** Cabeceras de seccion y el total. Se ignoran al leer. */
const CABECERA = /^(pok[eé]mon|trainer|energy|total cards)\s*:/i;

export const ptcgCodec: DeckCodec = {
  parse(texto: string): ParsedDeck {
    const lines: DeckLine[] = [];
    const warnings: FormatWarning[] = [];

    texto.split(/\r?\n/).forEach((cruda, i) => {
      const linea = cruda.trim();
      if (linea === '') return;
      if (CABECERA.test(linea)) return;

      const m = LINEA.exec(linea);
      if (!m) {
        warnings.push({ line: i + 1, text: linea, reason: 'unparsable' });
        return;
      }

      const quantity = Number(m[1]);
      if (quantity <= 0) {
        warnings.push({ line: i + 1, text: linea, reason: 'zero_quantity' });
        return;
      }

      const tokens = m[2]!.trim().split(/\s+/);
      const entrada: DeckLine = { quantity, zone: 'main', name: tokens.join(' ') };

      // Los dos ultimos tokens son el set y el numero SOLO si tienen la forma
      // adecuada. "4 Pikachu" no los lleva, y un nombre puede acabar en cifra.
      const numero = tokens[tokens.length - 1];
      const set = tokens[tokens.length - 2];
      if (tokens.length >= 3 && numero && set && NUMERO.test(numero) && SET.test(set)) {
        entrada.name = tokens.slice(0, -2).join(' ');
        entrada.setCode = set;
        entrada.collectorNumber = numero;
        // `SVI 47` -> `svi-47`, que es nuestro oracle_key para este juego.
        entrada.externalId = `${set.toLowerCase()}-${numero.toLowerCase()}`;
      }
      lines.push(entrada);
    });

    return { lines, warnings };
  },

  serialize(entries: readonly DeckExportEntry[]): string {
    const supertipoDe = (e: DeckExportEntry): string =>
      ((e.gameData as PtcgGameData | undefined)?.supertype ?? 'Trainer').trim();

    const secciones: Array<{ etiqueta: string; coincide: (s: string) => boolean }> = [
      { etiqueta: POKEMON_ACENTUADO, coincide: (s) => /^pok[eé]mon$/i.test(s) },
      { etiqueta: 'Trainer', coincide: (s) => /^trainer$/i.test(s) },
      { etiqueta: 'Energy', coincide: (s) => /^energy$/i.test(s) },
    ];

    const partes: string[] = [];
    let total = 0;

    for (const seccion of secciones) {
      const suyas = entries.filter((e) => seccion.coincide(supertipoDe(e)));
      if (suyas.length === 0) continue;
      const cuenta = suyas.reduce((n, e) => n + e.quantity, 0);
      total += cuenta;
      partes.push(`${seccion.etiqueta}: ${cuenta}`);
      for (const e of suyas) {
        partes.push(`${e.quantity} ${e.name} ${e.setCode} ${e.collectorNumber}`);
      }
      partes.push('');
    }

    partes.push(`Total Cards: ${total}`);
    return partes.join('\n');
  },
};
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

```bash
npx vitest run packages/shared/src/deck-formats/ptcg.test.ts
```

Esperado: `Tests  10 passed`.

- [ ] **Paso 5: commit**

```bash
git add packages/shared/src/deck-formats/
git commit -m "feat(deck-formats): add the PTCG Live codec (T-048)"
```

---

## Tarea 5 — Registro y exportación del paquete

**Ficheros:**
- Crear: `packages/shared/src/deck-formats/index.ts`, `index.test.ts`
- Modificar: `packages/shared/src/index.ts`

- [ ] **Paso 1: escribir el test que falla**

`packages/shared/src/deck-formats/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseDeck, serializeDeck, DECK_CODECS } from './index.js';
import { GAME_CODES } from '../game.js';

describe('registro de codecs', () => {
  it('hay un codec por juego, sin huecos', () => {
    expect(Object.keys(DECK_CODECS).sort()).toEqual([...GAME_CODES].sort());
  });

  it('delega en el codec del juego pedido', () => {
    // El mismo texto significa cosas distintas segun el juego: en Yu-Gi-Oh! es
    // un passcode suelto; en Magic no se entiende.
    expect(parseDeck('YGO', '89631139').lines[0]?.externalId).toBe('89631139');
    expect(parseDeck('MTG', '89631139').warnings[0]?.reason).toBe('unparsable');
  });

  it('serializa por juego', () => {
    const entrada = {
      name: 'Blue-Eyes White Dragon',
      oracleKey: '89631139',
      setCode: 'LOB',
      collectorNumber: '001',
      zone: 'main' as const,
      quantity: 1,
    };
    expect(serializeDeck('YGO', [entrada])).toContain('89631139');
    expect(serializeDeck('MTG', [entrada])).toBe('1 Blue-Eyes White Dragon');
  });

  it('el texto vacio no lanza en ningun juego', () => {
    for (const game of GAME_CODES) {
      expect(parseDeck(game, '').lines).toEqual([]);
    }
  });
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
npx vitest run packages/shared/src/deck-formats/index.test.ts
```

Esperado: falla al resolver `./index.js`.

- [ ] **Paso 3: escribir el registro**

`packages/shared/src/deck-formats/index.ts`:

```ts
import type { GameCode } from '../game.js';
import { mtgCodec } from './mtg.js';
import { ptcgCodec } from './ptcg.js';
import { ygoCodec } from './ygo.js';
import type { DeckExportEntry, ParsedDeck } from './types.js';

/** Un codec por juego. Mismo patron que los validadores y los adaptadores. */
export const DECK_CODECS = {
  MTG: mtgCodec,
  YGO: ygoCodec,
  PTCG: ptcgCodec,
} as const;

/** Texto pegado -> lineas. Nunca lanza: la entrada llega sucia por definicion. */
export function parseDeck(game: GameCode, texto: string): ParsedDeck {
  return DECK_CODECS[game].parse(texto);
}

/** Mazo -> texto en el formato del juego. */
export function serializeDeck(game: GameCode, entries: readonly DeckExportEntry[]): string {
  return DECK_CODECS[game].serialize(entries);
}

export { mtgCodec } from './mtg.js';
export { ygoCodec } from './ygo.js';
export { ptcgCodec } from './ptcg.js';
export type {
  DeckLine,
  FormatWarning,
  ParsedDeck,
  DeckExportEntry,
  DeckCodec,
} from './types.js';
```

- [ ] **Paso 4: exportar desde el barrel del paquete**

En `packages/shared/src/index.ts`, añadir al final:

```ts
export { parseDeck, serializeDeck, DECK_CODECS, mtgCodec, ygoCodec, ptcgCodec } from './deck-formats/index.js';
export type {
  DeckLine,
  FormatWarning,
  ParsedDeck,
  DeckExportEntry,
  DeckCodec,
} from './deck-formats/index.js';
```

- [ ] **Paso 5: ejecutar todo**

```bash
npm run build && npm test
```

Esperado: build sin salida y toda la suite en verde.

- [ ] **Paso 6: commit**

```bash
git add packages/shared/src/
git commit -m "feat(deck-formats): expose parseDeck and serializeDeck from @tcg/shared (T-048)"
```

---

## Tarea 6 — `oracleKey` en el catálogo

Exportar un `.ydk` necesita el passcode, y una carta añadida desde el buscador no lo lleva.

**Ficheros:**
- Modificar: `apps/api/src/db/catalog-query-repository.ts`
- Modificar: `apps/api/src/api/schemas.ts`
- Modificar: `apps/web/src/lib/api.ts`, `deck-draft.ts`
- Modificar: `apps/web/src/components/DeckBuscador.tsx`

- [ ] **Paso 1: añadirlo al esquema y al repositorio a la vez**

El test de P-024 en `apps/api/src/api/server.test.ts` compara las claves que produce `toSummary` con
las que declara `CARD_SUMMARY`: **si se cambia sólo un lado, ese test falla.** Es justo para lo que
se escribió.

En `apps/api/src/db/catalog-query-repository.ts`, en `CardSummary` añadir tras `cardId`:

```ts
  /** Passcode en Yu-Gi-Oh!, `set-numero` en Pokemon, `oracle_id` en Magic. */
  oracleKey: string;
```

En la misma interfaz `CardRow`, añadir `oracle_key: string;`. En `toSummary`, añadir
`oracleKey: row.oracle_key,` justo después de `cardId`.

En las dos consultas de ese fichero (`searchCards` y `findCard`), añadir `c.oracle_key` a la lista
de columnas seleccionadas, justo después de `c.id`.

En `apps/api/src/api/schemas.ts`, dentro de `CARD_SUMMARY.properties`, tras `cardId`:

```ts
    oracleKey: { type: 'string' },
```

- [ ] **Paso 2: ejecutar y comprobar que el test de P-024 sigue verde**

```bash
npm run build && npx vitest run apps/api/src/api/server.test.ts
```

Esperado: build sin salida y todos los tests en verde. Si falla el de P-024 con las claves
descuadradas, es que sólo se ha tocado un lado.

En `apps/api/src/api/server.test.ts`, la fixture del test de P-024 construye una `CardRow` a mano.
Añádele el campo nuevo, justo después de `id: 7,`:

```ts
      oracle_key: '89631139',
```

Sin esto el test **seguiría pasando** —la clave `oracleKey` existiría con valor `undefined`, y la
comparación es de claves— pero estaría midiendo con una fila que no se parece a la real. Es la
lección de P-022 otra vez.

- [ ] **Paso 3: llevarlo al cliente**

En `apps/web/src/lib/api.ts`, en `interface CardSummary`, tras `cardId: number;`:

```ts
  oracleKey: string;
```

En `apps/web/src/lib/deck-draft.ts`, en `interface DraftCard`, tras `cardId: number;`:

```ts
  /** Passcode en Yu-Gi-Oh!. Lo necesita la exportacion a .ydk. */
  oracleKey: string;
```

En `apps/web/src/components/DeckBuscador.tsx`, dentro de la llamada a `onAnadir`, tras
`cardId: detalle.cardId,`:

```ts
        oracleKey: detalle.oracleKey,
```

- [ ] **Paso 4: compilar y ver el error esperado**

```bash
npm run build
```

Esperado: **falla** en `apps/web/src/lib/use-deck-editor.ts` o donde se construya un `DraftEntry`
sin `oracleKey`. Corrige `fromDeckDetail` en `deck-draft.ts` añadiendo `oracleKey: c.oracleKey,`
junto a `cardId`. Vuelve a compilar hasta que salga limpio.

- [ ] **Paso 5: ejecutar la suite y commitear**

```bash
npm run build && npm test
```

```bash
git add apps/api/src/ apps/web/src/
git commit -m "feat(api): expose oracleKey on card summaries (T-048)"
```

---

## Tarea 7 — `POST /api/decks/resolve`

**Ficheros:**
- Modificar: `apps/api/src/db/deck-repository.ts`
- Modificar: `apps/api/src/api/deck-schemas.ts`, `deck-routes.ts`, `deck-routes.test.ts`

- [ ] **Paso 1: escribir el método del repositorio**

En `apps/api/src/db/deck-repository.ts`, añadir estos tipos junto a `ResolvedPrint`:

```ts
export interface DeckLineInput {
  quantity: number;
  zone: DeckZone;
  name?: string;
  externalId?: string;
  setCode?: string;
  collectorNumber?: string;
}

export interface ResolvedLine {
  printId: number;
  cardId: number;
  oracleKey: string;
  name: string;
  typeLine: string | null;
  gameData: GameData;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  imagePath: string | null;
  zone: DeckZone;
  quantity: number;
}

export interface UnresolvedLine {
  name: string | null;
  externalId: string | null;
  quantity: number;
  zone: DeckZone;
}
```

Y este método dentro de la clase:

```ts
  /**
   * Resuelve lineas de una lista pegada contra el catalogo, en UNA consulta.
   *
   * No muta nada: devuelve lo que ha encontrado y lo que no. Con pocos sets
   * ingestados, lo normal es que falte bastante — y decirlo es mas util que
   * fallar entero.
   */
  async resolveLines(
    game: GameCode,
    lines: readonly DeckLineInput[],
  ): Promise<{ resolved: ResolvedLine[]; unresolved: UnresolvedLine[] }> {
    if (lines.length === 0) return { resolved: [], unresolved: [] };

    const claves = [...new Set(lines.map((l) => l.externalId).filter((v): v is string => !!v))];
    const nombres = [...new Set(lines.map((l) => l.name).filter((v): v is string => !!v))];

    const condiciones: string[] = [];
    const params: unknown[] = [GAME_IDS[game]];
    if (claves.length > 0) {
      condiciones.push(`c.oracle_key IN (${claves.map(() => '?').join(', ')})`);
      params.push(...claves);
    }
    if (nombres.length > 0) {
      condiciones.push(`c.name IN (${nombres.map(() => '?').join(', ')})`);
      params.push(...nombres);
    }
    if (condiciones.length === 0) {
      return {
        resolved: [],
        unresolved: lines.map((l) => ({
          name: l.name ?? null,
          externalId: l.externalId ?? null,
          quantity: l.quantity,
          zone: l.zone,
        })),
      };
    }

    const filas = await this.db.select<{
      print_id: number; card_id: number; oracle_key: string; name: string;
      type_line: string | null; game_data: GameData; set_code: string;
      collector_number: string; rarity: string; image_local_path: string | null;
    }>(
      `SELECT p.id AS print_id, c.id AS card_id, c.oracle_key, c.name, c.type_line,
              c.game_data, s.code AS set_code, p.collector_number, r.code AS rarity,
              p.image_local_path
       FROM cards c
       JOIN card_prints p ON p.card_id = c.id
       JOIN sets s ON s.id = p.set_id
       JOIN rarities r ON r.id = p.rarity_id
       WHERE c.game_id = ? AND (${condiciones.join(' OR ')})
       ORDER BY p.id ASC`,
      params,
    );

    // `ORDER BY p.id ASC` + `Map.set` solo si falta => se queda la impresion de
    // menor id. Determinista y reproducible entre ejecuciones.
    const porClave = new Map<string, (typeof filas)[number]>();
    const porNombre = new Map<string, (typeof filas)[number]>();
    const porImpresion = new Map<string, (typeof filas)[number]>();
    for (const fila of filas) {
      if (!porClave.has(fila.oracle_key)) porClave.set(fila.oracle_key, fila);
      const nombre = fila.name.toLowerCase();
      if (!porNombre.has(nombre)) porNombre.set(nombre, fila);
      porImpresion.set(`${fila.set_code.toLowerCase()}:${fila.collector_number.toLowerCase()}`, fila);
    }

    const resolved: ResolvedLine[] = [];
    const unresolved: UnresolvedLine[] = [];

    for (const linea of lines) {
      // Si la linea trae set y numero, se prefiere ESA impresion exacta.
      const exacta =
        linea.setCode && linea.collectorNumber
          ? porImpresion.get(`${linea.setCode.toLowerCase()}:${linea.collectorNumber.toLowerCase()}`)
          : undefined;
      const fila =
        exacta ??
        (linea.externalId ? porClave.get(linea.externalId) : undefined) ??
        (linea.name ? porNombre.get(linea.name.toLowerCase()) : undefined);

      if (!fila) {
        unresolved.push({
          name: linea.name ?? null,
          externalId: linea.externalId ?? null,
          quantity: linea.quantity,
          zone: linea.zone,
        });
        continue;
      }

      resolved.push({
        printId: Number(fila.print_id),
        cardId: Number(fila.card_id),
        oracleKey: fila.oracle_key,
        name: fila.name,
        typeLine: fila.type_line,
        gameData: fila.game_data,
        setCode: fila.set_code,
        collectorNumber: fila.collector_number,
        rarity: fila.rarity,
        imagePath: fila.image_local_path,
        zone: linea.zone,
        quantity: linea.quantity,
      });
    }

    return { resolved, unresolved };
  }
```

Añadir al barrel `apps/api/src/db/index.ts`:

```ts
export type { DeckLineInput, ResolvedLine, UnresolvedLine } from './deck-repository.js';
```

- [ ] **Paso 2: escribir el esquema**

En `apps/api/src/api/deck-schemas.ts`, al final:

```ts
/** Mismo tope que el PUT: un pegado enorme se rechaza antes de tocar la BD. */
export const RESOLVE_DECK = {
  body: {
    type: 'object',
    required: ['game', 'lines'],
    properties: {
      game: { type: 'string', enum: ['MTG', 'YGO', 'PTCG'] },
      lines: {
        type: 'array',
        maxItems: MAX_DECK_CARD_ROWS,
        items: {
          type: 'object',
          required: ['quantity', 'zone'],
          properties: {
            quantity: { type: 'integer', minimum: 1, maximum: 99 },
            zone: { type: 'string', enum: ['main', 'extra', 'side', 'commander'] },
            name: { type: 'string', maxLength: 255 },
            externalId: { type: 'string', maxLength: 64 },
            setCode: { type: 'string', maxLength: 16 },
            collectorNumber: { type: 'string', maxLength: 16 },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            resolved: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  printId: { type: 'integer' },
                  cardId: { type: 'integer' },
                  oracleKey: { type: 'string' },
                  name: { type: 'string' },
                  typeLine: { type: ['string', 'null'] },
                  gameData: { type: 'object', additionalProperties: true },
                  setCode: { type: 'string' },
                  collectorNumber: { type: 'string' },
                  rarity: { type: 'string' },
                  imagePath: { type: ['string', 'null'] },
                  zone: { type: 'string' },
                  quantity: { type: 'integer' },
                },
              },
            },
            unresolved: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: ['string', 'null'] },
                  externalId: { type: ['string', 'null'] },
                  quantity: { type: 'integer' },
                  zone: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    400: ERROR,
    401: ERROR,
  },
} as const;
```

- [ ] **Paso 3: escribir el test de la ruta que falla**

En `apps/api/src/api/deck-routes.test.ts`, añadir a `FakeDecks` este método:

```ts
  async resolveLines(game: string, lines: Array<Record<string, unknown>>) {
    const resolved: unknown[] = [];
    const unresolved: unknown[] = [];
    for (const l of lines) {
      const id = Number(l.externalId);
      if (this.catalogo.get(id) === game) {
        resolved.push({
          printId: id, cardId: id, oracleKey: String(id), name: `Carta ${id}`,
          typeLine: 'Effect Monster', gameData: {}, setCode: 'TST',
          collectorNumber: '1', rarity: 'common', imagePath: null,
          zone: l.zone, quantity: l.quantity,
        });
      } else {
        unresolved.push({
          name: (l.name as string) ?? null,
          externalId: (l.externalId as string) ?? null,
          quantity: l.quantity, zone: l.zone,
        });
      }
    }
    return { resolved, unresolved };
  }
```

Y este test dentro de `describe('rutas de mazos', ...)`:

```ts
  it('resolve separa lo que esta en el catalogo de lo que no', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/resolve',
      headers: auth(tokenA),
      payload: {
        game: 'YGO',
        lines: [
          { quantity: 3, zone: 'main', externalId: '10' },
          { quantity: 1, zone: 'main', externalId: '999999', name: 'Carta inventada' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.resolved).toHaveLength(1);
    expect(res.json().data.resolved[0].printId).toBe(10);
    expect(res.json().data.unresolved).toEqual([
      { name: 'Carta inventada', externalId: '999999', quantity: 1, zone: 'main' },
    ]);
  });

  it('resolve exige token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/resolve',
      payload: { game: 'YGO', lines: [] },
    });
    expect(res.statusCode).toBe(401);
  });
```

- [ ] **Paso 4: ejecutar y comprobar que falla**

```bash
npx vitest run apps/api/src/api/deck-routes.test.ts
```

Esperado: los dos nuevos fallan con 404 — la ruta no existe.

- [ ] **Paso 5: escribir la ruta**

En `apps/api/src/api/deck-routes.ts`, añadir `RESOLVE_DECK` al import de `./deck-schemas.js`, añadir
el import de tipos `import type { DeckLineInput } from '../db/deck-repository.js';` y registrar la
ruta **antes** de `/api/decks/:id` para que `resolve` no se confunda con un id:

```ts
  // Antes de `/api/decks/:id`: si no, Fastify intentaria leer "resolve" como id.
  app.post<{ Body: { game: GameCode; lines: DeckLineInput[] } }>(
    '/api/decks/resolve',
    { schema: RESOLVE_DECK },
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      // No muta nada: resolver es una consulta. El cliente decide que hace con
      // el resultado y guarda cuando quiere (D5 del spec de H7).
      return { data: await decks.resolveLines(request.body.game, request.body.lines) };
    },
  );
```

- [ ] **Paso 6: ejecutar y comprobar que pasa**

```bash
npm run build && npm test
```

Esperado: build sin salida y toda la suite en verde.

- [ ] **Paso 7: commit**

```bash
git add apps/api/src/
git commit -m "feat(decks): add POST /api/decks/resolve for deck imports (T-048)"
```

---

## Tarea 8 — Exportar e importar desde el editor

**Ficheros:**
- Modificar: `apps/web/src/lib/api.ts`
- Crear: `apps/web/src/components/DeckTransferencia.tsx`
- Modificar: `apps/web/src/pages/MazoEditor.tsx`, `apps/web/src/lib/use-deck-editor.ts`
- Modificar: `apps/web/src/styles.css`

- [ ] **Paso 1: el método del cliente**

En `apps/web/src/lib/api.ts`, añadir los tipos tras `DeckDetail`:

```ts
export interface ResolvedLine {
  printId: number;
  cardId: number;
  oracleKey: string;
  name: string;
  typeLine: string | null;
  gameData: GameData;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  imagePath: string | null;
  zone: DeckZone;
  quantity: number;
}

export interface UnresolvedLine {
  name: string | null;
  externalId: string | null;
  quantity: number;
  zone: DeckZone;
}
```

Y el método, junto a los demás de mazos:

```ts
  resolveDeck: (token: string, game: GameCode, lines: DeckLine[]) =>
    request<{ data: { resolved: ResolvedLine[]; unresolved: UnresolvedLine[] } }>(
      '/decks/resolve',
      { method: 'POST', body: JSON.stringify({ game, lines }) },
      token,
    ),
```

Añadir `DeckLine` al import de tipos de `@tcg/shared` en la cabecera del fichero.

- [ ] **Paso 2: exponer el reemplazo del borrador en el hook**

En `apps/web/src/lib/use-deck-editor.ts`, añadir a `DeckEditor`:

```ts
  /** Reemplaza el borrador entero. Lo usa la importacion. */
  reemplazar: (draft: Draft) => void;
```

y en el objeto devuelto:

```ts
    reemplazar: (nuevo: Draft) => setDraft(nuevo),
```

- [ ] **Paso 3: el componente**

`apps/web/src/components/DeckTransferencia.tsx`:

```tsx
import { useState } from 'react';
import type { GameCode } from '@tcg/shared';
import { parseDeck, serializeDeck } from '@tcg/shared';
import { api, type UnresolvedLine } from '../lib/api.js';
import type { Draft } from '../lib/deck-draft.js';

export interface DeckTransferenciaProps {
  game: GameCode;
  draft: Draft;
  token: string;
  onReemplazar: (draft: Draft) => void;
}

const NOMBRE_FORMATO: Record<GameCode, string> = {
  MTG: 'lista de texto',
  YGO: 'fichero .ydk',
  PTCG: 'lista de PTCG Live',
};

export function DeckTransferencia({ game, draft, token, onReemplazar }: DeckTransferenciaProps) {
  const [abierto, setAbierto] = useState<'exportar' | 'importar' | null>(null);
  const [texto, setTexto] = useState('');
  const [pegado, setPegado] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState<{ entraron: number; faltan: UnresolvedLine[] } | null>(null);

  /** Exportar NO va al servidor: el borrador ya lo tiene todo. */
  const exportar = () => {
    setTexto(
      serializeDeck(
        game,
        draft.map((e) => ({
          name: e.name,
          oracleKey: e.oracleKey,
          setCode: e.setCode,
          collectorNumber: e.collectorNumber,
          zone: e.zone,
          quantity: e.quantity,
          gameData: e.gameData,
        })),
      ),
    );
    setAbierto('exportar');
  };

  const importar = async () => {
    setError(null);
    setInforme(null);

    const { lines, warnings } = parseDeck(game, pegado);
    if (lines.length === 0) {
      setError(
        warnings.length > 0
          ? `No se ha reconocido ninguna carta. ${warnings.length} lineas no se entendieron.`
          : 'No se ha reconocido ninguna carta.',
      );
      return;
    }
    // Pegar una lista es traer un mazo, no anadirlo al que ya hay.
    if (draft.length > 0 && !confirm('Esto reemplaza el mazo actual. Continuar?')) return;

    setTrabajando(true);
    try {
      const { resolved, unresolved } = (await api.resolveDeck(token, game, lines)).data;
      onReemplazar(
        resolved.map((r) => ({
          printId: r.printId,
          cardId: r.cardId,
          oracleKey: r.oracleKey,
          name: r.name,
          typeLine: r.typeLine,
          gameData: r.gameData,
          setCode: r.setCode,
          collectorNumber: r.collectorNumber,
          rarity: r.rarity,
          imagePath: r.imagePath,
          owned: 0,
          zone: r.zone,
          quantity: r.quantity,
        })),
      );
      setInforme({
        entraron: resolved.reduce((n, r) => n + r.quantity, 0),
        faltan: unresolved,
      });
    } catch {
      // El borrador queda intacto si falla la red.
      setError('No se ha podido importar. Intentalo otra vez.');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section className="transferencia">
      <div className="transferencia-acciones">
        <button onClick={exportar}>Exportar</button>
        <button onClick={() => setAbierto(abierto === 'importar' ? null : 'importar')}>
          Importar
        </button>
        <span className="tipo">{NOMBRE_FORMATO[game]}</span>
      </div>

      {abierto === 'exportar' && (
        <textarea className="transferencia-texto" readOnly value={texto} rows={10} />
      )}

      {abierto === 'importar' && (
        <>
          <textarea
            className="transferencia-texto"
            placeholder={`Pega aqui tu ${NOMBRE_FORMATO[game]}`}
            value={pegado}
            rows={10}
            onChange={(e) => setPegado(e.target.value)}
          />
          <button onClick={() => void importar()} disabled={trabajando || pegado.trim() === ''}>
            {trabajando ? 'Importando...' : 'Importar al mazo'}
          </button>
        </>
      )}

      {error && <div className="aviso error">{error}</div>}

      {informe && (
        <div className="aviso info">
          Entraron {informe.entraron} cartas.
          {informe.faltan.length > 0 && (
            <>
              {' '}
              No estan en nuestro catalogo:
              <ul className="problemas">
                {informe.faltan.map((f, i) => (
                  <li key={`${f.externalId ?? f.name}-${i}`}>
                    {f.quantity} x {f.name ?? f.externalId}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Paso 4: montarlo en el editor**

En `apps/web/src/pages/MazoEditor.tsx`, añadir el import:

```tsx
import { DeckTransferencia } from '../components/DeckTransferencia.js';
```

y justo después del `<DeckValidacion ... />`:

```tsx
      <DeckTransferencia
        game={deck.game}
        draft={editor.draft}
        token={token}
        onReemplazar={editor.reemplazar}
      />
```

- [ ] **Paso 5: los estilos**

Al final de `apps/web/src/styles.css`:

```css
.transferencia { margin-bottom: 16px; }
.transferencia-acciones { display: flex; align-items: center; gap: 8px; }

.transferencia-texto {
  width: 100%;
  margin-top: 10px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  background: var(--fondo-alt);
  color: var(--texto);
  border: 1px solid var(--borde);
  border-radius: var(--radio);
  padding: 10px;
  resize: vertical;
}
```

- [ ] **Paso 6: compilar y ejecutar**

```bash
npm run build && npm test && npm run build --workspace @tcg/web
```

Esperado: los tres limpios. El build de Vite se ejecuta aparte a propósito: `tsc` en el frontend usa
`emitDeclarationOnly` y **no empaqueta**, así que no detecta un fallo de resolución de imports.

- [ ] **Paso 7: commit**

```bash
git add apps/web/src/
git commit -m "feat(web): add deck import and export to the editor (T-048)"
```

---

## Tarea 9 — Verificación en navegador real y Vault

- [ ] **Paso 1: levantar el entorno**

```bash
docker compose up -d --build
```

Esperado: `api` *healthy*.

- [ ] **Paso 2: el recorrido**

En http://localhost:5173, con sesión iniciada y un mazo de Yu-Gi-Oh! con 40 cartas:

1. Pulsar **Exportar**: aparece el `.ydk` con `#main`, los passcodes repetidos por copia, `#extra` y
   `!side`.
2. Copiar ese texto, vaciar el mazo, pulsar **Importar**, pegarlo y confirmar.
3. El mazo se reconstruye **igual**: mismos conteos por zona y misma validación.
4. Importar una lista con una línea inventada (`999999999`): aparece en el informe de no resueltas y
   el resto entra.

- [ ] **Paso 3: la comprobación que justifica que el códec sea puro**

Con el panel de red abierto y filtrado por `api`:

- Pulsar **Exportar**: **cero peticiones**.
- Pulsar **Importar** con texto pegado: **una sola** petición, a `/api/decks/resolve`.

Si exportar genera tráfico, el códec no está corriendo en el cliente y hay que averiguar por qué.

- [ ] **Paso 4: P-001 en el HTML renderizado**

En la consola del navegador, con el editor abierto y el texto exportado a la vista:

```js
document.documentElement.outerHTML.match(/https?:\/\/(?!localhost)[^"'\s]+/g)
```

Esperado: `null`.

- [ ] **Paso 5: criterios de aceptación**

```bash
npm run build && npm test && npm run build --workspace @tcg/web && npm audit
```

Esperado: los cuatro limpios.

- [ ] **Paso 6: actualizar el Vault**

- `005Registro/2026-08-26_S022_ImportExport.md` — bitácora: qué se construyó, P-027 con su medición,
  qué reveló la verificación, y cualquier problema nuevo con su número.
- `001Reportes/Tareas_Realizadas.md` — T-054, T-048a, T-048b, T-048c, T-048v.
- `001Reportes/Tareas_Pendientes.md` — quitar T-048. **H7 queda cerrado.**
- `003Problemas/Registro_Problemas.md` — P-027 cerrado, con la medición de las 16 copias.
- `00Master/03_Hitos.md` — **H7 ✅ COMPLETADO**. Sólo queda H8.
- `00Master/05_Continuar_Aqui.md` — el siguiente paso natural pasa a ser H8.
- `Claude.md` y `README.md` — mapa y estado.

- [ ] **Paso 7: commit**

```bash
git add -A && git commit -m "docs(h7): close the deckbuilder epic (S022)"
```

---

## Revisión del plan contra el spec

| Requisito del spec | Tarea |
|---|---|
| §2 P-027: agrupar por nombre y reindexar las tres excepciones | 1 |
| §2 fixture de Nidoran corregida a los nombres reales | 1 paso 1 |
| §3 contrato `DeckLine` / `FormatWarning` / `DeckExportEntry` | 2 paso 1 |
| §3 códecs de MTG, YGO y PTCG | 2, 3, 4 |
| §3 `parseDeck` / `serializeDeck` y el registro | 5 |
| §4 `POST /api/decks/resolve`, sin mutar, una consulta | 7 |
| §5 `oracleKey` en `CARD_SUMMARY` y en `DraftCard` | 6 |
| §6 exportar sin red, importar con informe, reemplazo con confirmación | 8 |
| §7 errores: texto vacío, todo fuera del catálogo, fallo de red, cantidad 0 | 2-4 (códecs), 8 (interfaz) |
| §8 tests de tabla, round-trip, navegador real, panel de red, P-001 | 2-5, 9 |
| §9 T-054, T-048a, T-048b, T-048c, T-048v | 1, 2-5, 6-7, 8, 9 |

**Una desviación consciente:** el spec sitúa `resolveLines` en `deck-repository.ts`, y el plan lo
mantiene ahí aunque consulte `cards` y no `decks`. Moverlo a `catalog-query-repository.ts` sería
defendible, pero es el editor de mazos quien lo usa y la ruta vive en `deck-routes.ts`: mantener
juntas las cosas que cambian juntas pesa más que la pureza de la tabla que consulta.
