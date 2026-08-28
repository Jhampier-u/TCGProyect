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
   ├─ 3. rng = xoshiro128**(seed)
   ├─ 4. por cada slot: resuelve la entrada por pesos ──► elige print aleatorio
   │       de esa (set_id, rarity_id) CON in_boosters = 1 Y withdrawn_at NULL
   │       [pool cargado de MySQL al abrir]  <- el filtro es obligatorio (P-014)
   │       una entrada puede sacar la carta de OTRO set (T-085) y un slot puede
   │       exigir un tipo -- la tierra basica -- ademas de la rareza
   ├─ 5. persiste pack_openings + pack_opening_cards
   └─ 6. UPSERT user_collection (quantity = quantity + 1)   [RN-02]
   │
   ▼
Respuesta: { openingId, seed, cards[] }  ── el front anima el reveal
```

**Nota de rendimiento:** el paso 4 no hace `ORDER BY RAND()` (escaneo completo). Se carga el pool
entero del set en una consulta —`card_print_id` agrupado por rareza, **filtrando `in_boosters = 1` y
`withdrawn_at IS NULL`**— y se indexa con el RNG. O(1) por slot.

**Corrección de S031:** este documento decía "precargado en **Redis**" y "mulberry32", y ninguna de las
dos cosas es cierta. El pool se lee de MySQL en cada apertura, apoyado en `idx_prints_pool`, que es
covering; Redis sólo guarda la cuota diaria de las APIs externas (T-017). Y el PRNG es `xoshiro128**`,
elegido sobre mulberry32 porque éste tiene estado de 32 bits y habría obligado a tirar tres cuartas
partes de la entropía de la semilla — el motivo está escrito en `prng.ts` desde H4. Eran dos
afirmaciones de diseño que el código nunca cumplió y que nadie volvió a leer.

**El pool ajeno se carga aparte y en perezoso** (T-085): sólo cuando una entrada `{"set":...}` sale
elegida, que en el Play Booster es una de cada ocho aperturas.

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
