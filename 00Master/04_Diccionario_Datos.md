# 04 — Diccionario de Datos (modelo unificado)

> Principio rector: **lo común se normaliza en columnas; lo específico de cada juego vive en
> `game_data JSON`.** Nunca añadir una columna que sólo aplique a un juego.

> **SINCRONIZADO CON EL DDL** — `db/migrations/0001_initial_schema.up.sql`, verificado contra
> MySQL 8.0.42 el 2026-08-25. Este documento describe **13 tablas** (una versión previa decía
> "11 entidades": era un recuento erróneo, no un cambio de alcance).
>
> Cambios aplicados al implementar T-006:
> - `cards.text` → **`cards.rules_text`**. `text` es ambiguo frente al tipo de dato homónimo.
> - `pack_openings` gana **`template_snapshot JSON`** — imprescindible para RN-01 (ver P-005).
> - `pack_templates` gana `set_key` y `default_guard`, columnas generadas **VIRTUAL** cuyo único
>   fin es hacer cumplir "un solo default por (juego, set)" mediante un UNIQUE.
> - Las columnas generadas numéricas llevan una guarda `JSON_TYPE` (ver más abajo).

## Entidades

### `games`
Catálogo fijo de los 3 juegos. Seed inmutable.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | TINYINT UNSIGNED PK | 1=MTG, 2=YGO, 3=PTCG |
| `code` | VARCHAR(8) UNIQUE | `MTG`, `YGO`, `PTCG` |
| `name` | VARCHAR(64) | Nombre mostrable |
| `source_api` | VARCHAR(32) | `scryfall`, `ygoprodeck`, `pokemontcg` |

### `sets`
Una expansión/colección. Existe en los 3 juegos.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `game_id` | TINYINT UNSIGNED FK | |
| `external_id` | VARCHAR(64) | id nativo de la API (`dsk`, `base1`, o setcode YGO) |
| `code` | VARCHAR(16) | Código corto mostrable |
| `name` | VARCHAR(160) | |
| `released_at` | DATE NULL | |
| `card_count` | INT UNSIGNED | Declarado por la API |
| `icon_url` | VARCHAR(512) NULL | URL del **origen**. Sólo para la descarga inicial: no sale de la API (P-022) |
| `icon_local_path` | VARCHAR(255) NULL | **Ruta propia** del icono cosechado. Es la única que se sirve, como `iconPath` (migración 0008, T-035) |
| `icon_fail_count` | SMALLINT UNSIGNED DEFAULT 0 | Intentos fallidos. Al agotarlos deja de reintentarse, igual que en `card_prints` (T-019) |
| `icon_failed_at` | TIMESTAMP NULL | Cuándo falló la última vez |
| **UNIQUE** | `(game_id, external_id)` | Clave natural de deduplicación |

### `cards`
La carta **conceptual** (el "oráculo"): un nombre y sus reglas, independiente de la impresión.
Necesaria porque las reglas de mazo (máx. 4 copias) se aplican **por nombre**, no por impresión.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `game_id` | TINYINT UNSIGNED FK | |
| `oracle_key` | VARCHAR(64) | `oracle_id` (MTG), `id` numérico (YGO), **`id` de impresión (PTCG)** — ver la corrección abajo |
| `name` | VARCHAR(255) | |
| `type_line` | VARCHAR(255) NULL | Texto de tipo crudo del juego |
| `text` | TEXT NULL | Texto de reglas |
| `game_data` | JSON | Ver "Perfiles JSON" abajo |
| **UNIQUE** | `(game_id, oracle_key)` | |

