# 02 — Flujos de Datos

## Flujo A — Ingesta (asíncrono, fuera de la petición del usuario)

```
[Scryfall]   [YGOPRODeck]   [PokémonTCG]
     │             │              │
     └──────┬──────┴──────┬───────┘
            ▼             ▼
      RateLimitedClient (cola por host + circuit breaker)
            │
            ▼
   GameAdapter (Scryfall│Ygo│Ptcg)  ── traduce a modelo de DOMINIO
            │
            ▼
      IngestService  ── UPSERT idempotente por clave natural
            │
            ├──► MySQL: sets, cards, card_prints, rarities
            └──► cola "image-harvest" ──► /storage ──► image_local_path
```

## Flujo B — Apertura de sobre (síncrono, ~50 ms, sin salir de la BD)

```
Usuario ─POST /api/packs/open {setId, count}
   │
   ▼
PackService
   ├─ 1. genera seed (crypto.randomUUID → 32 hex)   [RN-01]
   ├─ 2. carga pack_template + pack_slots del set (o el default del juego)
   ├─ 3. rng = mulberry32(seed)
   ├─ 4. por cada slot: resuelve rareza por pesos ──► elige print aleatorio
   │       de esa (set_id, rarity_id) CON in_boosters = 1
   │       [pool precargado en Redis por set]  <- el filtro es obligatorio (P-014)
   ├─ 5. persiste pack_openings + pack_opening_cards
   └─ 6. UPSERT user_collection (quantity = quantity + 1)   [RN-02]
   │
   ▼
Respuesta: { openingId, seed, cards[] }  ── el front anima el reveal
```

**Nota de rendimiento:** el paso 4 no hace `ORDER BY RAND()` (escaneo completo). Se precarga en
Redis un array de `card_print_id` por `(set_id, rarity_id)` **filtrando `in_boosters = 1`** y se
indexa con el RNG. O(1).

**El filtro `in_boosters` no es opcional.** Sin él, en Bloomburrow el pool de raras pasa de 60
impresiones reales a 129, y más de la mitad de las raras entregadas serían cartas que nunca
estuvieron en un sobre (P-014). El índice `idx_prints_pool` incluye la columna para que la consulta
siga siendo *covering*.

## Flujo C — Validación de mazo

```
Deck ──► DeckValidator (factory por game_id)
            ├─ MtgValidator   → 60 main / ≤4 copias / sideboard ≤15
            ├─ YgoValidator   → 40-60 main / extra ≤15 / ≤3 copias / banlist
            └─ PtcgValidator  → =60 / ≤4 copias / energías básicas exentas
                    │
                    ▼
        ValidationResult { valid, errors[], warnings[] }
```
`warnings[]` incluye "no posees N copias de X" cruzando con `user_collection` (RN-03).

## Contratos de API interna (v1)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | ✅ Sonda de vida |
| GET | `/api/games` | ✅ Los 3 juegos |
| GET | `/api/games/:game/sets` | ✅ Sets del juego, con `poolSize` (impresiones abribles) |
| GET | `/api/games/:game/rarities` | ✅ Rarezas, para poblar el filtro del frontend |
| GET | `/api/cards?game=&set=&rarity=&q=&cursor=&limit=` | ✅ Búsqueda unificada, **keyset** (no `page`) |
| GET | `/api/cards/:printId` | ✅ Detalle con `game_data` |
| POST | `/api/auth/register` | ✅ Alta de cuenta. Devuelve token |
| POST | `/api/auth/login` | ✅ Máx. 10 intentos / 5 min. Sin enumeración de usuarios |
| GET | `/api/auth/me` | ✅ Usuario del token |
| POST | `/api/packs/open` | ✅ **Autenticado.** El `user_id` sale del token, nunca del cuerpo |
| GET | `/api/packs/openings/:id` | ✅ Reproduce desde lo persistido (RN-01). Ajena → 404, no 403 |
| GET | `/api/collection` | ✅ Colección paginada por keyset `(printId, finish)` |
| GET | `/api/collection/completion/:game` | ✅ Completitud por set. Denominador: `in_boosters = 1` |
| GET | `/api/collection/summary` | ✅ Entradas, copias y aperturas |
| GET/POST/PUT/DELETE | `/api/decks[/:id]` | CRUD de mazos |
| POST | `/api/decks/:id/validate` | Devuelve `ValidationResult` |
