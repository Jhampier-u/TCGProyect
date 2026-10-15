# S035 — Las facetas de Pokémon, indexadas

**Fecha:** 2026-08-28 · **Tareas:** T-091 · **Migración:** 0027

> **Bitácora reconstruida en S037** a partir del commit `4e1ff60`, la cabecera de la migración y
> `04_Diccionario_Datos.md`. La sesión cerró la tarea, movió las filas de `001Reportes` y actualizó el
> diccionario, pero **no escribió su bitácora**: `Tareas_Realizadas.md` citaba una sesión sin registro.

---

## T-091 — Tres columnas generadas, con el patrón que ya había

El catálogo de Pokémon se navega por **tipo**, **categoría** (Pokémon / Entrenador / Energía) y
**marca de regulación**, y las tres vivían dentro de `cards.game_data`: JSON sin índice. Cada filtro
era un escaneo de las 20.434 cartas, y el raíl de T-093 lo convierte en el camino caliente.

La migración `0027_ptcg_facetas` añade `supertype`, `elem_type` y `reg_mark` como columnas generadas
`STORED` con su índice `(game_id, columna)`. **No se inventó nada**: son las mismas cinco líneas que
`cmc`, `atk`, `def`, `lvl` y `hp` llevan desde la 0001, con el guardián cambiado de
`JSON_TYPE(...) IN ('INTEGER','DOUBLE','DECIMAL')` a `= 'STRING'`.

### Sin filtro por juego, y medido antes de decidirlo

Ninguna de las columnas generadas existentes filtra por `game_id`, porque la clave sólo existe en un
juego. Se comprobó que también aquí:

| Clave | MTG | YGO | PTCG |
|---|---|---|---|
| `supertype` | 0 | 0 | 20.434 |
| `types` | 0 | 0 | 17.261 |
| `regulation_mark` | 0 | 0 | 8.184 |

Cero colisiones. Añadir `game_id = 3` habría sido ruido que además rompía la simetría.

### Lo que `types[0]` pierde, escrito

`types` es un array y se toma el primero. De 17.261 cartas con tipo, **103 tienen dos (0,6 %)**:
ésas se filtran por su tipo principal y no por el segundo. Cubrirlo exige un índice multivaluado —la
misma decisión que `subtypes` tiene pendiente— y no compensa por seis cartas de cada mil.

### `EXPLAIN`, no suposición

| Consulta | Filas recorridas | Índice | `filesort` |
|---|---|---|---|
| Filtrar por tipo (`elem_type`, materializada) | **2.391** | `Using index` | no |
| Lo mismo sobre `subtypes[0]` (sin materializar) | **34.200** | no cubre | — |

El contraste justifica a la vez la migración y el aplazamiento de `subtypes`.

### Rollback ejecutado a mano

Como se hizo con la 0025 y la 0026, y como pide el criterio de aceptación del spec: el `down` dejó las
columnas e índices fuera limpiamente, y reaplicar el `up` devolvió exactamente **20.434 / 17.261 /
8.184**. No había nada que perder: una columna generada deriva, no copia.

---

## Estado al cerrar

- Migraciones: hasta la **0027**.
- H9b: T-091 cerrada. **Siguiente:** T-092, declarar las facetas en la API.