### `card_prints`
La **impresión física** en un set concreto. Es lo que un sobre entrega.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `card_id` | BIGINT UNSIGNED FK | |
| `set_id` | BIGINT UNSIGNED FK | |
| `external_id` | VARCHAR(64) | id de impresión en la API de origen |
| `collector_number` | VARCHAR(16) | |
| `rarity_id` | SMALLINT UNSIGNED FK | |
| `image_local_path` | VARCHAR(512) NULL | **Ruta propia**, no URL externa (ver P-001) |
| `image_fail_count` | SMALLINT UNSIGNED DEFAULT 0 | Intentos fallidos. Una URL rota deja de reintentarse en cada ejecución (migración 0007, T-019) |
| `image_failed_at` | TIMESTAMP NULL | Cuándo falló la última vez |
| `image_source_url` | VARCHAR(512) NULL | Sólo para la descarga inicial |
| `finishes` | JSON | `["nonfoil","foil"]`, `["normal","reverse"]`, etc. |
| `in_boosters` | TINYINT(1) DEFAULT 1 | Si la impresión puede salir de un sobre. **El motor de sobres filtra por aquí** (P-014, migración 0004) |
| `withdrawn_at` | TIMESTAMP NULL | Cuándo el origen dejó de listar esta impresión (migración 0024, T-083). No se borra si una apertura, una colección o un mazo la referencian (P-005): se **retira**, y sale del pool, de la búsqueda y del recuento de completitud |
| **UNIQUE** | `(set_id, external_id)` | |
| **ÍNDICE** | `idx_prints_pool (set_id, rarity_id, in_boosters, withdrawn_at, id)` | Covering para la precarga del pool. La 0024 lo rehízo para meter `withdrawn_at`: es la consulta más caliente del sobre |

### `rarities`
Rareza **por juego** — no son intercambiables entre juegos.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | SMALLINT UNSIGNED PK | |
| `game_id` | TINYINT UNSIGNED FK | |
| `code` | VARCHAR(48) | `common`, `mythic`, `secret_rare`, `illustration_rare`… (48, no 32: YGO tiene nombres larguísimos) |
| `label` | VARCHAR(64) | |
| `tier` | TINYINT | Orden de escasez, 1 = más común |
| **UNIQUE** | `(game_id, code)` | |

### `pack_templates` / `pack_slots`
El corazón del simulador. **Datos, no código.** Un sobre = N *slots*; cada slot = una tabla de
probabilidad sobre rarezas.

`pack_templates`: `id`, `set_id` (NULL = no es de un set concreto), `game_id`, `valid_from DATE NULL`,
`valid_to DATE NULL`, `name` (`"Play Booster"`, `"Core Booster (hasta Light of Destruction)"`),
`card_count`, `is_default`.

`pack_slots`: `id`, `pack_template_id`, `slot_index`, `distribution JSON`, `foil_chance DECIMAL(6,5)`,
`card_filter VARCHAR(32) NULL`.

`distribution` es un array de pesos:
```json
[{"rarity":"rare","weight":865},{"rarity":"mythic","weight":135}]
```

**Una entrada puede sacar la carta de OTRO set** (migración 0026, T-085). En vez de `rarity` lleva
`set`, con el `sets.code` del set de origen, y las dos claves son excluyentes:

```json
[{"rarity":"common","weight":875},{"set":"plst","weight":125}]
```

Existe por *The List* de Magic: uno de cada ocho Play Booster trae en su séptimo cartón una carta de
un set aparte, y el motor sólo sabía elegir dentro del pool `(set_id, rarity_id)` del set que se abre.
El reparto dentro del set de origen es **uniforme sobre sus impresiones**, no sobre sus rarezas:
repartir a partes iguales entre rarezas dispares inventaría una escasez que no existe. La rareza que
se registra es la real de la carta entregada, como siempre (RN-01).

**`card_filter` restringe los candidatos por tipo de carta** (misma migración). Hoy admite un único
valor, `basic_land`, y es una **lista cerrada por CHECK** a propósito: un filtro libre con una errata
no casaría con nada, vaciaría el slot y el respaldo lo taparía entregando otra carta, sin un solo
error. Con el CHECK, la errata falla al migrar.

Existe por el slot de tierra de Magic: las tierras básicas son rareza `common` en Scryfall, así que un
slot que pide `common` entregaba cualquier común. Si el set no tiene tierras básicas en el sobre —58
de los 135 sets de Magic con slot de tierra— el motor **abre la mano**, entrega una común sin filtrar
y avisa; un slot vacío sería un sobre con una carta menos. Esos 58 salen por su nombre en
`npm run packs:cobertura`.

**La ventana de vigencia (migración 0009, T-034).** `valid_from` / `valid_to` acotan las
fechas de salida que una plantilla describe. `findTemplate` resuelve en tres niveles:

| Nivel | Condición |
|---|---|
| 1 | La plantilla propia del set (`set_id = s.id`) |
| 2 | La de su **línea de producto** (`product_line`, T-080) |
| 3 | La de la **época** cuya ventana contiene `sets.released_at` |
| 4 | La genérica del juego (todo a NULL, `is_default = 1`) |

