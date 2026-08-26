# Plan de implementación — T-047, interfaz del constructor de mazos

> **Para quien ejecute esto:** las tareas se hacen **en orden** y cada una acaba con su commit.
> Spec de referencia: [`06_Spec_T047_Interfaz_Mazos.md`](06_Spec_T047_Interfaz_Mazos.md).

**Objetivo:** que un usuario cree mazos desde el navegador, los llene buscando cartas y vea la
validación actualizarse **en cada clic, sin ninguna petición al servidor**.

**Arquitectura:** toda la lógica del mazo en edición vive en un módulo puro (`deck-draft.ts`) que no
importa React, porque los tests de este frontend son de lógica pura y no hay entorno DOM en Vitest.
Un hook lo envuelve y deriva la validación con el mismo `validateDeck` que usa el backend. Las
pantallas sólo pintan.

**Stack:** React 18, react-router-dom 7, TanStack Query 5, Vite 8, Vitest. Sin librerías nuevas.

**Antes de empezar:** `npm run build && npm test` limpios y `docker compose up -d` levantado, porque
la tarea 8 verifica en navegador real.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `apps/api/src/api/deck-schemas.ts` | **Modificar**: declarar `oracleKey` y `gameData` en `DECK_CARD` |
| `apps/web/src/lib/deck-draft.ts` | El borrador y sus operaciones. Puro, sin React |
| `apps/web/src/lib/deck-draft.test.ts` | Sus tests |
| `apps/web/src/lib/api.ts` | **Modificar**: tipos y métodos de mazos + `card(printId)` |
| `apps/web/src/lib/use-deck-editor.ts` | Enganche de React: estado, validación derivada, guardado |
| `apps/web/src/pages/Mazos.tsx` | Lista: listar, crear, borrar |
| `apps/web/src/pages/MazoEditor.tsx` | Editor: compone las tres piezas |
| `apps/web/src/components/DeckBuscador.tsx` | Búsqueda compacta con botón de añadir |
| `apps/web/src/components/DeckZona.tsx` | Una zona con sus cartas y sus controles |
| `apps/web/src/components/DeckValidacion.tsx` | Conteos, problemas traducidos y botón de guardar |
| `apps/web/src/App.tsx` | **Modificar**: dos rutas y una entrada de menú |
| `apps/web/src/styles.css` | **Modificar**: clases del editor |

---

## Tarea 1 — T-052: el esquema declara `oracleKey` y `gameData`

Sin esto el cliente no tiene con qué validar y D1 del spec de H7 es papel mojado.

**Ficheros:**
- Modificar: `apps/api/src/api/deck-schemas.ts`
- Modificar: `apps/api/src/api/deck-routes.test.ts`

- [ ] **Paso 1: escribir el test que falla**

En `apps/api/src/api/deck-routes.test.ts`, dentro del `describe('rutas de mazos', ...)`, añadir:

```ts
  it('T-052: cada carta del mazo viaja con oracleKey y gameData', async () => {
    // Sin estos dos campos el cliente no puede llamar a validateDeck: uno
    // agrupa las copias y el otro lleva la banlist de Yu-Gi-Oh! y el subtipo de
    // las Energias de Pokemon. El repositorio ya los produce desde T-045; lo
    // que faltaba era declararlos en el esquema.
    const id = await crear(tokenA, 'Con datos');
    await app.inject({
      method: 'PUT',
      url: `/api/decks/${id}/cards`,
      headers: auth(tokenA),
      payload: { cards: [{ printId: 10, zone: 'main', quantity: 1 }] },
    });

    const res = await app.inject({ method: 'GET', url: `/api/decks/${id}`, headers: auth(tokenA) });
    const carta = res.json().data.cards[0];
    expect(carta.oracleKey).toBe('carta-10');
    expect(carta.gameData).toEqual({});
  });
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
npx vitest run apps/api/src/api/deck-routes.test.ts
```

Esperado: falla con `expected undefined to be 'carta-10'`. Ese `undefined` **es el bug**: el doble
devuelve el campo y Fastify lo poda porque el esquema no lo declara.

- [ ] **Paso 3: declararlos en el esquema**

En `apps/api/src/api/deck-schemas.ts`, sustituir el bloque `DECK_CARD` entero por:

```ts
const DECK_CARD = {
  type: 'object',
  properties: {
    printId: { type: 'integer' },
    cardId: { type: 'integer' },
    // El cliente agrupa las copias por carta, no por impresion (RN-04). Sin
    // esto no puede reproducir la validacion del servidor.
    oracleKey: { type: 'string' },
    name: { type: 'string' },
    typeLine: { type: ['string', 'null'] },
    // Lleva la banlist de Yu-Gi-Oh! y el subtipo de las Energias de Pokemon.
    // Viaja igual que en CARD_DETAIL desde H3: los adaptadores lo construyen
    // con lista blanca y ninguno de los tres perfiles contiene una URL, asi
    // que no abre el agujero de P-001.
    gameData: { type: 'object', additionalProperties: true },
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
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

```bash
npm run build && npx vitest run apps/api/src/api/deck-routes.test.ts
```

Esperado: build sin salida y `Tests  12 passed`. El test de "ninguna respuesta contiene una URL
externa" tiene que seguir verde: es el que cubre el riesgo de abrir `gameData`.

- [ ] **Paso 5: commit**

```bash
git add apps/api/src/api/ && git commit -m "feat(decks): expose oracleKey and gameData on deck cards (T-052)"
```

---

## Tarea 2 — `deck-draft.ts`, el borrador

**Ficheros:**
- Crear: `apps/web/src/lib/deck-draft.ts`
- Crear: `apps/web/src/lib/deck-draft.test.ts`

- [ ] **Paso 1: escribir el test que falla**

`apps/web/src/lib/deck-draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  addCard,
  fromDeckDetail,
  moveZone,
  setQuantity,
  toDeckEntries,
  toPayload,
  zoneFor,
  MAX_QUANTITY,
  type Draft,
  type DraftCard,
} from './deck-draft.js';

function carta(over: Partial<DraftCard> = {}): DraftCard {
  return {
    printId: 1,
    cardId: 100,
    name: 'Carta',
    typeLine: 'Effect Monster',
    gameData: {},
    setCode: 'TST',
    collectorNumber: '001',
    rarity: 'common',
    imagePath: null,
    owned: 0,
    ...over,
  };
}

