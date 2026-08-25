# S009 — T-013 (`PokemonTcgAdapter`) y T-017 (`RedisQuotaStore`)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"T-013 y T-017 juntos"*.

## Agentes invocados
1. **Agente Backend** — inspección del origen, contador en Redis, adaptador.
2. **Agente QA** — 27 tests nuevos, ingesta real y verificación de los tres juegos juntos.
3. **Agente Documentador** — Vault, con una corrección del diccionario de datos.

---

## T-017 — `RedisQuotaStore`

Se implementa sobre una interfaz **`RedisLike`** mínima (`incr`, `decr`, `expire`, `get`) en lugar de
depender de `ioredis` o `node-redis`. Ambos la satisfacen tal cual, y así no se añade una dependencia
—ni superficie de auditoría— a un proyecto que aún no ha elegido cliente.

**Dos defensas independientes contra el vuelco de día:**
1. La fecha UTC forma parte de la **clave** (`tcg:quota:api.pokemontcg.io:2026-08-25`). Al cambiar
   el día se cuenta en una clave nueva aunque el TTL fallara. Es la que garantiza la corrección.
2. TTL hasta la medianoche UTC, sólo para que las claves viejas no se acumulen.

El test que importa reproduce el escenario original de P-012: un `RedisQuotaStore` nuevo —simulando
un worker reiniciado— sobre el mismo Redis lee 5 de 10 consumidas y sólo permite 5 más. La versión
en memoria habría permitido 10.

---

## Un hallazgo que invalidó lo que decía el diccionario de datos

El diccionario planteaba, para Pokémon, `oracle_key = nombre normalizado`, porque la API no expone
identificador conceptual. Los datos reales lo desmienten:

**En el set `sv1` hay 258 cartas y sólo 175 nombres distintos.** Y las homónimas no son
reimpresiones — son cartas **distintas**:

| id | nombre | PS | ataque | rareza |
|---|---|---|---|---|
| `sv1-16` | Tarountula | 40 | String Haul | common |
| `sv1-17` | Tarountula | 40 | String Shot | common |
| `sv1-18` | Tarountula | **60** | **Surprise Attack** | common |
| `sv1-199` | Tarountula | 40 | String Shot | illustration_rare |

Con clave por nombre, las cuatro habrían colapsado en una fila y el `ON DUPLICATE KEY UPDATE` habría
dejado sólo el `game_data` de la última. **83 cartas perdidas en un solo set.**

Se usa el **`id` de la API**. Registrado como **P-015** y corregido en el diccionario. Es el **cuarto
caso de la misma familia** (P-010 Nidoran ♂/♀, P-013 los dos `set_code` de YGO, y éste): una clave
natural que *parece* única, un upsert, y datos que desaparecen sin un error en los logs.

---

## Otras particularidades del origen

| Hecho | Manejo |
|---|---|
| `hp` llega como **cadena** (`"30"`) | `toJsonNumber` la convierte |
| 49 de 258 cartas no traen `hp`, `types` ni `attacks` | Son entrenadores y energías; las claves se omiten |
| `retreatCost` / `convertedEnergyCost` en camelCase | Se mapean a `retreat_cost` / `converted_energy_cost` por contrato con el DDL |
| `releaseDate` con barras (`1999/01/09`) | Se convierte al formato `DATE` de MySQL |
| `total` vs `printedTotal` | Se usa `total`: incluye las secretas |
| Algunas promos no traen `rarity` | Caen a `common` con aviso `unknown_rarity`; **nunca se descarta la carta** |

---

## La API de Pokémon está inestable (P-016)

Sondeo de 8 peticiones **idénticas** repetidas:

| Petición | 200 | Errores |
|---|---|---|
| `/v2/sets?pageSize=250` | 3 | 5 |
| `/v2/sets?pageSize=1` | 2 | 6 |

El primer sondeo sugería un límite de `pageSize` (25→502, 50→500, 100→200, 250→502), pero **repetir
la misma petición demostró que los fallos son independientes del tamaño de página**. Los 502 vienen
de Cloudflare con `origin_bad_gateway`.

Se subió `maxRetries` a **8** para ese host. Y aun así, durante la verificación **una ingesta agotó
los 9 intentos y falló**; el reintento posterior fue a la primera. Consecuencias operativas anotadas
en P-016: la ingesta debe poder reanudarse (ya previsto con `sets.ingested_at`), y los reintentos
consumen cuota diaria.

El **cortocircuito no llegó a abrirse** en ninguna prueba, porque los éxitos intercalados reinician
el contador de fallos consecutivos. Es el comportamiento correcto: el origen no está caído, está
degradado.

---

## Verificación

### Tests — 27 nuevos (111 en total, todos verdes)

### Contra la API real, pese a la inestabilidad

| Métrica | Valor |
|---|---|
| Sets | **174**, todos con `externalId` único |
| Impresiones de `sv1` | **258** = `cardCount` declarado |
| `externalId` y `oracleKey` únicos | 258 / 258 |
| **Nombres únicos** | **175** ← la evidencia de P-015 |
| Avisos del adaptador | 0 |
| **Reintentos ejecutados** | **7**, con 0 cortocircuitos |
| Cuota registrada en Redis | 10 peticiones, TTL 33.552 s |

Uno de los reintentos esperó **60 s**: el techo `maxBackoffMs` actuando. La ingesta completó pese a
que el origen falló siete veces.

### Los tres juegos en un solo esquema MySQL 8.0.42

| Juego | Set | Cartas | Impresiones | Pool de sobres |
|---|---|---|---|---|
| MTG | Bloomburrow | 280 | 398 | **281** |
| YGO | Supreme Darkness | 101 | 125 | 125 |
| PTCG | Scarlet & Violet | 258 | 258 | 258 |

Y la comprobación que valida el diseño de `game_data` — cada juego ocupa **exactamente** sus columnas
generadas y ninguna otra:

| Juego | cartas | `cmc` | `atk` | `lvl` | `hp` |
|---|---|---|---|---|---|
| MTG | 280 | **280** | 0 | 0 | 0 |
| YGO | 101 | 0 | **64** | **61** | 0 |
| PTCG | 258 | 0 | 0 | 0 | **209** |

Las cuatro `Tarountula` figuran en la base de datos como cartas separadas, cada una con sus PS y su
ataque.

---

## Estado al cerrar
- H0: falta Docker · H1 ✅ · **H2: los 3 conectores hechos, falta sólo T-014 (imágenes).**
- Tareas: **26 realizadas · 5 pendientes · 1 bloqueada**.
- Problemas: **5 abiertos · 10 cerrados**.
- Tests: **111/111** · `tsc --build` limpio · `npm audit` limpio.

## Siguiente acción esperada
**T-014** (`image-harvest`) cierra H2. Es la mitad pendiente del riesgo R-02: el hotlinking de
imágenes de YGOPRODeck, que castiga con blacklist de IP (P-001).
