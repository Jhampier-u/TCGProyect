# 06 — Spec T-047 · Interfaz del constructor de mazos (H7, 2.ª pasada)

**Fecha:** 2026-08-25 · **Sesión:** S021 · **Estado:** aprobado por el usuario, pendiente de plan

Segunda pasada de H7. El backend está hecho y verificado (S020): seis endpoints y el motor de reglas
en `@tcg/shared`. Esto es la pantalla. **El import/export (T-048) queda fuera.**

---

## 1. Qué se construye

| Pieza | Dónde | Qué hace |
|---|---|---|
| Borrador del mazo | `apps/web/src/lib/deck-draft.ts` | Estado y operaciones del mazo en edición. **Puro, sin React** |
| Enganche de React | `apps/web/src/lib/use-deck-editor.ts` | Envuelve el borrador y deriva la validación |
| Lista de mazos | `apps/web/src/pages/Mazos.tsx` | Listar, crear y borrar |
| Editor | `apps/web/src/pages/MazoEditor.tsx` | Las dos columnas |
| Buscador del editor | `apps/web/src/components/DeckBuscador.tsx` | Búsqueda compacta con botón de añadir |
| Zonas del mazo | `apps/web/src/components/DeckZona.tsx` | Una zona con sus cartas y sus controles |
| Panel de validación | `apps/web/src/components/DeckValidacion.tsx` | Conteos y problemas traducidos |
| Cliente de API | `apps/web/src/lib/api.ts` | Seis métodos de mazos + `card(printId)` |
| **Esquema de la API** | `apps/api/src/api/deck-schemas.ts` | Declarar `oracleKey` y `gameData` |

---

## 2. Un hueco de S020 que hay que tapar primero

**D1 del spec de H7 dice que el frontend revalida sin ir al servidor. Hoy no puede.**

Para llamar a `validateDeck` hace falta, por carta: `oracleKey` (para agrupar copias), `typeLine`
(zona de Yu-Gi-Oh! y tierra básica de Magic) y `gameData` (banlist de Yu-Gi-Oh! y Energía Básica de
Pokémon).

`GET /api/decks/:id` devuelve `typeLine`, pero **no** `oracleKey` ni `gameData`: el esquema
`DECK_CARD` que se escribió en T-046 no los declara, aunque `DeckRepository` ya los produce. Es un
descuido de S020, de la misma familia que P-024 — el esquema y el repositorio dicen cosas distintas.

**Se corrige aquí:** añadir `oracleKey` y `gameData` a `DECK_CARD`.

`gameData` viaja igual que en `CARD_DETAIL` desde H3 (`type: 'object'`, `additionalProperties: true`).
No abre el agujero de P-001 porque **los adaptadores construyen `gameData` con lista blanca** y
ninguno de los tres perfiles contiene una URL: MTG lleva coste, colores y legalidades; YGO atributo,
raza, arquetipo y banlist; PTCG supertipo, subtipos, ataques y debilidades. El test de "ninguna URL
externa" de las rutas de mazos lo seguirá cubriendo.

---

## 3. Decisiones cerradas

| # | Decisión | Motivo |
|---|---|---|
| E1 | El borrador vive en un **módulo puro** sin React | Los tests de este frontend son de lógica pura (`PackReveal.test.ts`) y **no hay entorno DOM configurado en Vitest**. La lógica dentro del componente sería intestable |
| E2 | **El motor decide la zona** al añadir | Un Xyz en el Main Deck no es una preferencia, es un error. El predicado `isYgoExtraDeckCard` ya está escrito y medido contra el catálogo real |
| E3 | Buscador **propio y compacto** en el editor | Construir un mazo es buscar por nombre, no explorar. El Catálogo de H5 no se toca |
| E4 | `oracleKey` del cliente = `String(cardId)` | Dos impresiones de la misma carta comparten `cardId`: es exactamente la identidad que pide RN-04. Sólo es posible desde que P-024 se corrigió |
| E5 | Guardado **explícito**, no automático | D5 del spec de H7: el `PUT` reemplaza el contenido entero. El editor guarda cuando el usuario lo decide |
| E6 | Al añadir se pide el **detalle** de la carta | `GET /api/cards` no trae `gameData`. Meterlo en el listado engordaría cada página del catálogo; pedir el detalle una vez por carta lo cachea React Query y las cartas son inmutables |

