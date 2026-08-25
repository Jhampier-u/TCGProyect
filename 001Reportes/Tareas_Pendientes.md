# Tareas Pendientes

**Última actualización:** 2026-08-25 (S012) · **Total abiertas:** 6

Leyenda de prioridad: 🔴 crítica · 🟠 alta · 🟡 media · ⚪ baja

## Hito H0 — Fundamentos

| ID | Tarea | Agente | Prio | Depende de |
|---|---|---|---|---|
| T-004 | `docker-compose.yml` con mysql, redis, api, web | Arquitectura | 🟠 | ✅ T-003 hecha |
| T-005 | Obtener API key de Pokémon TCG en dev.pokemontcg.io | Usuario | 🟠 | — |

## Hito H1 — Esquema de datos ✅ COMPLETADO

Sin tareas abiertas. T-006, T-007 y T-008 cerradas y verificadas en MySQL 8.0.42.

## Hito H2 — Ingesta ✅ COMPLETADO

Sin tareas abiertas. Los 3 adaptadores, el cliente con límite de tasa y el job de imágenes están
hechos y verificados contra los orígenes reales.

**El orquestador (`IngestService`) está construido y verificado** contra MySQL real (T-021, S011).

## Deuda técnica detectada en S004

| ID | Tarea | Agente | Prio |
|---|---|---|---|
| T-040 | Verificar el **volteo** de las cartas con el panel del navegador visible o en Cypress (H8). En S017 no se pudo: `requestAnimationFrame` estaba parado (0 fotogramas en 500 ms), así que ninguna animación podía avanzar. La lógica sí quedó verificada | QA | 🟡 |
| T-035 | Cosechar también los **iconos de set**. Hoy `sets.icon_url` apunta al origen y por eso la API no lo expone (ver **P-022**); sin iconos propios, el selector de sets no puede mostrarlos | Backend | 🟡 |
| T-034 | Plantillas por época para los sets de Yu-Gi-Oh! **anteriores a 2020**. Hoy topan la completitud en ~70,7 % (ver **P-021**). La tabla histórica de Yugipedia ya está capturada en P-019; el blóqueo real es que hace falta un paso de asignación de plantilla posterior a la ingesta | Base de Datos / Backend | ⚪ |
| T-022 | Guion `db:migrate` que cree la base de datos si falta y ejecute el migrador. Hoy ese paso previo es manual (ver S011) | Backend | 🟡 |
| T-023 | Revisar el orden de `findPendingSets`: `released_at DESC` hace que una ejecución acotada procese primero sets **futuros** y promocionales en vez de los jugables (ver S011) | Backend | ⚪ |
| T-019 | `card_prints.image_failed_at` o similar. Hoy una URL de imagen permanentemente rota se reintenta en cada ejecución del job, para siempre (ver S010) | Base de Datos | 🟡 |
| T-016 | Test que detecte *drift* entre `GAME_IDS` de `@tcg/shared` y el seed SQL de `games`. Hoy la correspondencia 1=MTG/2=YGO/3=PTCG vive en dos sitios sin nada que la verifique | QA | 🟡 |

## Contrato adicional derivado de T-018

**`inBoosters` (P-014).** Todo adaptador debe informarlo:
- **MTG**: dato real del origen → `raw.booster ?? true`.
- **YGO / PTCG**: `true`. Es una suposición **a nivel de set**, no un dato: en ambos juegos los
  productos que no son sobres (Structure Decks, tins, cajas de regalo) son *sets aparte*, no cartas
  marcadas dentro de un set de sobres. Si un adaptador futuro encontrara la distinción por carta,
  debe informarla.
- El **motor de sobres** (H4) debe filtrar `in_boosters = 1`. El catálogo y la colección, no.

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
