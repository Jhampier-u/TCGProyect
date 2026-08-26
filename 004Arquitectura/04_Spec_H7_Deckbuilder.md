# 04 — Spec H7 · Constructor de mazos (1.ª pasada: backend)

**Fecha:** 2026-08-25 · **Sesión:** S020 · **Estado:** aprobado por el usuario, pendiente de plan

Este documento especifica la **primera pasada** de H7. La interfaz de construcción y el
import/export quedan fuera y se abordarán después, cada una con su propia pasada.

---

## 1. Qué se construye

| Pieza | Dónde | Qué hace |
|---|---|---|
| Motor de reglas | `packages/shared/src/deck-rules/` | Valida un mazo contra RN-04. Puro, sin base de datos |
| Capa de datos | `apps/api/src/db/deck-repository.ts` | CRUD de `decks` y `deck_cards` en SQL plano |
| API | `apps/api/src/api/deck-routes.ts` | 6 endpoints autenticados con esquema de entrada y salida |

**Fuera de esta pasada:** interfaz del constructor, import/export, formatos de torneo,
legalidad por formato, Commander.

**El esquema ya existe.** `decks` y `deck_cards` están en la migración `0001` desde S002 y no se
han usado nunca. **No hace falta ninguna migración nueva**, y eso es deliberado: las migraciones
publicadas son inmutables.

---

## 2. Decisiones cerradas

| # | Decisión | Motivo |
|---|---|---|
| D1 | El motor de reglas vive en `@tcg/shared`, no en la API | Es el contrato de dominio que ya comparten API y frontend. Cuando llegue el constructor, revalidará en cada carta añadida **sin ir al servidor**, y el backend seguirá validando por su cuenta al guardar. Una implementación, dos consumidores |
| D2 | Guardar **nunca** se bloquea por validación | Un mazo de 60 cartas pasa por 59 estados inválidos antes de estar completo. La validación es un informe que viaja con el mazo, no un portero. Mismo espíritu que RN-03 |
| D3 | Las copias se cuentan por `cards.oracle_key`, no por `card_print_id` | `deck_cards` referencia impresiones: cuatro impresiones de la misma carta son cuatro filas y **una sola carta** a efectos de RN-04 |
| D4 | La validación **se deriva, no se persiste** | Un dato derivado que se guarda es un dato que se queda obsoleto en cuanto cambia la banlist ingestada |
| D5 | El contenido se reemplaza entero (`PUT`), no se parchea carta a carta | Idempotente y transaccional; imposible dejar el mazo a medias. El editor mantiene el mazo en memoria y guarda cuando el usuario lo decide |
| D6 | Un mazo ajeno responde **404**, no 403 | Decir "existe pero no es tuyo" convierte la API en un enumerador de identificadores. Es la misma razón por la que el login no distingue correo inexistente de contraseña incorrecta (ADR-008) |
| D7 | `decks.format` se guarda pero **no se valida** | RN-04 no lo pide y los formatos de torneo están fuera del alcance v1.0 |

---

## 3. Motor de reglas

### 3.1 Contrato

El validador **no consulta nada**. Recibe el mazo ya resuelto y devuelve un informe.

```ts
// packages/shared/src/deck-rules/types.ts

export type DeckZone = 'main' | 'extra' | 'side' | 'commander';

/** Una carta del mazo, con lo justo que las reglas necesitan. */
export interface DeckEntry<G extends GameCode = GameCode> {
  oracleKey: string;
  name: string;
  typeLine: string | null;
  gameData: GameDataByGame[G];
  zone: DeckZone;
  quantity: number;
}

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
  /** Carta implicada, si la hay. Los problemas de tamano no la llevan. */
  oracleKey?: string;
  cardName?: string;
  zone?: DeckZone;
  /** Contexto numerico: cuantas hay y cuantas se permiten. */
  actual?: number;
  allowed?: number;
}

export interface DeckValidation {
  valid: boolean;
  counts: Record<DeckZone, number>;
  issues: DeckIssue[];
}

export interface DeckValidator<G extends GameCode> {
  readonly game: G;
  validate(entries: readonly DeckEntry<G>[]): DeckValidation;
}
```

