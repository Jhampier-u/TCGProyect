# S007 — T-011 (`ScryfallAdapter`)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sí, lanza T-011"*.

## Agentes invocados
1. **Agente Backend** — inspección del origen, extensión de la capa HTTP, adaptador.
2. **Agente QA** — 24 tests nuevos + volcado real + ingesta contra MySQL.
3. **Agente Documentador** — Vault, con dos correcciones de documentación previa.

---

## El endpoint `/bulk-data` había cambiado

La estrategia escrita en S001 decía «volcados JSON diarios» y planteaba escribir un analizador de
JSON incremental para no reventar la memoria. Al inspeccionar el origen real:

| Documentado en S001 | Realidad (2026-08-25) |
|---|---|
| `download_uri` | **`jsonl_download_uri`** |
| `size` | **`compressed_size`** |
| Array JSON gigante | **JSONL comprimido en gzip** (un objeto por línea) |

Código que buscase `download_uri` habría fallado. Y el cambio de formato es una buena noticia:
convierte «escribir un analizador de JSON incremental» en «partir por saltos de línea», que es
trivial y mucho más robusto. Corregido en `004Arquitectura/01_Estrategia_APIs.md`.

El volcado se sirve además desde **`data.scryfall.io`**, un host distinto de `api.scryfall.com`, así
que se le dio su propia política de cola: descargar 74 MB no debe consumir el presupuesto de la API.

---

## Extensión de la capa HTTP

`RateLimitedClient` sólo ofrecía `json()` y `text()`. Sobre un volcado que descomprime a cientos de
MB, ambos matan el worker. Se añadió **`stream()`**, que devuelve el cuerpo como flujo de bytes
pasando por la misma cola, cortocircuito y reintentos.

Su contrato de reintentos está acotado y documentado: cubren el **establecimiento** de la petición,
no el consumo. Una vez devuelto el flujo, el cliente ya no puede rebobinarlo.

---

## Dos caminos de ingesta

| Camino | Uso | Coste |
|---|---|---|
| `fetchAllPrints()` | Carga inicial | **2 peticiones** para 116.752 impresiones |
| `fetchPrints(set)` | Set nuevo, incremental | Buscador paginado, 175/página |

No compensa releer 74 MB porque salga un set. `fetchPrints` respeta la interfaz `GameAdapter`;
`fetchAllPrints` es una capacidad extra que el servicio de ingesta detecta con `supportsBulk()`.

`unique=prints` es obligatorio en la búsqueda: sin él Scryfall colapsa las reimpresiones y
perderíamos justo las impresiones que un sobre entrega.

---

## Particularidades del origen

| Hecho | Manejo |
|---|---|
| En doble cara, `mana_cost`/`colors`/`oracle_text`/`image_uris` viven en `card_faces[0]` | Se consulta arriba y se cae a la primera cara |
| `reversible_card` **no trae `oracle_id`** arriba | `oracleKey` cae al de la cara; si no, rompería el NOT NULL de `cards.oracle_key` |
| `colors: []` en cartas incoloras | Se omite — una carta incolora no pertenece al índice multivaluado |
| `mana_cost: ""` en tierras | Se omite en vez de persistir cadena vacía |
| Códigos de set únicos (0 duplicados en 1048) | Sirven como clave natural, al revés que en YGO (P-013) |

---

## Verificación

### Tests — 24 nuevos (80 en total)
Incluye el troceado del flujo **byte a byte**, el caso más hostil posible, y un test específico de
caracteres multibyte partidos entre chunks (el motivo real de usar `TextDecoder` con `stream: true`).
Un test mide que 40 MB sintéticos no hacen crecer el heap de forma proporcional.

### Volcado real completo

| Métrica | Valor |
|---|---|
| Impresiones | **116.752** en 1048 sets |
| Tiempo | **12,5 s** |
| **Pico de RSS** | **210 MB** (criterio P-004: < 512 MB) ✅ |
| Colisiones de `externalId` | **0** en 116.752 |
| Rarezas encontradas | rare 41.941 · common 37.502 · uncommon 26.611 · mythic 10.297 · special 392 · **bonus 9** |
| Sin imagen | 162 (avisadas, no descartadas) |

Las **seis** rarezas coinciden exactamente con las sembradas en T-007 — incluidas `special` y las
9 cartas `bonus` de todo Magic. El seed queda validado contra el catálogo entero.

### Ingesta real contra MySQL 8.0.42
Bloomburrow (398 impresiones, 280 cartas) insertado sin errores, y después *Supreme Darkness* de
YGO **en la misma base de datos**:

| Comprobación | Resultado |
|---|---|
| Índice multivaluado con datos MTG | `EXPLAIN`: *Index lookup using **idx_cards_mtg_colors*** |
| Reparto de colores | W 57 · U 61 · B 56 · R 60 · G 63 · incoloras 27 |
| Columna generada `cmc` | Curva de maná coherente (0→17, 2→84, 7→2) |
| **Modelo unificado** | MTG 280 cartas / 398 impresiones · YGO 101 / 125, **mismas tablas** |
| **Generadas por juego** | MTG: 280 con `cmc`, **0** con `atk`. YGO: **0** con `cmc`, 64 con `atk` |

Esa última fila es la validación del diseño de `game_data`: los perfiles de cada juego conviven en
una sola tabla sin pisarse.

---

## Problemas

**P-004 CERRADO.** Con medición, no con estimación.

**P-014 abierto (🔴) — requiere decisión.** Scryfall marca cada impresión con `booster`, que vale
`false` en las cartas que nunca se obtienen abriendo sobres. **Es el 54,7 % de las impresiones**, con
sets enteros al 100 %. Nuestro esquema no guarda ese campo, así que el pool `(set_id, rarity_id)`
del motor de sobres incluiría cartas que físicamente no salen de un sobre.

Esto **reabre parcialmente R-03**. P-003 se cerró midiendo que las *distribuciones de rareza* son
fieles; de poco sirve acertar que el hueco de rara sale 1 de cada 7 veces si la carta que entrega es
una promo de Secret Lair. La corrección es una sola migración (T-018), pero cambia el esquema y el
contrato de dominio compartido, así que se documenta en vez de aplicarse por iniciativa propia.

---

## Estado al cerrar
- H0: falta Docker · H1 ✅ · **H2: 2 de 3 conectores**, ambos probados extremo a extremo.
- Tareas: 21 realizadas · 8 pendientes · 1 bloqueada.
- Tests: **80/80** · `tsc --build` limpio · `npm audit` limpio.

## Siguiente acción esperada
Decidir sobre **T-018** (P-014) y/o lanzar **T-013** (`PokemonTcgAdapter`), el último conector.
