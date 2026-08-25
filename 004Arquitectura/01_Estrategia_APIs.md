# 01 — Estrategia de las 3 APIs externas

> Verificado en vivo el **2026-08-25**: Scryfall `200 OK`, Pokémon TCG `200 OK` (sin API key).
> YGOPRODeck según su guía oficial vigente.

## Tabla comparativa operativa

| | **Scryfall (MTG)** | **YGOPRODeck (YGO)** | **Pokémon TCG API** |
|---|---|---|---|
| Base URL | `https://api.scryfall.com` | `https://db.ygoprodeck.com/api/v7` | `https://api.pokemontcg.io/v2` |
| API key | No | No | Opcional pero **obligatoria para nosotros** (`X-Api-Key`) |
| Límite de tasa | **~10 req/s** — la doc exige 50–100 ms de espera entre peticiones | **20 req/s**; excederlo = **bloqueo de 1 hora** | Cuota **diaria** (sin key ~1.000/día; con key ~20.000/día) |
| Castigo por exceso | 429 + baneo temporal | Bloqueo de IP 1 h | 429 / agotamiento de cuota |
| Cabeceras exigidas | `User-Agent` **propio y descriptivo** + `Accept: application/json` | — | `X-Api-Key` |
| Descarga masiva | ✅ **`GET /bulk-data`** — volcados **JSONL comprimidos en gzip**, diarios | ⚠️ Un único `cardinfo.php` sin filtros ≈ todo el catálogo | ❌ Sólo paginación (`page`, `pageSize` máx. 250) |
| Imágenes | Permite uso, pide no abusar → cacheamos | 🚨 **Hotlinking prohibido, blacklist de IP.** Descargar **una sola vez** y re-hospedar | URLs en `images.small/large` |
| Paginación | `has_more` + `next_page` (175/pág) | `num`/`offset` | `page` / `pageSize` / `totalCount` |

## Consecuencia arquitectónica por API

### MTG → **no paginar, usar bulk**

> **CORRECCIÓN DE S001 (verificada en T-011, S007).** El endpoint ha cambiado respecto a lo que se
> documentó aquí inicialmente. Ya **no** expone `download_uri` ni `size`, sino **`jsonl_download_uri`**
> y **`compressed_size`**, y el fichero es **JSONL comprimido en gzip**, no un array JSON.
> Cualquier código que buscase `download_uri` fallaría.

Descargar `default_cards` de `/bulk-data` (74 MB comprimidos, ~116.750 impresiones) desde
**`data.scryfall.io`** — host distinto de `api.scryfall.com`, con su propia cola. Se procesa en
streaming: gunzip + partición por líneas. Reduce la ingesta de MTG de ~600 peticiones paginadas a
**2 peticiones**.

Que el formato sea JSONL y no un array elimina la necesidad de un analizador de JSON incremental:
basta partir por saltos de línea. **Medido: 116.752 impresiones en 12,5 s con pico de 210 MB de RSS.**

| Particularidad del origen | Consecuencia de diseño |
|---|---|
| En cartas de doble cara, `mana_cost`, `colors`, `oracle_text` e `image_uris` viven en `card_faces[0]` | El adaptador consulta arriba y cae a la primera cara |
| El layout `reversible_card` **no trae `oracle_id`** de nivel superior | `oracleKey` cae al `oracle_id` de la cara |
| `colors` llega como `[]` en cartas incoloras | Se omite: una carta incolora no debe entrar en el índice multivaluado |
| `set` (código) es único: 0 duplicados en 1048 | Sirve como clave natural, al revés que en YGO (P-013) |
| `id` de impresión es un UUID global | No hace falta componer la clave con la rareza |
| **`booster: false` en el 54,7 % de las impresiones** | **Sin persistir → el pool de sobres es infiel (P-014)** |

### YGO → particularidades del origen (verificadas en T-012, S006)

| Hecho del origen | Consecuencia de diseño |
|---|---|
| `card_sets` de una carta lista sus impresiones en **todos** los sets | El adaptador **debe** filtrar por `set_name`; si no, la ingesta de un set contamina a los demás |
| `set_code` se repite **dentro** de un set (24 casos en *Supreme Darkness*) | `card_prints.external_id` = `{set_code}::{rarityCode}` |
| `set_code` se repite **entre** sets (`JUMP` en 70 sets; 1032 sets, 644 códigos) | `sets.external_id` = `set_name`, único en los 1032 |
| `def` es `null` en monstruos Link | Tercer caso numérico distinto de `"?"` y de ausente |
| Sets sin cartas responden **HTTP 400**, no 404 ni 200 vacío | Se trata como aviso, no como avería |
| La rareza determina el acabado (no hay campo propio) | `finishes` se deriva de la rareza |