---

## 4. `deck-draft.ts` — el borrador

```ts
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
  /** Copias que el usuario posee. Informativo (RN-03). */
  owned: number;
}

export interface DraftEntry extends DraftCard {
  zone: DeckZone;
  quantity: number;
}

export type Draft = readonly DraftEntry[];

/** Zona que le corresponde a una carta. La regla manda, no el usuario (E2). */
export function zoneFor(game: GameCode, typeLine: string | null): DeckZone;

/** Anade una copia. Si la carta ya esta en su zona, incrementa. */
export function addCard(draft: Draft, card: DraftCard, game: GameCode): Draft;

/** n <= 0 elimina la fila. Tope 99: es el CHECK de deck_cards. */
export function setQuantity(draft: Draft, printId: number, zone: DeckZone, n: number): Draft;

/** Mueve una fila de zona, fusionando si la destino ya tenia esa impresion. */
export function moveZone(draft: Draft, printId: number, from: DeckZone, to: DeckZone): Draft;

/** Entrada del motor de reglas. `oracleKey` sale de `cardId` (E4). */
export function toDeckEntries(draft: Draft): DeckEntry[];

/** Cuerpo de PUT /api/decks/:id/cards. */
export function toPayload(draft: Draft): Array<{ printId: number; zone: DeckZone; quantity: number }>;

/**
 * Reconstruye el borrador a partir de lo que devuelve GET /api/decks/:id.
 * `DeckCard` es el tipo del cliente, declarado en `apps/web/src/lib/api.ts`, y
 * lleva los mismos campos que `DraftEntry`.
 */
export function fromDeckDetail(cards: readonly DeckCard[]): Draft;
```

Todas devuelven un borrador **nuevo**: nada muta en el sitio, para que React vea el cambio y para que
los tests comparen valores.

`zoneFor` sólo tiene una regla real: en Yu-Gi-Oh!, `isYgoExtraDeckCard(typeLine)` → `extra`. En Magic
y Pokémon devuelve siempre `main`. No se inventa nada que el motor no sepa.

---

## 5. `use-deck-editor.ts` — el enganche

Envuelve el borrador con `useState` y expone las operaciones ya ligadas. Deriva dos cosas con
`useMemo`:

- `validation = validateDeck(game, toDeckEntries(draft))` — se recalcula en cada cambio, **sin red**.
- `sucio` — si el borrador difiere del último guardado. Es lo que enciende el botón de guardar.

Guardar es una mutación de React Query contra `PUT /api/decks/:id/cards`. La respuesta trae la
validación del servidor; si difiere de la del cliente, **manda la del servidor** y se muestra esa. No
debería pasar nunca —es el mismo motor— y precisamente por eso conviene que se vea si pasa.

---

## 6. Pantallas

### `/mazos` — lista

Los mazos del usuario: nombre, juego, conteos por zona, fecha, y un distintivo de válido o con
problemas. Crear pide nombre y juego. Borrar **pide confirmación**, porque `deck_cards` cae por
cascada y no hay vuelta atrás.

Vacío: un texto que explica que aún no hay mazos y un botón de crear.

### `/mazos/:id` — editor

Dos columnas. En pantalla estrecha se apilan, buscador primero.

**Izquierda — buscador.** Caja de texto (con retardo para no consultar en cada tecla), filtro por set
del juego del mazo, y los resultados en filas compactas: miniatura, nombre, `type_line`, set y
número, y un botón de añadir. El juego **no** es seleccionable: lo fija el mazo. Es lo que impide
mandar un `game_mismatch` al servidor.