describe('zoneFor', () => {
  it('manda al Extra Deck lo que le corresponde en Yu-Gi-Oh!', () => {
    // La grafia real del catalogo es "Xyz", no "XYZ" (ver P-023 y el spec de H7).
    expect(zoneFor('YGO', 'Xyz Effect Monster')).toBe('extra');
    expect(zoneFor('YGO', 'Fusion Effect Monster')).toBe('extra');
    expect(zoneFor('YGO', 'Synchro Effect Monster')).toBe('extra');
    expect(zoneFor('YGO', 'Link Effect Monster')).toBe('extra');
  });

  it('deja en el Main lo demas, incluido el Ritual', () => {
    expect(zoneFor('YGO', 'Ritual Effect Monster')).toBe('main');
    expect(zoneFor('YGO', 'Effect Monster')).toBe('main');
    expect(zoneFor('YGO', 'Continuous Spell')).toBe('main');
    expect(zoneFor('YGO', null)).toBe('main');
  });

  it('Magic y Pokemon no tienen Extra Deck', () => {
    expect(zoneFor('MTG', 'Creature')).toBe('main');
    // Aunque el texto contenga una palabra de las de Yu-Gi-Oh!.
    expect(zoneFor('MTG', 'Artifact Creature')).toBe('main');
    expect(zoneFor('PTCG', 'Pokemon - Basic')).toBe('main');
  });
});

describe('addCard', () => {
  it('anade una copia y elige la zona por la regla', () => {
    const draft = addCard([], carta({ typeLine: 'Xyz Effect Monster' }), 'YGO');
    expect(draft).toHaveLength(1);
    expect(draft[0]?.zone).toBe('extra');
    expect(draft[0]?.quantity).toBe(1);
  });

  it('incrementa en vez de duplicar la fila', () => {
    let draft: Draft = [];
    draft = addCard(draft, carta(), 'YGO');
    draft = addCard(draft, carta(), 'YGO');
    expect(draft).toHaveLength(1);
    expect(draft[0]?.quantity).toBe(2);
  });

  it('no muta el borrador anterior', () => {
    const antes: Draft = addCard([], carta(), 'YGO');
    const despues = addCard(antes, carta(), 'YGO');
    expect(antes[0]?.quantity).toBe(1);
    expect(despues[0]?.quantity).toBe(2);
  });

  it('dos impresiones distintas son dos filas', () => {
    let draft: Draft = addCard([], carta({ printId: 1 }), 'YGO');
    draft = addCard(draft, carta({ printId: 2 }), 'YGO');
    expect(draft).toHaveLength(2);
  });
});

describe('setQuantity', () => {
  it('cambia la cantidad', () => {
    const draft = setQuantity(addCard([], carta(), 'YGO'), 1, 'main', 3);
    expect(draft[0]?.quantity).toBe(3);
  });

  it('cero o menos elimina la fila', () => {
    const inicial = addCard([], carta(), 'YGO');
    expect(setQuantity(inicial, 1, 'main', 0)).toHaveLength(0);
    expect(setQuantity(inicial, 1, 'main', -4)).toHaveLength(0);
  });

  it('topa en 99, que es el CHECK de deck_cards', () => {
    const draft = setQuantity(addCard([], carta(), 'YGO'), 1, 'main', 200);
    expect(draft[0]?.quantity).toBe(MAX_QUANTITY);
    expect(MAX_QUANTITY).toBe(99);
  });
});

describe('moveZone', () => {
  it('mueve la fila de zona', () => {
    const draft = moveZone(addCard([], carta(), 'YGO'), 1, 'main', 'side');
    expect(draft).toHaveLength(1);
    expect(draft[0]?.zone).toBe('side');
  });

  it('FUSIONA si la zona destino ya tenia esa impresion', () => {
    // Dos filas con la misma (impresion, zona) violarian uq_deck_card_zone al
    // guardar. El borrador no puede llegar a producirlas.
    let draft: Draft = addCard([], carta(), 'YGO');
    draft = setQuantity(draft, 1, 'main', 2);
    draft = [...draft, { ...carta(), zone: 'side', quantity: 1 }];
    const fusionado = moveZone(draft, 1, 'main', 'side');
    expect(fusionado).toHaveLength(1);
    expect(fusionado[0]?.quantity).toBe(3);
  });

  it('mover a la misma zona no cambia nada', () => {
    const inicial = addCard([], carta(), 'YGO');
    expect(moveZone(inicial, 1, 'main', 'main')).toEqual(inicial);
  });
});

describe('toDeckEntries', () => {
  it('dos impresiones de la MISMA carta comparten oracleKey', () => {
    // Es RN-04: cuatro impresiones distintas son una sola carta a efectos del
    // limite de copias. `cardId` es esa identidad, y solo esta disponible en el
    // cliente desde que se corrigio P-024.
    let draft: Draft = addCard([], carta({ printId: 1, cardId: 100 }), 'YGO');
    draft = addCard(draft, carta({ printId: 2, cardId: 100 }), 'YGO');
    const entries = toDeckEntries(draft);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.oracleKey).toBe(entries[1]?.oracleKey);
    expect(entries[0]?.oracleKey).toBe('100');
  });

  it('lleva lo que el motor necesita', () => {
    const draft = addCard([], carta({ typeLine: 'Effect Monster', gameData: { atk: 1200 } }), 'YGO');
    expect(toDeckEntries(draft)[0]).toEqual({
      oracleKey: '100',
      name: 'Carta',
      typeLine: 'Effect Monster',
      gameData: { atk: 1200 },
      zone: 'main',
      quantity: 1,
    });
  });
});

describe('toPayload', () => {
  it('produce lo que espera PUT /api/decks/:id/cards', () => {
    let draft: Draft = addCard([], carta({ printId: 7 }), 'YGO');
    draft = setQuantity(draft, 7, 'main', 3);
    expect(toPayload(draft)).toEqual([{ printId: 7, zone: 'main', quantity: 3 }]);
  });

  it('nunca emite dos filas con la misma (impresion, zona)', () => {
    let draft: Draft = addCard([], carta({ printId: 7 }), 'YGO');
    draft = addCard(draft, carta({ printId: 7 }), 'YGO');
    const claves = toPayload(draft).map((e) => `${e.printId}:${e.zone}`);
    expect(new Set(claves).size).toBe(claves.length);
  });
});