### YGO → **una descarga completa, luego incremental**
`cardinfo.php` sin parámetros devuelve el catálogo entero de una vez. Se ingesta completo en la
carga inicial y después se refresca por `?misc=yes&startdate=` o simplemente semanalmente.
El coste está en las **imágenes**, no en los datos.

### PTCG → particularidades del origen (verificadas en T-013, S009)

| Hecho del origen | Consecuencia de diseño |
|---|---|
| **El nombre NO identifica una carta**: 258 cartas y 175 nombres en `sv1` | `oracle_key` = `id` de la API, no el nombre (P-015) |
| `hp` llega como cadena (`"30"`) | `toJsonNumber` |
| 49 de 258 cartas sin `hp`/`types`/`attacks` | Entrenadores y energías; claves omitidas |
| `retreatCost`, `convertedEnergyCost` en camelCase | Se mapean a snake_case por contrato con el DDL |
| `releaseDate` con barras (`1999/01/09`) | Se convierte a `DATE` de MySQL |
| Algunas promos sin `rarity` | Caen a `common` con aviso; nunca se descarta la carta |
| **~30 % de éxito en las peticiones** (500/502 de Cloudflare) | `maxRetries: 8` para ese host; la ingesta debe ser reanudable (P-016) |

### PTCG → **paginación agresiva con key**
`pageSize=250` sobre `/cards` ⇒ ~80–100 peticiones para todo el catálogo. Con cuota diaria, la
ingesta inicial debe repartirse o ejecutarse una sola vez y cachear el resultado en disco.

## Diseño de la cola de tasa (`RateLimitedClient`)

Una cola **por host**, no global. Un solo *bucket* compartido haría que MTG desperdiciara el
presupuesto de YGO.

```ts
const LIMITS: Record<string, HostPolicy> = {
  'api.scryfall.com':      { minIntervalMs: 120, concurrency: 1, retry: 'exponential' },
  'db.ygoprodeck.com':     { minIntervalMs: 100, concurrency: 2, retry: 'exponential' },
  'api.pokemontcg.io':     { minIntervalMs: 250, concurrency: 2, retry: 'exponential', dailyQuota: 18000 },
  'images.ygoprodeck.com': { minIntervalMs: 300, concurrency: 1, retry: 'exponential' },
};
```

Se usan valores **más conservadores que el límite publicado** (120 ms para Scryfall frente a los
100 ms mínimos, 100 ms para YGO frente a los 50 ms que permitirían sus 20 req/s). El coste de
ser lento es minutos; el coste de ser baneado es horas o permanente.

Reglas de la cola:
- `User-Agent: ProyectoTCG/0.1 (+contacto)` en **todas** las peticiones salientes.
- Respetar `Retry-After` en 429; backoff exponencial con jitter (base 1 s, máx. 60 s, 5 intentos).
- **Circuit breaker**: 5 fallos consecutivos de un host ⇒ ese adaptador se pausa 15 min y se
  registra en `003Problemas`.
- Contador de cuota diaria persistido en Redis con TTL a medianoche UTC para PTCG.

## Pipeline de imágenes (crítico — riesgo R-02)

```
ingesta datos ──► card_prints.image_source_url
                          │
                  job "image-harvest" (cola aparte, 1 descarga cada 300 ms)
                          │
                  descarga ─► normaliza a WebP (small 245px / large 745px)
                          │
                  guarda en /storage/cards/{game}/{set}/{print}.webp
                          │
                  card_prints.image_local_path  ◄── el frontend SÓLO usa esto
```

Invariante innegociable: **el frontend jamás recibe una URL de un dominio externo.** Se aplica
a los tres juegos por uniformidad, aunque sólo YGOPRODeck lo exija formalmente.

> **IMPLEMENTADO en T-014 (S010).** `apps/api/src/images/`. El invariante no se confía a la
> disciplina: `isSafeLocalPath()` lo comprueba y hay tests que lo aplican a todas las rutas que el
> job genera. Tres salvaguardas contra la redescarga (disco antes que red, disco antes que BD, tope
> por ejecución). Medido: 94,8 % de reducción de tamaño y 0 redescargas en la segunda ejecución.

## Cadencia de sincronización

| Job | Frecuencia | Alcance |
|---|---|---|
| `sync:sets` | Diario 03:00 | Detecta sets nuevos en los 3 juegos |
| `sync:cards` | Diario 03:15 | Sólo sets con `ingested_at IS NULL` o set nuevo |
| `sync:images` | Continuo, baja prioridad | Prints con `image_local_path IS NULL` |
| `sync:banlist` | Semanal | YGO Forbidden/Limited + legalidades MTG |
| `sync:prices` | Semanal | *Snapshot* informativo (fuera de alcance funcional v1) |