**La línea va antes que la época** porque es más específica: un *Gold Series* de 2010 es antes un
Gold Series que un sobre de 2010. Y las líneas **no se pueden expresar como ventanas**: Gold Series
(2008-2021), Battle Pack (2012-2026) y Mega Pack (2014-2025) se solapan entre sí y con los Core
Booster de esos mismos años. Ése es exactamente el motivo de que este nivel exista.

Un NULL en cualquiera de las dos fechas significa **sin límite por ese lado**; las dos a NULL
significan que la plantilla no es de época. Las de época llevan `is_default = 0` porque
`uq_templates_one_default` sólo admite una marcada por (juego, set).

Un set sin `released_at` cae al nivel 3: sin fecha no hay época.

**Toda rareza del pool debe estar nombrada por alguna slot.** Si no, es inalcanzable: el respaldo del
motor sólo actúa cuando la rareza *pedida* está vacía, nunca añade una que nadie pidió. Eso puso
techo a la completitud de los sets de Yu-Gi-Oh! durante trece sesiones (P-021) y sigue afectando a
Pokémon (P-034). `npm run packs:cobertura` lo mide.

### `users`, `user_collection`, `decks`, `deck_cards`, `pack_openings`, `pack_opening_cards`
- `user_collection`: `(user_id, card_print_id, finish)` UNIQUE + `quantity`. Nunca borra filas, ajusta cantidad.
- `pack_openings`: `id`, `user_id`, `pack_template_id`, `seed CHAR(32)`, `opened_at`. Cumple **RN-01**.
- `deck_cards`: `deck_id`, `card_print_id`, `quantity`, `zone` ENUM(`main`,`extra`,`side`,`commander`).

## Corrección de la clave conceptual de Pokémon (P-015, S009)

Este documento decía originalmente que para PTCG `oracle_key` sería el **nombre normalizado**.
**Es incorrecto y se descartó al implementar T-013.** En el set `sv1` hay 258 cartas y sólo 175
nombres: `Tarountula` sv1-16 (40 PS, "String Haul") y sv1-18 (60 PS, "Surprise Attack") son cartas
distintas homónimas. Con clave por nombre se habrían perdido 83 cartas en un solo set.

Se usa el **`id` de la API** (`sv1-16`). Para PTCG, `cards` y `card_prints` quedan 1:1, que es lo que
el origen realmente soporta. La regla de mazo "máximo 4 por nombre" (RN-04) no se ve afectada: el
validador agrupa por `cards.name`.

## Perfiles JSON de `cards.game_data`

| Juego | Claves |
|---|---|
| **MTG** | `mana_cost`, `cmc`, `colors[]`, `color_identity[]`, `power`, `toughness`, `loyalty`, `keywords[]`, `legalities{}` |
| **YGO** | `attribute`, `race`, `level`, `rank`, `link_val`, `link_markers[]`, `atk`, `def`, `scale`, `banlist_info{}` |
| **PTCG** | `supertype`, `subtypes[]`, `hp`, `types[]`, `evolves_from`, `attacks[]`, `weaknesses[]`, `retreat_cost[]`, `regulation_mark` |

## Columnas generadas: la guarda de tipo es obligatoria

Un `CAST` directo **rompe la ingesta de Yu-Gi-Oh!**: cartas como *Slifer the Sky Dragon* traen
`"atk": "?"`, y en modo estricto el truncado aborta el INSERT. La forma correcta, ya en el DDL:

```sql
atk INT GENERATED ALWAYS AS (
  CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data,'$.atk')) IN ('INTEGER','DOUBLE','DECIMAL')
       THEN CAST(JSON_EXTRACT(game_data,'$.atk') AS SIGNED) END) STORED
```

Generadas expuestas: `cmc` (MTG) · `atk`, `def`, `lvl` (YGO) · `hp` (PTCG).

**Índice multivaluado** para los colores de MTG (verificado: el optimizador lo usa):
```sql
KEY idx_cards_mtg_colors ((CAST(game_data->'$.colors' AS CHAR(2) ARRAY)))
-- WHERE 'G' MEMBER OF (game_data->'$.colors')
```

## Restricción de MySQL descubierta en T-006

Una FK con `ON DELETE CASCADE` **no puede** definirse sobre una columna que sea base de una
columna generada **STORED** (error 1215). Con **VIRTUAL** sí se permite. Por eso `set_key` y
`default_guard` en `pack_templates` son VIRTUAL. Tenerlo presente al añadir columnas generadas
sobre cualquier columna con FK.