**Derecha — el mazo.** Una sección por zona con cartas, y para cada una: cantidad con `-` y `+`, un
control para mandarla al Side (y de vuelta), y otro para quitarla. Las cartas que no posees llevan un
distintivo tenue con las copias que tienes. Informativo, nunca un impedimento (RN-03).

**Arriba — validación.** Los conteos por zona con su objetivo (`40/40–60`, `12/15`) y la lista de
problemas. Los `DeckIssueCode` se traducen en el cliente con un mapa; el `message` que llega del
servidor es respaldo, no la fuente. Y el botón **Guardar**, activo sólo si hay cambios.

---

## 7. Errores

| Situación | Qué ve el usuario |
|---|---|
| Mazo inexistente o ajeno (404) | "Este mazo no existe" y enlace a la lista |
| Token caducado (401) | Redirección a `/acceso`, como ya hace `Protegida` |
| Fallo al guardar (500, red caída) | Aviso; **el borrador NO se pierde** y se puede reintentar |
| Fallo al pedir el detalle de una carta | La carta no se añade y se avisa; el borrador queda intacto |

Un mazo inválido **no** es un error: es el estado normal mientras se construye (D2).

---

## 8. Verificación

**Tests de `deck-draft.ts`** — puros, sin DOM:

- Un `Xyz Effect Monster` cae en `extra`; un `Ritual Effect Monster`, en `main`; en Magic y Pokémon
  todo cae en `main`.
- Añadir dos veces la misma impresión incrementa en vez de duplicar la fila.
- Dos impresiones distintas de la misma carta producen **un solo** `oracleKey` en `toDeckEntries`.
- `setQuantity(0)` elimina la fila; `setQuantity(200)` la deja en 99.
- `moveZone` fusiona si la zona destino ya tenía esa impresión.
- `toPayload` no emite cantidades fuera de 1–99 ni filas duplicadas de `(printId, zone)`.
- `fromDeckDetail` seguido de `toPayload` devuelve lo mismo que entró (ida y vuelta).

**En navegador real**, con el entorno de Docker levantado:

1. Crear un mazo de Yu-Gi-Oh! desde `/mazos`.
2. Añadir 40 cartas y ver la validación pasar de `main_too_small` a válida.
3. **Comprobar en el panel de red que añadir una carta ya cacheada no genera ninguna petición**, y
   que cambiar cantidades no genera ninguna. Es la prueba de que D1 se cumple.
4. Añadir un Xyz y ver que cae en el Extra Deck solo.
5. Guardar, recargar la página y comprobar que el mazo vuelve igual.
6. Comprobar que el HTML renderizado no contiene ninguna URL externa (P-001).

**Criterios de aceptación:** `tsc --build` limpio, toda la suite en verde, `npm audit` limpio.

---

## 9. Tareas

| ID | Tarea | Agente |
|---|---|---|
| T-052 | Declarar `oracleKey` y `gameData` en `DECK_CARD` | Backend |
| T-047a | `deck-draft.ts` y sus tests | Frontend |
| T-047b | Cliente de API de mazos y `use-deck-editor` | Frontend |
| T-047c | Pantallas: lista, editor, buscador, zonas y validación | Frontend |
| T-047v | Verificación en navegador real | QA |

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| La validación del cliente y la del servidor divergen | Es el **mismo módulo** de `@tcg/shared`. Al guardar se compara y se muestra la del servidor si difieren |
| Pedir el detalle por carta añade latencia al primer clic | React Query lo cachea y las cartas son inmutables: sólo la primera vez |
| El editor crece hasta ser un fichero enorme | La lógica está fuera, en `deck-draft.ts`; las tres piezas visuales son componentes aparte |
| `gameData` en la respuesta del mazo podría filtrar algo | Los adaptadores lo construyen con lista blanca; ninguno de los tres perfiles lleva URL. El test de "ninguna URL externa" cubre la ruta |
