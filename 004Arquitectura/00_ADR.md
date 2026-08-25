# 00 — Registro de Decisiones de Arquitectura (ADR)

---

## ADR-001 — Runtime del backend: Node.js vs Laravel
**Estado:** ✅ **ACEPTADA — Node.js + TypeScript**
**Fecha propuesta:** 2026-08-25 · **Fecha decidida:** 2026-08-25 (S002, decisión del usuario)

**Contexto.** El requerimiento inicial dice "Node.js/Laravel". Son excluyentes: afectan al 100%
del código de servidor, al ORM, al sistema de migraciones y a la estrategia de colas.

**Opciones.**

| | Node.js + TypeScript | Laravel (PHP 8.3) |
|---|---|---|
| Ingesta de ~110k cartas | Fuerte: I/O concurrente nativo, `undici` + pool | Requiere Octane/queues para concurrencia real |
| Tipos compartidos con React | Sí — un solo `packages/shared` con los tipos del dominio | No, duplicación manual de DTOs |
| Migraciones/ORM | Prisma o Drizzle (buenos, algo menos maduros) | Eloquent + Artisan (excelente, muy maduro) |
| Colas y cron | BullMQ + Redis (montaje manual) | Incluido en el framework |
| Curva para el equipo | 1 lenguaje en todo el stack | 2 lenguajes |

**Recomendación del Orquestador: Node.js + TypeScript.** El proyecto es, en esencia, un
*pipeline de ingesta con límite de tasa* + una API de lectura intensiva. Ambas cosas son I/O-bound,
donde Node destaca, y compartir los tipos del dominio TCG (que son complejos: 3 perfiles JSON
distintos) entre back y front elimina toda una clase de bugs de contrato.

**DECISIÓN: Node.js + TypeScript.** Confirmada por el usuario el 2026-08-25.

**Consecuencias:**
- Monorepo con `packages/shared` para los tipos de dominio compartidos entre API y React.
- Cola de tasa propia con `undici` + BullMQ/Redis (no viene incluida como en Laravel) → T-009.
- Queda abierta la elección de ORM/migrador → **ADR-006**.
- El DDL de T-006 se escribió en **SQL plano deliberadamente**, por lo que es válido con
  cualquier migrador que se elija en ADR-006 y no ata la decisión.

---

## ADR-006 — ORM y sistema de migraciones (Node.js)
**Estado:** 🟡 ABIERTA — no bloqueante
**Fecha:** 2026-08-25

**Contexto.** Elegido Node.js, falta decidir cómo se accede a MySQL y cómo se versionan las migraciones.

**Restricción dura descubierta en T-006:** el esquema usa columnas generadas (`STORED` y `VIRTUAL`),
índices multivaluados sobre JSON, índices `FULLTEXT` y `CHECK` constraints. **Ningún ORM de Node
modela hoy estas construcciones de forma nativa y completa.** Cualquier opción elegida deberá
tratar el DDL como SQL plano.

| Opción | Encaje |
|---|---|
| **SQL plano + migrador ligero** (`node-pg-migrate` style / Umzug / dbmate) | Máximo control, cero fricción con generadas y MVI. El DDL ya existe y funciona. |
| Drizzle | Buen soporte de SQL crudo, tipado excelente; las generadas hay que declararlas a mano. |
| Prisma | DX superior, pero su `schema.prisma` no expresa MVI ni generadas: obligaría a `migrate diff` + parches manuales, con riesgo de *drift*. |

**Recomendación:** **SQL plano versionado + un migrador ligero**, y un cliente tipado por encima
(Drizzle o `mysql2` + Kysely) sólo para las consultas. Mantiene el esquema como fuente de verdad
y evita que el ORM pelee con las features de MySQL 8 que el proyecto necesita.

**→ Pendiente de confirmación. No bloquea: T-007 y T-008 son SQL plano.**

---

## ADR-002 — Catálogo local como fuente de verdad de lectura
**Estado:** ✅ ACEPTADA

Ninguna petición de un usuario final toca jamás una API externa. Las 3 APIs se consumen sólo
mediante *jobs* de ingesta programados. Motivos: (a) los rate limits externos harían que el
tráfico de usuarios provocase el baneo de nuestra IP; (b) latencia impredecible; (c) sin ingesta
propia no se pueden hacer búsquedas unificadas cross-juego ni JOINs.

**Consecuencia:** aceptamos *staleness* de hasta 24 h en el catálogo. Es irrelevante para el
producto (las cartas no cambian; sólo se añaden sets nuevos).

---

## ADR-003 — Capa Anticorrupción (ACL) con patrón Adapter por juego
**Estado:** ✅ ACEPTADA

Cada API tiene una forma radicalmente distinta. Se define **una** interfaz de dominio y **tres**
adaptadores que traducen a ella. Ningún concepto de Scryfall/YGOPRODeck/PokémonTCG cruza el
límite del adaptador.

```ts
interface GameAdapter<G extends GameCode = GameCode> {
  readonly game: G;
  fetchSets(): AsyncIterable<DomainSet>;
  fetchPrints(set: DomainSet): AsyncIterable<DomainPrint<G>>;
  defaultPackTemplate(set: DomainSet): PackTemplateSpec | null;
}
```
Añadir un 4.º juego (One Piece, Lorcana) = escribir un adaptador. Cero cambios en el resto.

**Implementado en T-010** (`packages/shared/src/adapter.ts`), con tres refinamientos sobre este
boceto:
1. `fetchCards` → **`fetchPrints`**. Lo que la ingesta necesita es la *impresión* (con set,
   rareza e imagen), que lleva la carta conceptual embebida. El nombre anterior sugería que
   devolvía `cards`, que es otra tabla.
2. La interfaz es **genérica sobre el juego**, de modo que un `GameAdapter<'MTG'>` produce
   `DomainPrint<'MTG'>` cuyo `gameData` es `MtgGameData` y no la unión de los tres perfiles.
   Un adaptador no puede escribir por error un campo de otro juego.
3. `defaultPackTemplate` devuelve `null` en el caso normal: significa "usa la plantilla por
   defecto del juego", ya sembrada por la migración 0003.

---

## ADR-004 — Ingesta por lotes con cola de tasa y *checkpointing*
**Estado:** ✅ ACEPTADA

La ingesta es un job idempotente, reanudable y con una cola de tasa **por host**. Cada set
procesado se marca con `ingested_at`; si el proceso muere, reanuda por el último set completado
y no reprocesa. Escrituras vía `INSERT ... ON DUPLICATE KEY UPDATE` sobre las claves naturales
del diccionario de datos.

---

## ADR-005 — Simulación de sobres dirigida por datos y determinista
**Estado:** ✅ ACEPTADA

El motor de sobres **no** contiene reglas de ningún juego. Lee `pack_templates`/`pack_slots` y
resuelve pesos. La aleatoriedad usa un **PRNG sembrado** (xoshiro128** o mulberry32), no
`Math.random()`, para cumplir RN-01 (auditabilidad) y permitir tests deterministas en Cypress.

```
open(templateId, seed) -> slots.map(slot => pickRarity(rng) -> pickPrintOfRarity(rng))
```

**Consecuencia:** afinar la fidelidad de un sobre es un `UPDATE` en la BD, no un despliegue.
