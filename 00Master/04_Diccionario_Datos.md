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
| `icon_url` | VARCHAR(512) NULL | |
| **UNIQUE** | `(game_id, external_id)` | Clave natural de deduplicación |

### `cards`
La carta **conceptual** (el "oráculo"): un nombre y sus reglas, independiente de la impresión.
Necesaria porque las reglas de mazo (máx. 4 copias) se aplican **por nombre**, no por impresión.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `game_id` | TINYINT UNSIGNED FK | |
| `oracle_key` | VARCHAR(64) | `oracle_id` (MTG), `id` (YGO), `name` normalizado (PTCG) |
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
| `image_source_url` | VARCHAR(512) NULL | Sólo para la descarga inicial |
| `finishes` | JSON | `["nonfoil","foil"]`, `["normal","reverse"]`, etc. |
| **UNIQUE** | `(set_id, external_id)` | |

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

`pack_templates`: `id`, `set_id` (NULL = plantilla por defecto del juego), `game_id`, `name`
(`"Play Booster"`, `"Sobre de 9 cartas"`), `card_count`, `is_default`.

`pack_slots`: `id`, `pack_template_id`, `slot_index`, `distribution JSON`, `foil_chance DECIMAL(6,5)`.

`distribution` es un array de pesos:
```json
[{"rarity":"rare","weight":865},{"rarity":"mythic","weight":135}]
```

### `users`, `user_collection`, `decks`, `deck_cards`, `pack_openings`, `pack_opening_cards`
- `user_collection`: `(user_id, card_print_id, finish)` UNIQUE + `quantity`. Nunca borra filas, ajusta cantidad.
- `pack_openings`: `id`, `user_id`, `pack_template_id`, `seed CHAR(32)`, `opened_at`. Cumple **RN-01**.
- `deck_cards`: `deck_id`, `card_print_id`, `quantity`, `zone` ENUM(`main`,`extra`,`side`,`commander`).

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
