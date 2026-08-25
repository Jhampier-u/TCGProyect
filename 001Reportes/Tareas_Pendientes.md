# Tareas Pendientes

**Última actualización:** 2026-08-25 (S007) · **Total abiertas:** 8

Leyenda de prioridad: 🔴 crítica · 🟠 alta · 🟡 media · ⚪ baja

## Hito H0 — Fundamentos

| ID | Tarea | Agente | Prio | Depende de |
|---|---|---|---|---|
| T-004 | `docker-compose.yml` con mysql, redis, api, web | Arquitectura | 🟠 | ✅ T-003 hecha |
| T-005 | Obtener API key de Pokémon TCG en dev.pokemontcg.io | Usuario | 🟠 | — |
| T-015 | Resolver **ADR-006** (ORM y migrador). Recomendado: SQL plano + migrador ligero | Usuario | 🟡 | — |

## Hito H1 — Esquema de datos ✅ COMPLETADO

Sin tareas abiertas. T-006, T-007 y T-008 cerradas y verificadas en MySQL 8.0.42.

## Hito H2 — Ingesta

| ID | Tarea | Agente | Prio | Depende de |
|---|---|---|---|---|
| T-013 | `PokemonTcgAdapter` (paginación 250 + control de cuota diaria) | Backend | 🔴 | ✅ desbloqueada |
| T-014 | Job `image-harvest`: descarga, WebP, almacenamiento local | Backend | 🔴 | T-011..T-013 |

## Deuda técnica detectada en S004

| ID | Tarea | Agente | Prio |
|---|---|---|---|
| T-016 | Test que detecte *drift* entre `GAME_IDS` de `@tcg/shared` y el seed SQL de `games`. Hoy la correspondencia 1=MTG/2=YGO/3=PTCG vive en dos sitios sin nada que la verifique | QA | 🟡 |
| T-017 | `QuotaStore` sobre Redis con TTL a medianoche UTC. **Obligatorio antes de la ingesta real de Pokémon** (ver P-012) | Backend | 🟠 |
| T-018 | **`card_prints.in_boosters`** + `DomainPrint.inBoosters`. Sin esto el pool de sobres entrega cartas que nunca salen en sobre — el 54,7 % del catálogo de MTG (ver **P-014**) | Base de Datos / Backend | 🔴 |

## Contratos que la ingesta debe cumplir (derivados de T-006 y T-007)

**Mapeo de rarezas (T-007).** Cada adaptador recibe de su API una cadena de rareza y debe
resolverla contra `rarities.code` del juego correspondiente:
- Normalización: minúsculas → sin acentos ni apóstrofos → espacios y puntos a `_`.
- `rarities.label` guarda la cadena **literal** de la API; `code` es la clave normalizada.
- **Rareza desconocida ⇒ se inserta al vuelo con `tier = 50` y se registra un aviso.**
  Jamás se descarta una carta por no reconocer su rareza.
- **YGO específicamente**: descartar valores numéricos o vacíos y caer a `common` (ver P-007).
**Normalización de `game_data` (T-006).** Los adaptadores **deben** normalizar antes de escribir:
- Los campos numéricos (`atk`, `def`, `level`, `hp`, `cmc`) se escriben como **número JSON o se
  omiten**. Nunca `"?"`, `"X"` ni `""`. El DDL tiene una guarda defensiva, pero el sitio correcto
  para normalizar es la capa anticorrupción (ADR-003).
- `colors` de MTG siempre es un **array** (o se omite), nunca un escalar: el índice multivaluado
  lo exige.
- `game_data` siempre es un **objeto** JSON — hay un CHECK que lo obliga.

## Backlog inmediato (sin ID asignado)

- Endpoint `GET /api/cards` con paginación keyset (H3) — el índice `idx_cards_game_name` ya existe.
- Motor `PackService` determinista por seed (H4) — el índice covering `idx_prints_pool` ya existe.
- Componente `<PackOpening />` con Framer Motion (H5).
- Auth JWT + hash Argon2id (H6) — `users.password_hash` ya dimensionado a VARCHAR(255).
