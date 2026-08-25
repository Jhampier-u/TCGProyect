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
**Estado:** ✅ **ACEPTADA — `mysql2` + SQL plano + migrador propio**
**Fecha propuesta:** 2026-08-25 · **Fecha decidida:** 2026-08-25 (S011)

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

**DECISIÓN: `mysql2` + SQL plano + migrador propio.** Sin ORM y sin *query builder*.

**Justificación, con lo aprendido entre S002 y S010:**

1. **Ningún ORM modela este esquema.** Columnas generadas (`STORED` y `VIRTUAL`), índice
   multivaluado sobre JSON, `FULLTEXT`, `CHECK`. Cualquier opción acabaría tratando el DDL como SQL
   plano igualmente, así que el ORM sólo aportaría una capa que hay que puentear.

2. **Las consultas son pocas y muy específicas.** `INSERT ... ON DUPLICATE KEY UPDATE` por lotes
   sobre claves naturales, precarga del pool `(set_id, rarity_id, in_boosters)`, paginación keyset.
   Un *query builder* no las hace más claras; las hace más indirectas. Y varias dependen de que el
   plan de ejecución use un índice concreto — algo que se verifica leyendo el `EXPLAIN` del SQL que
   uno escribe, no del que genera una librería.

3. **Descartado también Kysely/Drizzle** (que sí se barajaron). Añadirían dependencia y superficie
   de auditoría para envolver una decena de consultas que ya sabemos escribir. El tipado se consigue
   igual con repositorios tipados a mano sobre `mysql2`.

**Migrador propio en vez de `umzug`/`dbmate`:** son ~100 líneas (tabla `schema_migrations`, leer
`db/migrations/*.up.sql` en orden, ejecutar las pendientes en transacción cuando el motor lo
permita). Menos que integrar y configurar una librería, sin dependencia nueva, y con la ventaja de
entenderlo por completo cuando falle a las 3 de la mañana.

**Reversible:** si en el futuro las consultas se multiplican, se puede introducir un *query builder*
sobre el mismo driver sin tocar ni el esquema ni las migraciones.

**Consecuencia:** el acceso a datos vive en `apps/api/src/db/`, tras interfaces de repositorio. El
orquestador de ingesta y el job de imágenes dependen de las interfaces, no de `mysql2`.

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

**IMPLEMENTADO en S012** (`apps/api/src/packs/`). Precisiones sobre este boceto:

1. **PRNG: xoshiro128\*\***, no mulberry32. La semilla persistida son 128 bits y mulberry32 tiene
   estado de 32: habría que tirar tres cuartas partes de la entropía.
2. **El orden de consumo del PRNG es parte del contrato.** Por slot: una llamada para la rareza, una
   para la impresión, una para el foil. **Siempre las tres**, aunque `foil_chance` sea 0. Cambiarlo
   invalida todas las aperturas anteriores.
3. **Respaldo cuando el set no tiene una rareza.** Otras del mismo slot por peso, luego cualquiera
   del set por escasez. Se registra la rareza **entregada**, no la pedida (P-018): si no, `open()` y
   `replay()` se contradicen y RN-01 deja de significar nada.
4. La reproducción lee `pack_opening_cards`, **nunca** re-ejecuta el PRNG (P-005). Verificado
   modificando la plantilla después de abrir.

**Validado con 3.000 sobres reales:** super 74,87 % / ultra 16,77 % / secret 8,37 %, frente a los
75 / 16,67 / 8,33 publicados por Konami.

---

## ADR-007 — Framework HTTP de la API
**Estado:** ✅ **ACEPTADA — Fastify**
**Fecha:** 2026-08-25 (S013)

**Contexto.** H3 expone el catálogo por HTTP. Hasta ahora el backend no tenía puerta de entrada.

| Opción | Encaje |
|---|---|
| **Fastify 5** | Validación y **serialización por esquema** integradas, tipado bueno, rápido, ecosistema maduro |
| Express 5 | Omnipresente y conocido, pero sin validación integrada y con ergonomía de la era callback |
| Hono | Muy ligero y basado en estándares web; pensado para *edge*, ecosistema menor sobre Node puro |