describe('fromDeckDetail', () => {
  it('ida y vuelta: lo que entra es lo que sale', () => {
    const cards = [
      { ...carta({ printId: 1 }), zone: 'main' as const, quantity: 3 },
      { ...carta({ printId: 2, typeLine: 'Xyz Effect Monster' }), zone: 'extra' as const, quantity: 1 },
    ];
    expect(toPayload(fromDeckDetail(cards))).toEqual([
      { printId: 1, zone: 'main', quantity: 3 },
      { printId: 2, zone: 'extra', quantity: 1 },
    ]);
  });

  it('el mazo vacio no lanza', () => {
    expect(fromDeckDetail([])).toEqual([]);
  });
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
npx vitest run apps/web/src/lib/deck-draft.test.ts
```

Esperado: falla al resolver `./deck-draft.js`.

- [ ] **Paso 3: escribir la implementación**

`apps/web/src/lib/deck-draft.ts`:

```ts
import type { DeckEntry, DeckZone, GameCode, GameData } from '@tcg/shared';
import { isYgoExtraDeckCard } from '@tcg/shared';

/**
 * El mazo en edicion.
 *
 * Este modulo NO importa React a proposito. Los tests de este frontend son de
 * logica pura —no hay entorno DOM configurado en Vitest—, asi que la logica
 * dentro de un componente seria logica sin probar. Todas las operaciones
 * devuelven un borrador nuevo: nada muta en el sitio.
 */

/** Tope de copias por fila. Es el CHECK de `deck_cards`, no una preferencia. */
export const MAX_QUANTITY = 99;

export interface DraftCard {
  printId: number;
  cardId: number;
  name: string;
  typeLine: string | null;
  gameData: GameData;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  imagePath: string | null;
  /** Copias que el usuario posee. Informativo, nunca un impedimento (RN-03). */
  owned: number;
}

export interface DraftEntry extends DraftCard {
  zone: DeckZone;
  quantity: number;
}

export type Draft = readonly DraftEntry[];

/**
 * Zona que le corresponde a una carta.
 *
 * En Yu-Gi-Oh! no es una preferencia del usuario: un Xyz DEBE ir al Extra Deck.
 * Magic y Pokemon no tienen Extra Deck en v1, asi que todo cae en `main`.
 */
export function zoneFor(game: GameCode, typeLine: string | null): DeckZone {
  if (game === 'YGO' && isYgoExtraDeckCard(typeLine)) return 'extra';
  return 'main';
}

function acotar(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_QUANTITY, Math.trunc(n)));
}

function misma(entry: DraftEntry, printId: number, zone: DeckZone): boolean {
  return entry.printId === printId && entry.zone === zone;
}

export function addCard(draft: Draft, card: DraftCard, game: GameCode): Draft {
  const zone = zoneFor(game, card.typeLine);
  const existe = draft.some((e) => misma(e, card.printId, zone));
  if (!existe) return [...draft, { ...card, zone, quantity: 1 }];
  return draft.map((e) =>
    misma(e, card.printId, zone) ? { ...e, quantity: acotar(e.quantity + 1) } : e,
  );
}

export function setQuantity(draft: Draft, printId: number, zone: DeckZone, n: number): Draft {
  const cantidad = acotar(n);
  if (cantidad === 0) return draft.filter((e) => !misma(e, printId, zone));
  return draft.map((e) => (misma(e, printId, zone) ? { ...e, quantity: cantidad } : e));
}

/**
 * Mueve una fila de zona, FUSIONANDO si la destino ya tenia esa impresion.
 *
 * Sin la fusion, el borrador podria producir dos filas con la misma
 * `(impresion, zona)` y el guardado violaria `uq_deck_card_zone`.
 */
export function moveZone(draft: Draft, printId: number, from: DeckZone, to: DeckZone): Draft {
  if (from === to) return draft;
  const origen = draft.find((e) => misma(e, printId, from));
  if (!origen) return draft;

  const sinOrigen = draft.filter((e) => !misma(e, printId, from));
  const destino = sinOrigen.find((e) => misma(e, printId, to));
  if (!destino) return [...sinOrigen, { ...origen, zone: to }];

  return sinOrigen.map((e) =>
    misma(e, printId, to) ? { ...e, quantity: acotar(e.quantity + origen.quantity) } : e,
  );
}

/**
 * Entrada del motor de reglas.
 *
 * `oracleKey` sale de `cardId`: dos impresiones distintas de la misma carta lo
 * comparten, que es exactamente la identidad que pide RN-04. Solo esta
 * disponible en el cliente desde que se corrigio P-024.
 */
export function toDeckEntries(draft: Draft): DeckEntry[] {
  return draft.map((e) => ({
    oracleKey: String(e.cardId),
    name: e.name,
    typeLine: e.typeLine,
    gameData: e.gameData,
    zone: e.zone,
    quantity: e.quantity,
  }));
}

export interface DeckCardPayload {
  printId: number;
  zone: DeckZone;
  quantity: number;
}

export function toPayload(draft: Draft): DeckCardPayload[] {
  return draft
    .filter((e) => e.quantity >= 1)
    .map((e) => ({ printId: e.printId, zone: e.zone, quantity: acotar(e.quantity) }));
}

/** Borrador a partir de lo que devuelve `GET /api/decks/:id`. */
export function fromDeckDetail(cards: readonly DraftEntry[]): Draft {
  return cards.map((c) => ({
    printId: c.printId,
    cardId: c.cardId,
    name: c.name,
    typeLine: c.typeLine,
    gameData: c.gameData,
    setCode: c.setCode,
    collectorNumber: c.collectorNumber,
    rarity: c.rarity,
    imagePath: c.imagePath,
    owned: c.owned,
    zone: c.zone,
    quantity: acotar(c.quantity),
  }));
}

/**
 * Firma canonica del contenido, para saber si hay cambios sin guardar.
 *
 * Se ordena a proposito: el orden de las filas no es un cambio, y comparar el
 * array tal cual marcaria el mazo como sucio por mover una carta de sitio.
 */