`DeckIssueCode` es un **código estable**, no un texto. La interfaz tendrá que agrupar problemas y
traducirlos; una comparación de cadenas en español sería frágil e intraducible.

`validateDeck(game, entries)` es la única función pública: resuelve la estrategia por `game` y
delega. El registro de estrategias es un `Record<GameCode, DeckValidator<...>>`, igual que
`GameAdapter` (ADR-003).

### 3.2 Reglas por juego

Las tres salen literalmente de RN-04 en `00Master/01_Producto.md`.

**MTG** — `packages/shared/src/deck-rules/mtg.ts`

- `main >= 60`, sin máximo.
- `side <= 15`.
- Máximo **4 copias por `oracleKey`**, sumando `main` + `side`. Es como cuenta Magic: el
  sideboard no es un mazo aparte a efectos del límite de copias.
- **Excepción: cartas con el supertipo `Basic`.** Sin límite.
- Zonas admitidas: `main`, `side`. `extra` y `commander` → `unsupported_zone`.

**YGO** — `packages/shared/src/deck-rules/ygo.ts`

- `main` entre 40 y 60. `extra <= 15`. `side <= 15`.
- Máximo **3 copias por `oracleKey`**, sumando las tres zonas.
- La banlist reduce ese máximo: `Banned` → 0, `Limited` → 1, `Semi-Limited` → 2.
- **Clasificación de zona**: una carta de Extra Deck en `main` (o al revés) es `wrong_zone`. No es
  una preferencia del usuario: es una regla del juego.
- Zonas admitidas: `main`, `extra`, `side`. `commander` → `unsupported_zone`.

**PTCG** — `packages/shared/src/deck-rules/ptcg.ts`

- `main` **exactamente 60**. Ni 59 ni 61.
- `side` no se usa: cualquier carta en `side` → `unsupported_zone`.
- Máximo **4 copias por `oracleKey`**.
- **Excepción: Energía Básica.** Sin límite.
- Zonas admitidas: `main`.

### 3.3 De dónde sale cada dato — y las cuatro trampas

Esto es lo que hay que leer con atención.

**Las dos trampas de Yu-Gi-Oh! están medidas contra los datos ingestados** (`SELECT DISTINCT
type_line` sobre el catálogo real, y la lectura del propio adaptador). Las de MTG y PTCG **no**: hoy
no hay cartas de esos juegos en la base de esta máquina, y salen del formato documentado de Scryfall
y de la API de Pokémon. La verificación de 6 **debe confirmarlas contra datos reales** antes de dar
la tarea por buena; si el dato no coincide, manda el dato.

| Predicado | Derivación | Trampa |
|---|---|---|
| MTG: ¿tierra básica? | Los **supertipos** del `type_line` (lo que hay antes del guion largo) contienen `Basic` | `Basic Snow Land — Forest` **no contiene** la cadena `Basic Land`. Un `includes('Basic Land')` limitaría las tierras nevadas a 4 copias, que es incorrecto. El predicado es el supertipo `Basic`, no la subcadena |
| YGO: ¿Extra Deck? | El `type_line` contiene, como palabra, `Fusion`, `Synchro`, `Xyz` o `Link` | En los datos reales pone **`Xyz Effect Monster`**, no `XYZ`. La comparación es **insensible a mayúsculas**. Un `includes('XYZ')` dejaría los Xyz en el Main Deck sin un solo error. `Ritual` **no** es Extra Deck; `Fusion Pendulum Effect Monster` **sí** |
| YGO: ¿restringida? | `game_data.banlist_info.ban_tcg` | El adaptador **omite el campo cuando viene vacío**: sólo las cartas restringidas lo llevan. **Ausencia significa 3 copias, no "desconocido".** Se usa `ban_tcg`, no `ban_ocg` ni `ban_goat` |
| PTCG: ¿Energía Básica? | `supertype === 'Energy'` **y** `subtypes` incluye `Basic` | `supertype === 'Energy'` a secas incluiría las Energías Especiales, que **sí** están limitadas a 4 |