**DECISIÓN: Fastify.** Y el motivo decisivo no es el rendimiento, sino la **serialización por esquema**.

Fastify no sólo valida la entrada: al serializar la respuesta **elimina todo campo que no esté en el
esquema declarado**. Aplicado a este proyecto, eso convierte el invariante más caro que tenemos en
una garantía estructural:

> **`card_prints.image_source_url` no puede filtrarse al frontend.**

Ese campo apunta a `images.ygoprodeck.com`, y servirlo al navegador es exactamente el hotlinking que
castiga con lista negra de IP permanente (P-001). Con Express, evitarlo depende de que nadie escriba
nunca un `res.json(row)` de más. Con Fastify, un campo que no esté en el esquema **no sale**, aunque
la consulta lo traiga.

Los beneficios secundarios también cuentan: la API de catálogo tiene muchos parámetros de consulta
(juego, set, rareza, rangos numéricos) y validarlos en la frontera con JSON Schema evita repartir
comprobaciones por todo el código.

**Consecuencia:** el servidor vive en `apps/api/src/api/`, separado de `apps/api/src/http/`, que es
el cliente **saliente** hacia las tres APIs externas. Dos cosas distintas que conviene no confundir.

---

## ADR-008 — Estrategia de autenticación
**Estado:** ✅ **ACEPTADA — Argon2id + JWT de vida corta**
**Fecha:** 2026-08-25 (S014)

**Contexto.** H6 introduce cuentas. Todo lo que el usuario posee —colección, mazos, historial de
aperturas— cuelga de su identidad, así que equivocarse aquí compromete el producto entero.

### Hash de contraseñas: Argon2id

Ya estaba fijado en `02_Stack_Tecnologico.md` y se confirma. Se usa **`@node-rs/argon2`** y no el
paquete `argon2`: el primero trae binarios precompilados y no exige herramientas de compilación en la
máquina de desarrollo, que en Windows es una fuente clásica de fricción.

Parámetros: los recomendados por OWASP (19 MiB de memoria, 2 iteraciones, paralelismo 1). Son el
punto en que un ataque por fuerza bruta resulta caro sin que el login se vuelva lento.

### Sesión: JWT y no cookie de sesión en servidor

| | JWT | Sesión en servidor |
|---|---|---|
| Estado | Ninguno; escala sin almacén compartido | Requiere Redis o tabla de sesiones |
| Revocación | **No se puede revocar antes de que expire** | Inmediata |
| Encaje | El frontend es una SPA que ya habla con una API | Igual de válido |

Se elige **JWT** por coherencia con `.env.example`, que ya preveía `JWT_SECRET`, y porque el
proyecto ya tiene Redis reservado para otra cosa (cuotas) y no conviene acoplarlo a la sesión.

**El coste asumido es real y conviene decirlo:** un token robado sigue siendo válido hasta que
caduca. Se mitiga con **caducidad corta (1 hora)**. Si más adelante hace falta revocación inmediata
—expulsar una cuenta comprometida— habrá que añadir una lista de revocación en Redis. No se hace
ahora porque sería infraestructura sin caso de uso.

### Decisiones defensivas que NO son opcionales

1. **El secreto JWT no tiene valor por defecto.** El servidor **se niega a arrancar** si falta o si
   es demasiado corto. Un secreto por defecto en producción es una cuenta de administrador regalada.
2. **Login sin enumeración de usuarios.** Mismo mensaje y mismo coste temporal tanto si el correo no
   existe como si la contraseña es incorrecta: si no existe, igualmente se verifica contra un hash
   señuelo. Sin eso, el tiempo de respuesta delata qué correos están registrados.
3. **Límite de intentos en el login.** Sin él, Argon2id sólo encarece cada intento; no impide
   probar millones.
4. **El hash nunca sale en una respuesta.** Lo garantiza el mismo mecanismo que P-001: los esquemas
   de respuesta de Fastify eliminan lo no declarado (ADR-007).