export function firmaDe(draft: Draft): string {
  return toPayload(draft)
    .map((e) => `${e.printId}:${e.zone}:${e.quantity}`)
    .sort()
    .join('|');
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

```bash
npx vitest run apps/web/src/lib/deck-draft.test.ts
```

Esperado: `Tests  18 passed`.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/lib/deck-draft.ts apps/web/src/lib/deck-draft.test.ts
git commit -m "feat(web): add the pure deck draft module (T-047)"
```

---

## Tarea 3 — Cliente de API y hook del editor

**Ficheros:**
- Modificar: `apps/web/src/lib/api.ts`
- Crear: `apps/web/src/lib/use-deck-editor.ts`

- [ ] **Paso 1: tipos y métodos de mazos**

En `apps/web/src/lib/api.ts`, cambiar la primera línea de import por:

```ts
import type { DeckValidation, DeckZone, GameCode, GameData } from '@tcg/shared';
```

Añadir estos tipos justo después de `export interface CardPage { ... }`:

```ts
export interface CardDetail extends CardSummary {
  rulesText: string | null;
  gameData: GameData;
  releasedAt: string | null;
  finishes: string[];
  inBoosters: boolean;
}

export interface DeckCounts {
  main: number;
  extra: number;
  side: number;
  commander: number;
}

export interface DeckSummary {
  id: number;
  game: GameCode;
  name: string;
  description: string | null;
  format: string | null;
  isPublic: boolean;
  counts: DeckCounts;
  createdAt: string;
  updatedAt: string;
}

export interface DeckCard {
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
  /** Copias que el usuario posee. 0 no impide nada (RN-03). */
  owned: number;
}

export interface DeckDetail extends DeckSummary {
  cards: DeckCard[];
  validation: DeckValidation;
}
```

Y dentro del objeto `api`, justo después del método `cards: (...)`, añadir:

```ts
  /**
   * Detalle de una impresion. El editor lo necesita porque `/cards` no trae
   * `gameData`, y sin `gameData` no se puede validar la banlist de Yu-Gi-Oh! ni
   * distinguir la Energia Basica de la Especial en Pokemon.
   */
  card: (printId: number) => request<{ data: CardDetail }>(`/cards/${printId}`),

  decks: (token: string, game?: GameCode) =>
    request<{ data: DeckSummary[] }>(`/decks${game ? `?game=${game}` : ''}`, {}, token),

  createDeck: (token: string, body: { game: GameCode; name: string }) =>
    request<{ data: DeckSummary }>(
      '/decks',
      { method: 'POST', body: JSON.stringify(body) },
      token,
    ),

  deck: (token: string, id: number) => request<{ data: DeckDetail }>(`/decks/${id}`, {}, token),

  patchDeck: (token: string, id: number, body: { name?: string; format?: string | null }) =>
    request<{ data: DeckSummary }>(
      `/decks/${id}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      token,
    ),

  putDeckCards: (
    token: string,
    id: number,
    cards: Array<{ printId: number; zone: DeckZone; quantity: number }>,
  ) =>
    request<{ data: DeckDetail }>(
      `/decks/${id}/cards`,
      { method: 'PUT', body: JSON.stringify({ cards }) },
      token,
    ),

  deleteDeck: (token: string, id: number) =>
    request<{ data: { id: number } }>(`/decks/${id}`, { method: 'DELETE' }, token),
```

- [ ] **Paso 2: escribir el hook**

`apps/web/src/lib/use-deck-editor.ts`:

```ts
import { useCallback, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { validateDeck, type DeckValidation, type DeckZone } from '@tcg/shared';
import { api, ApiError, type DeckDetail } from './api.js';
import {
  addCard,
  firmaDe,
  fromDeckDetail,
  moveZone,
  setQuantity,
  toDeckEntries,
  toPayload,
  type Draft,
  type DraftCard,
} from './deck-draft.js';

export interface DeckEditor {
  draft: Draft;
  /** Recalculada en CADA cambio, en el navegador, sin tocar la red. */
  validation: DeckValidation;
  sucio: boolean;
  guardando: boolean;
  errorGuardado: string | null;
  /** Solo se rellena si el servidor discrepa del cliente. No deberia pasar. */
  discrepancia: DeckValidation | null;
  anadir: (card: DraftCard) => void;
  cambiarCantidad: (printId: number, zone: DeckZone, n: number) => void;
  moverZona: (printId: number, from: DeckZone, to: DeckZone) => void;
  guardar: () => void;
}

/**
 * Estado del editor.
 *
 * Se monta con `key={deck.id}` desde la pagina, asi que cambiar de mazo
 * remonta el componente y el estado se reinicia solo. Sin eso haria falta un
 * efecto de sincronizacion, que es una fuente clasica de borradores perdidos.
 */
export function useDeckEditor(deck: DeckDetail, token: string): DeckEditor {
  const inicial = useMemo(() => fromDeckDetail(deck.cards), [deck.cards]);
  const [draft, setDraft] = useState<Draft>(inicial);
  const [guardado, setGuardado] = useState<string>(() => firmaDe(inicial));
  const [discrepancia, setDiscrepancia] = useState<DeckValidation | null>(null);

  const validation = useMemo(
    () => validateDeck(deck.game, toDeckEntries(draft)),
    [deck.game, draft],
  );

  const mutacion = useMutation({
    mutationFn: () => api.putDeckCards(token, deck.id, toPayload(draft)),
    onSuccess: (respuesta) => {
      setGuardado(firmaDe(draft));
      // Cliente y servidor corren el MISMO modulo de @tcg/shared, asi que esto
      // deberia coincidir siempre. Se compara justo por eso: si algun dia no
      // coincide, hay que verlo, no descubrirlo por un mazo mal guardado.
      const servidor = respuesta.data.validation;
      const iguales =
        servidor.valid === validation.valid && servidor.issues.length === validation.issues.length;
      setDiscrepancia(iguales ? null : servidor);
    },
  });

  const anadir = useCallback(
    (card: DraftCard) => setDraft((d) => addCard(d, card, deck.game)),
    [deck.game],
  );

  const cambiarCantidad = useCallback(
    (printId: number, zone: DeckZone, n: number) =>
      setDraft((d) => setQuantity(d, printId, zone, n)),
    [],
  );

  const moverZona = useCallback(
    (printId: number, from: DeckZone, to: DeckZone) => setDraft((d) => moveZone(d, printId, from, to)),
    [],
  );

  const error = mutacion.error;
  return {
    draft,
    validation,
    sucio: firmaDe(draft) !== guardado,
    guardando: mutacion.isPending,
    errorGuardado:
      error instanceof ApiError ? error.message : error ? 'No se pudo guardar el mazo' : null,
    discrepancia,
    anadir,
    cambiarCantidad,
    moverZona,
    guardar: () => mutacion.mutate(),
  };
}
```

- [ ] **Paso 3: compilar**

```bash
npm run build
```

Esperado: sin salida.

- [ ] **Paso 4: commit**

```bash
git add apps/web/src/lib/ && git commit -m "feat(web): add deck API client and editor hook (T-047)"
```

---

## Tarea 4 — Estilos del editor

Se hacen antes que las pantallas para que al montarlas se vean bien a la primera.

**Ficheros:**
- Modificar: `apps/web/src/styles.css`

- [ ] **Paso 1: añadir las clases al final del fichero**

```css
/* ---------------------------------------------------------------- mazos */

.mazo-lista { display: flex; flex-direction: column; gap: 8px; }

.mazo-fila {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--superficie);
  border: 1px solid var(--borde);
  border-radius: var(--radio);
}

.mazo-fila .nombre { font-weight: 600; }
.mazo-fila .meta { font-size: 12px; color: var(--texto-tenue); }

/* Dos columnas: buscador y mazo. En pantalla estrecha se apilan. */
.editor { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 18px; }
@media (max-width: 900px) { .editor { grid-template-columns: 1fr; } }

.editor-columna { display: flex; flex-direction: column; gap: 10px; min-width: 0; }

.buscador-fila {
  display: grid;
  grid-template-columns: 38px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--borde);
  border-radius: var(--radio);
  background: var(--superficie);
}

.buscador-fila img { width: 38px; height: 38px; object-fit: cover; border-radius: 4px; }
.buscador-fila .sin-imagen { width: 38px; height: 38px; border: 1px dashed var(--borde); border-radius: 4px; }
.buscador-fila .nombre { font-size: 13px; }
/* Se usa en el buscador y en las lineas del mazo. */
.tipo { font-size: 11px; color: var(--texto-tenue); }

.zona { border: 1px solid var(--borde); border-radius: var(--radio); overflow: hidden; }

.zona-cabecera {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  background: var(--fondo-alt);
  border-bottom: 1px solid var(--borde);
  font-size: 13px;
}

.zona-cabecera .cifras { margin-left: auto; color: var(--texto-tenue); font-variant-numeric: tabular-nums; }
.zona-cabecera .cifras.mal { color: var(--peligro); }

.linea-carta {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--fondo-alt);
  font-size: 13px;
}

.linea-carta:last-child { border-bottom: none; }
.linea-carta .cantidad { display: flex; align-items: center; gap: 4px; }
.linea-carta .cantidad .valor { min-width: 22px; text-align: center; font-variant-numeric: tabular-nums; }
.linea-carta button { padding: 2px 8px; font-size: 12px; }
.linea-carta .no-poseida { color: var(--acento-tenue); font-size: 11px; }

.problemas { display: flex; flex-direction: column; gap: 4px; margin: 8px 0 0; padding: 0; list-style: none; }
.problemas li { font-size: 12px; color: #ffb3b1; }

.barra-guardar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.barra-guardar .estado { font-size: 13px; }
.barra-guardar .estado.valido { color: var(--exito); }
.barra-guardar .estado.invalido { color: var(--texto-tenue); }
```

- [ ] **Paso 2: commit**

```bash
git add apps/web/src/styles.css && git commit -m "style(web): add deck builder styles (T-047)"
```

---

## Tarea 5 — Panel de validación

**Ficheros:**
- Crear: `apps/web/src/components/DeckValidacion.tsx`

- [ ] **Paso 1: escribir el componente**

`apps/web/src/components/DeckValidacion.tsx`:

```tsx
import type { DeckIssue, DeckIssueCode, DeckValidation, DeckZone, GameCode } from '@tcg/shared';
import {
  MTG_MAX_SIDE,
  MTG_MIN_MAIN,
  PTCG_DECK_SIZE,
  YGO_MAX_EXTRA,
  YGO_MAX_MAIN,
  YGO_MAX_SIDE,
  YGO_MIN_MAIN,
} from '@tcg/shared';

/**
 * Los textos se construyen aqui a partir del CODIGO del problema, no del
 * `message` que manda el servidor. El codigo es estable y traducible; el texto
 * del servidor es el respaldo para un codigo que esta interfaz no conozca.
 */
const TEXTOS: Record<DeckIssueCode, (i: DeckIssue) => string> = {
  main_too_small: (i) => `Faltan cartas en el mazo principal: hay ${i.actual} y el minimo son ${i.allowed}`,
  main_too_large: (i) => `Sobran cartas en el mazo principal: hay ${i.actual} y el maximo son ${i.allowed}`,
  extra_too_large: (i) => `El Extra Deck tiene ${i.actual} cartas y el maximo son ${i.allowed}`,
  side_too_large: (i) => `El Side Deck tiene ${i.actual} cartas y el maximo son ${i.allowed}`,
  too_many_copies: (i) => `"${i.cardName}" aparece ${i.actual} veces y el maximo son ${i.allowed}`,
  banned_card: (i) =>
    i.allowed === 0
      ? `"${i.cardName}" esta prohibida por la banlist vigente`
      : `"${i.cardName}" esta limitada a ${i.allowed} y hay ${i.actual}`,
  wrong_zone: (i) => `"${i.cardName}" no puede ir en esa zona`,
  unsupported_zone: (i) => `"${i.cardName}" esta en una zona que este juego no usa`,
};

export function textoDeProblema(issue: DeckIssue): string {
  const plantilla = TEXTOS[issue.code];
  return plantilla ? plantilla(issue) : issue.message;
}

/** Zonas que muestra cada juego, con su objetivo. */
export function zonasDe(game: GameCode): Array<{ zone: DeckZone; etiqueta: string; objetivo: string }> {
  if (game === 'YGO') {
    return [
      { zone: 'main', etiqueta: 'Main Deck', objetivo: `${YGO_MIN_MAIN}-${YGO_MAX_MAIN}` },
      { zone: 'extra', etiqueta: 'Extra Deck', objetivo: `0-${YGO_MAX_EXTRA}` },
      { zone: 'side', etiqueta: 'Side Deck', objetivo: `0-${YGO_MAX_SIDE}` },
    ];
  }
  if (game === 'MTG') {
    return [
      { zone: 'main', etiqueta: 'Mazo principal', objetivo: `${MTG_MIN_MAIN}+` },
      { zone: 'side', etiqueta: 'Sideboard', objetivo: `0-${MTG_MAX_SIDE}` },
    ];
  }
  return [{ zone: 'main', etiqueta: 'Mazo', objetivo: `${PTCG_DECK_SIZE}` }];
}

export interface DeckValidacionProps {
  validation: DeckValidation;
  sucio: boolean;
  guardando: boolean;
  errorGuardado: string | null;
  discrepancia: DeckValidation | null;
  onGuardar: () => void;
}

export function DeckValidacion(props: DeckValidacionProps) {
  const { validation, sucio, guardando, errorGuardado, discrepancia, onGuardar } = props;

  return (
    <>
      <div className="barra-guardar">
        <span className={`estado ${validation.valid ? 'valido' : 'invalido'}`}>
          {validation.valid ? 'Mazo valido' : `${validation.issues.length} cosas por resolver`}
        </span>
        <button onClick={onGuardar} disabled={!sucio || guardando}>
          {guardando ? 'Guardando...' : sucio ? 'Guardar' : 'Guardado'}
        </button>
      </div>

      {errorGuardado && <div className="aviso error">{errorGuardado}</div>}

      {discrepancia && (
        // No deberia ocurrir nunca: cliente y servidor corren el mismo modulo.
        // Si ocurre, manda el servidor y el usuario tiene que enterarse.
        <div className="aviso error">
          El servidor ha validado este mazo de forma distinta. Manda el servidor:{' '}
          {discrepancia.valid ? 'lo da por valido' : `${discrepancia.issues.length} problemas`}.
        </div>
      )}

      {validation.issues.length > 0 && (
        <ul className="problemas">
          {validation.issues.map((issue, i) => (
            <li key={`${issue.code}-${issue.oracleKey ?? i}`}>{textoDeProblema(issue)}</li>
          ))}
        </ul>
      )}
    </>
  );
}
```

- [ ] **Paso 2: compilar**

```bash
npm run build
```

Esperado: sin salida.

- [ ] **Paso 3: commit**

```bash
git add apps/web/src/components/DeckValidacion.tsx
git commit -m "feat(web): add deck validation panel (T-047)"
```

---

## Tarea 6 — Buscador y zonas

**Ficheros:**
- Crear: `apps/web/src/components/DeckBuscador.tsx`
- Crear: `apps/web/src/components/DeckZona.tsx`

- [ ] **Paso 1: el buscador**

`apps/web/src/components/DeckBuscador.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GameCode } from '@tcg/shared';
import { api, imageUrl, type CardSummary } from '../lib/api.js';
import type { DraftCard } from '../lib/deck-draft.js';

export interface DeckBuscadorProps {
  /** Lo fija el mazo, no el usuario: es lo que evita un game_mismatch. */
  game: GameCode;
  onAnadir: (card: DraftCard) => void;
}

export function DeckBuscador({ game, onAnadir }: DeckBuscadorProps) {
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [set, setSet] = useState('');
  const [pidiendo, setPidiendo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Retardo para no consultar en cada tecla.
  useEffect(() => {
    const id = setTimeout(() => setBusqueda(texto), 300);
    return () => clearTimeout(id);
  }, [texto]);

  const sets = useQuery({
    queryKey: ['sets', game],
    queryFn: () => api.sets(game).then((r) => r.data),
  });

  const resultados = useQuery({
    queryKey: ['deck-buscador', game, set, busqueda],
    queryFn: () => api.cards({ game, set, q: busqueda, limit: 30 }).then((r) => r.data),
  });

  /**
   * Anadir pide el DETALLE de la impresion.
   *
   * `/api/cards` no trae `gameData`, y sin el no se puede validar la banlist de
   * Yu-Gi-Oh! ni distinguir la Energia Basica de la Especial. React Query lo
   * cachea y las cartas son inmutables: solo se paga la primera vez.
   */
  const anadir = async (carta: CardSummary) => {
    setPidiendo(carta.printId);
    setError(null);
    try {
      const detalle = (await api.card(carta.printId)).data;
      onAnadir({
        printId: detalle.printId,
        cardId: detalle.cardId,
        name: detalle.name,
        typeLine: detalle.typeLine,
        gameData: detalle.gameData,
        setCode: detalle.setCode,
        collectorNumber: detalle.collectorNumber,
        rarity: detalle.rarity,
        imagePath: detalle.imagePath,
        owned: 0,
      });
    } catch {
      // El borrador queda intacto: no se anade una carta a medias.
      setError(`No se pudo anadir "${carta.name}". Intentalo otra vez.`);
    } finally {
      setPidiendo(null);
    }
  };

  return (
    <div className="editor-columna">
      <div className="filtros">
        <input
          placeholder="Buscar por nombre"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <select value={set} onChange={(e) => setSet(e.target.value)}>
          <option value="">Todos los sets</option>
          {(sets.data ?? []).map((s) => (
            <option key={s.externalId} value={s.externalId}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="aviso error">{error}</div>}

      {resultados.isLoading && <div className="vacio">Buscando...</div>}
      {resultados.data?.length === 0 && <div className="vacio">Ninguna carta coincide.</div>}

      {(resultados.data ?? []).map((carta) => {
        const src = imageUrl(carta.imagePath);
        return (
          <div className="buscador-fila" key={carta.printId}>
            {src ? <img src={src} alt="" loading="lazy" /> : <span className="sin-imagen" />}
            <div>
              <div className="nombre">{carta.name}</div>
              <div className="tipo">
                {carta.typeLine ?? '—'} · {carta.setCode} {carta.collectorNumber}
              </div>
            </div>
            <button onClick={() => void anadir(carta)} disabled={pidiendo === carta.printId}>
              {pidiendo === carta.printId ? '...' : 'Anadir'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Paso 2: las zonas**

`apps/web/src/components/DeckZona.tsx`:

```tsx
import type { DeckZone } from '@tcg/shared';
import type { Draft } from '../lib/deck-draft.js';

export interface DeckZonaProps {
  etiqueta: string;
  objetivo: string;
  zone: DeckZone;
  draft: Draft;
  /** true si el conteo de esta zona incumple su objetivo. */
  mal: boolean;
  onCantidad: (printId: number, zone: DeckZone, n: number) => void;
  onMover: (printId: number, from: DeckZone, to: DeckZone) => void;
}

export function DeckZona(props: DeckZonaProps) {
  const { etiqueta, objetivo, zone, draft, mal, onCantidad, onMover } = props;
  const filas = draft.filter((e) => e.zone === zone);
  const total = filas.reduce((n, e) => n + e.quantity, 0);

  return (
    <section className="zona">
      <div className="zona-cabecera">
        <strong>{etiqueta}</strong>
        <span className={`cifras ${mal ? 'mal' : ''}`}>
          {total} / {objetivo}
        </span>
      </div>

      {filas.length === 0 && <div className="vacio">Vacia.</div>}

      {filas.map((fila) => (
        <div className="linea-carta" key={`${fila.printId}-${fila.zone}`}>
          <div className="cantidad">
            <button
              aria-label={`Quitar una copia de ${fila.name}`}
              onClick={() => onCantidad(fila.printId, zone, fila.quantity - 1)}
            >
              -
            </button>
            <span className="valor">{fila.quantity}</span>
            <button
              aria-label={`Anadir una copia de ${fila.name}`}
              onClick={() => onCantidad(fila.printId, zone, fila.quantity + 1)}
            >
              +
            </button>
          </div>

          <div>
            <div>{fila.name}</div>
            <div className="tipo">
              {fila.setCode} {fila.collectorNumber}
              {/* RN-03: se avisa, no se impide. */}
              {fila.owned < fila.quantity && (
                <span className="no-poseida"> · tienes {fila.owned}</span>
              )}
            </div>
          </div>

          <div>
            <button
              onClick={() => onMover(fila.printId, zone, zone === 'side' ? 'main' : 'side')}
            >
              {zone === 'side' ? 'Al mazo' : 'Al Side'}
            </button>
            <button onClick={() => onCantidad(fila.printId, zone, 0)}>Quitar</button>
          </div>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Paso 3: compilar**

```bash
npm run build
```

Esperado: sin salida.

- [ ] **Paso 4: commit**

```bash
git add apps/web/src/components/ && git commit -m "feat(web): add deck search and zone components (T-047)"
```

---

## Tarea 7 — Las dos páginas y las rutas

**Ficheros:**
- Crear: `apps/web/src/pages/Mazos.tsx`
- Crear: `apps/web/src/pages/MazoEditor.tsx`
- Modificar: `apps/web/src/App.tsx`

- [ ] **Paso 1: la lista**

`apps/web/src/pages/Mazos.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameCode } from '@tcg/shared';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

export function Mazos() {
  const { token } = useAuth();
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [game, setGame] = useState<GameCode>('YGO');

  const mazos = useQuery({
    queryKey: ['decks'],
    queryFn: () => api.decks(token!).then((r) => r.data),
    enabled: Boolean(token),
  });

  const crear = useMutation({
    mutationFn: () => api.createDeck(token!, { game, name: nombre.trim() }),
    onSuccess: () => {
      setNombre('');
      void cliente.invalidateQueries({ queryKey: ['decks'] });
    },
  });

  const borrar = useMutation({
    mutationFn: (id: number) => api.deleteDeck(token!, id),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ['decks'] }),
  });

  return (
    <>
      <h1>Mis mazos</h1>
      <p className="subtitulo">
        Un mazo referencia cartas del catalogo, no de tu coleccion: puedes construir lo que
        quieras y ver que te falta.
      </p>

      <div className="filtros">
        <input
          placeholder="Nombre del mazo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <select value={game} onChange={(e) => setGame(e.target.value as GameCode)}>
          <option value="MTG">Magic: The Gathering</option>
          <option value="YGO">Yu-Gi-Oh!</option>
          <option value="PTCG">Pokemon TCG</option>
        </select>
        <button onClick={() => crear.mutate()} disabled={nombre.trim() === '' || crear.isPending}>
          Crear mazo
        </button>
      </div>

      {mazos.isLoading && <div className="vacio">Cargando...</div>}
      {mazos.data?.length === 0 && (
        <div className="vacio">Todavia no tienes mazos. Crea el primero ahi arriba.</div>
      )}

      <div className="mazo-lista">
        {(mazos.data ?? []).map((mazo) => (
          <div className="mazo-fila" key={mazo.id}>
            <div>
              <div className="nombre">
                <Link to={`/mazos/${mazo.id}`}>{mazo.name}</Link>
              </div>
              <div className="meta">
                {mazo.game} · main {mazo.counts.main}
                {mazo.counts.extra > 0 && ` · extra ${mazo.counts.extra}`}
                {mazo.counts.side > 0 && ` · side ${mazo.counts.side}`}
              </div>
            </div>
            <Link to={`/mazos/${mazo.id}`}>Editar</Link>
            <button
              onClick={() => {
                // Borrar arrastra deck_cards por cascada y no tiene vuelta atras.
                if (confirm(`Borrar "${mazo.name}"? No se puede deshacer.`)) borrar.mutate(mazo.id);
              }}
            >
              Borrar
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Paso 2: el editor**

`apps/web/src/pages/MazoEditor.tsx`:

```tsx
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type DeckDetail } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useDeckEditor } from '../lib/use-deck-editor.js';
import { DeckBuscador } from '../components/DeckBuscador.js';
import { DeckZona } from '../components/DeckZona.js';
import { DeckValidacion, zonasDe } from '../components/DeckValidacion.js';

export function MazoEditor() {
  const { id } = useParams();
  const { token } = useAuth();
  const deckId = Number(id);

  const mazo = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => api.deck(token!, deckId).then((r) => r.data),
    enabled: Boolean(token) && Number.isInteger(deckId),
    retry: false,
  });

  if (mazo.isLoading) return <div className="vacio">Cargando el mazo...</div>;
  if (mazo.isError || !mazo.data) {
    // La API responde 404 tanto si no existe como si es de otro usuario (D6).
    return (
      <div className="vacio">
        Este mazo no existe. <Link to="/mazos">Volver a mis mazos</Link>
      </div>
    );
  }

  // `key` remonta el editor al cambiar de mazo, asi el borrador se reinicia sin
  // un efecto de sincronizacion.
  return <Editor key={mazo.data.id} deck={mazo.data} token={token!} />;
}

function Editor({ deck, token }: { deck: DeckDetail; token: string }) {
  const editor = useDeckEditor(deck, token);
  const zonas = zonasDe(deck.game);

  return (
    <>
      <h1>{deck.name}</h1>
      <p className="subtitulo">
        {deck.game} · la validacion se recalcula en tu navegador, sin consultar al servidor.
      </p>

      <DeckValidacion
        validation={editor.validation}
        sucio={editor.sucio}
        guardando={editor.guardando}
        errorGuardado={editor.errorGuardado}
        discrepancia={editor.discrepancia}
        onGuardar={editor.guardar}
      />

      <div className="editor">
        <DeckBuscador game={deck.game} onAnadir={editor.anadir} />

        <div className="editor-columna">
          {zonas.map((z) => (
            <DeckZona
              key={z.zone}
              etiqueta={z.etiqueta}
              objetivo={z.objetivo}
              zone={z.zone}
              draft={editor.draft}
              mal={editor.validation.issues.some((i) => i.zone === z.zone)}
              onCantidad={editor.cambiarCantidad}
              onMover={editor.moverZona}
            />
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Paso 3: rutas y menú**

En `apps/web/src/App.tsx`:

1. Añadir los imports junto a los demás:

```tsx
import { Mazos } from './pages/Mazos.js';
import { MazoEditor } from './pages/MazoEditor.js';
```

2. Añadir la entrada de menú justo después del `NavLink` de `/coleccion`:

```tsx
          <NavLink to="/mazos" className={({ isActive }) => (isActive ? 'activo' : '')}>
            Mis mazos
          </NavLink>
```

3. Añadir las dos rutas justo después de la de `/coleccion`:

```tsx
          <Route path="/mazos" element={<Protegida><Mazos /></Protegida>} />
          <Route path="/mazos/:id" element={<Protegida><MazoEditor /></Protegida>} />
```

- [ ] **Paso 4: compilar y ejecutar la suite**

```bash
npm run build && npm test
```

Esperado: build sin salida y **toda** la suite en verde: 270 de antes + 1 de la tarea 1 + 18 de la
tarea 2 = **289**. Si el numero no cuadra exactamente, lo que importa es que no falle ninguno.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/ && git commit -m "feat(web): add deck list and deck editor pages (T-047)"
```

---

## Tarea 8 — Verificación en navegador real y Vault

- [ ] **Paso 1: levantar el entorno con el código nuevo**

```bash
docker compose up -d --build
docker compose --profile ingest run --rm ingest --game YGO --sets 4 --no-images
```

Esperado: `api` *healthy* y la ingesta con 0 fallidos.

- [ ] **Paso 2: recorrido en el navegador**

Abrir http://localhost:5173, registrarse o acceder, e ir a **Mis mazos**.

1. Crear un mazo de Yu-Gi-Oh!. Aparece en la lista con `main 0`.
2. Abrirlo: la validación dice `Faltan cartas en el mazo principal: hay 0 y el minimo son 40`.
3. Buscar y añadir 40 cartas distintas. La validación pasa a **Mazo valido**.
4. Añadir un `Xyz Effect Monster`: **cae solo en el Extra Deck**, sin que el usuario elija zona.
5. Subir una carta a 4 copias: aparece `aparece 4 veces y el maximo son 3`.
6. Pulsar **Guardar**, recargar la página: el mazo vuelve igual.
7. Borrar el mazo desde la lista: pide confirmación.

- [ ] **Paso 3: la comprobación que justifica la arquitectura**

Con el panel de red abierto y filtrado por `api`:

- Cambiar cantidades con `+` y `-`: **cero peticiones**.
- Añadir una carta ya añadida antes: **cero peticiones** (React Query la tiene cacheada).
- Añadir una carta nueva: **una sola** petición a `/api/cards/:printId`.

Si cambiar una cantidad genera tráfico, D1 no se está cumpliendo y hay que averiguar por qué antes
de dar la tarea por buena.

- [ ] **Paso 4: P-001 en el HTML renderizado**

En la consola del navegador, con el editor abierto:

```js
document.documentElement.outerHTML.match(/https?:\/\/(?!localhost)[^"'\s]+/g)
```

Esperado: `null`. Cualquier resultado es una URL externa que no debería estar ahí.

- [ ] **Paso 5: criterios de aceptación**

```bash
npm run build && npm test && npm audit
```

Esperado: build sin salida, suite en verde, `found 0 vulnerabilities`.

- [ ] **Paso 6: actualizar el Vault**

- `005Registro/2026-08-25_S021_InterfazDeMazos.md` — bitácora: qué se construyó, qué reveló la
  verificación en navegador, y cualquier problema nuevo con su número `P-0##`.
- `001Reportes/Tareas_Realizadas.md` — T-052, T-047a, T-047b, T-047c, T-047v.
- `001Reportes/Tareas_Pendientes.md` — quitar T-047; queda T-048 para cerrar H7.
- `00Master/03_Hitos.md` — H7 con la interfaz hecha; sólo falta import/export.
- `00Master/05_Continuar_Aqui.md` — el siguiente paso natural pasa a ser T-048.
- `Claude.md` y `README.md` — mapa y estado.

- [ ] **Paso 7: commit**

```bash
git add -A && git commit -m "docs(h7): record the deck builder UI session (S021)"
```

---

## Revisión del plan contra el spec

| Requisito del spec | Tarea |
|---|---|
| §2 `oracleKey` y `gameData` en `DECK_CARD` (T-052) | 1 |
| §4 `deck-draft.ts` completo: `zoneFor`, `addCard`, `setQuantity`, `moveZone`, `toDeckEntries`, `toPayload`, `fromDeckDetail` | 2 |
| §5 hook con validación derivada, `sucio` y comparación con el servidor | 3 |
| §6 lista, editor de dos columnas, buscador, zonas, panel de validación | 4, 5, 6, 7 |
| §7 errores: 404, fallo al guardar sin perder el borrador, fallo al pedir el detalle | 6 (buscador), 7 (editor), 3 (hook) |
| §8 tests puros + navegador real + panel de red + P-001 | 2, 8 |
| §9 T-052, T-047a, T-047b, T-047c, T-047v | 1, 2, 3, 5-7, 8 |
| E1–E6 | 2 (E1, E2, E4), 6 (E3, E6), 3 (E5) |

**Sobre el 401:** el spec (§7) pide redirigir a `/acceso` si el token caduca. No hay tarea propia
porque **ya está resuelto**: `Protegida` en `App.tsx` lo hace desde H6, y las dos rutas nuevas van
dentro. Añadir algo aquí sería duplicarlo.