La banlist es el **snapshot ingestado**, nunca una consulta en vivo (RN-05). Si la banlist oficial
cambia, la corrección es reingestar, no llamar a YGOPRODeck durante la petición de un usuario.

El separador del `type_line` es un **guion largo**, no un guion normal, y el código fuente se
mantiene en ASCII puro: se construye con `String.fromCharCode`, nunca como literal. El troceo
tolera además que no haya separador (`Instant`, `Continuous Spell`): en ese caso el `type_line`
entero son los tipos y no hay supertipos.

### 3.4 Tests

Tabla de casos por juego, con estos obligatorios porque cada uno corresponde a un problema real ya
registrado en `003Problemas/`:

- La misma carta en **dos impresiones distintas** (dos `card_print_id`, un `oracleKey`): cuenta
  como una sola a efectos de copias. Es la familia de P-009/P-010/P-013/P-015/P-017.
- `Basic Snow Land — Forest` admite más de 4 copias.
- `Xyz Effect Monster` se clasifica como Extra Deck; `Ritual Effect Monster`, no.
- Carta con `ban_tcg: 'Limited'`: la segunda copia genera `banned_card`.
- Carta **sin** `banlist_info`: 3 copias son válidas.
- Energía Especial: limitada a 4. Energía Básica: ilimitada.
- Mazo vacío: inválido, con el problema de tamaño, **sin lanzar excepción**.

---

## 4. Capa de datos

`apps/api/src/db/deck-repository.ts`, SQL plano sobre `mysql2` (ADR-006).

```ts
listByUser(userId, game?): Promise<DeckSummary[]>
findById(deckId, userId): Promise<DeckDetail | null>
create(userId, input): Promise<DeckSummary>
updateHeader(deckId, userId, patch): Promise<DeckSummary | null>
replaceCards(deckId, userId, entries): Promise<boolean>
remove(deckId, userId): Promise<boolean>
```

**Toda operación lleva `userId` en el `WHERE`.** No se lee primero y se comprueba después: la
pertenencia es parte de la consulta. Un `findById` que devuelva el mazo y deje la comprobación a la
capa de arriba es una fuga esperando a que alguien olvide el `if`.

**`replaceCards` va en una transacción**: `DELETE` de las filas del mazo, inserción por lotes de las
nuevas. Sin transacción, un fallo a mitad deja el mazo vacío. `Database.transaction()` ya existe.
Devuelve `false` si el mazo no existe o no es del usuario, para que la ruta responda 404 sin una
consulta previa.

**`findById` resuelve el mazo en una consulta**, no en N+1:

- `JOIN cards` para `name`, `type_line`, `game_data` y `oracle_key` — lo que el validador necesita.
- `JOIN card_prints` y `sets` para lo que la interfaz necesita pintar.
- `LEFT JOIN user_collection` para las copias poseídas (RN-03). `LEFT`, no `INNER`: una carta que no
  posees debe aparecer con 0, no desaparecer.

---

## 5. API

`apps/api/src/api/deck-routes.ts` + `deck-schemas.ts`. Todos los endpoints exigen JWT y todos
declaran esquema de entrada **y de salida**: la serialización por esquema de Fastify es lo que hace
cumplir P-001 (ADR-007).

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/api/decks` | Lista de mazos del usuario, con conteos por zona |
| `POST` | `/api/decks` | Crea un mazo vacío |
| `GET` | `/api/decks/:id` | Contenido + validación + copias poseídas |
| `PATCH` | `/api/decks/:id` | Cabecera: nombre, descripción, formato, público |
| `PUT` | `/api/decks/:id/cards` | Reemplaza el contenido; devuelve la validación recalculada |
| `DELETE` | `/api/decks/:id` | Borra. `deck_cards` cae por `ON DELETE CASCADE` |

**Ninguna respuesta expone una URL externa.** Las cartas de un mazo viajan con `imagePath`, la ruta
relativa de nuestro almacén, exactamente como en el catálogo y la colección. `sets.icon_url` **no se
expone** (P-022, sigue abierto como T-035).

Códigos de error:

| Situación | Respuesta |
|---|---|
| Token ausente o inválido | `401 unauthorized` |
| Mazo inexistente **o ajeno** | `404 not_found` (D6) |
| `card_print_id` de otro juego que el mazo | `422 game_mismatch` |
| `card_print_id` inexistente | `422 unknown_print` |
| Cuerpo malformado | `400`, del esquema de Fastify |

Un mazo con problemas de validación responde **200**, con `validation.valid: false` (D2).

El tope de cartas por `PUT` se acota en el esquema (`maxItems`), para que un cuerpo enorme se
rechace antes de tocar la base de datos.

---

## 6. Verificación

Nada se da por bueno sin ejecutarlo. Dos niveles:

**Tests** — los de tabla del motor (3.4), más los de repositorio y rutas con dobles, incluyendo:
mazo ajeno → 404; carta de otro juego → 422; `PUT` vacío deja el mazo vacío sin borrarlo.

**Recorrido completo contra MySQL real**, con cartas ingestadas de verdad:

1. Registrar usuario, crear mazo de YGO.
2. `PUT` con 40 cartas: la validación pasa de `main_too_small` a válida.
3. Meter un `Xyz Effect Monster` en `main`: aparece `wrong_zone`.
4. Cuatro copias de la misma carta: aparece `too_many_copies`.
5. La misma carta en dos impresiones distintas: **cuenta como una**.
6. Un segundo usuario pide el mazo del primero: **404**.
7. Borrar el mazo: `deck_cards` desaparece por cascada.
8. **Confirmar los predicados de MTG y PTCG contra datos reales**: ingestar unos sets y comprobar
   que el `type_line` de una tierra básica y de una nevada, y el `supertype`/`subtypes` de una
   Energía Básica y una Especial, son los que 3.3 supone.

Criterios de aceptación: `tsc --build` limpio, toda la suite en verde, `npm audit` limpio, y
**ninguna respuesta con `http` en el cuerpo** (la comprobación que P-022 dejó como norma).

---

## 7. Tareas

| ID | Tarea | Agente |
|---|---|---|
| T-044 | Motor de validación de mazos en `@tcg/shared`: contrato + 3 estrategias | Backend / Arquitectura |
| T-045 | `DeckRepository`: CRUD y reemplazo transaccional del contenido | Base de Datos |
| T-046 | Rutas de mazos: 6 endpoints autenticados con esquema de entrada y salida | Backend |
| T-046v | Verificación extremo a extremo contra MySQL real | QA / Seguridad |

Siguientes pasadas de H7, fuera de este spec:

| ID | Tarea |
|---|---|
| T-047 | Interfaz del constructor de mazos (revalidación en cliente con el mismo motor) |
| T-048 | Import/export en los formatos de texto de cada juego |

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Las trampas de 3.3 son silenciosas: fallan sin error | Cada una tiene un test nominal en 3.4, escrito **antes** que la implementación |
| El catálogo local puede no tener cartas suficientes de un juego para armar un mazo válido en la verificación | La verificación ingesta lo que necesite antes de empezar; 40 cartas de YGO son alcanzables con pocos sets |
| `game_data` llega tipado como la unión de los tres perfiles | El validador se tipa por juego (`DeckEntry<G>`), como ya hace `GameAdapter<G>` |
