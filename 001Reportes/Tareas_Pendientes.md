# Tareas Pendientes

**Última actualización:** 2026-08-27 (S028) · **Total abiertas:** 1 — T-083 (🟡), no bloqueante

Leyenda de prioridad: 🔴 crítica · 🟠 alta · 🟡 media · ⚪ baja

## Hito H0 — Fundamentos ✅ COMPLETADO (S019)

T-004 cerrada: `docker compose up --build` levanta mysql, redis, api y web sin ningún paso manual
previo. Sólo queda una tarea, y depende de ti, no del proyecto.

| ID | Tarea | Agente | Prio | Depende de |
|---|---|---|---|---|
*(T-005 cerrada en S028: la clave está puesta y verificada.)*

## Hito H1 — Esquema de datos ✅ COMPLETADO

Sin tareas abiertas. T-006, T-007 y T-008 cerradas y verificadas en MySQL 8.0.42.

## Hito H2 — Ingesta ✅ COMPLETADO

Sin tareas abiertas. Los 3 adaptadores, el cliente con límite de tasa y el job de imágenes están
hechos y verificados contra los orígenes reales.

**El orquestador (`IngestService`) está construido y verificado** contra MySQL real (T-021, S011).

## Hito H7 — Constructor de mazos ✅ COMPLETADO (S022)

Motor de reglas (S020), interfaz (S021) e import/export (S022), los tres verificados.
**Con H7 se cierra la última épica de producto del alcance v1.0.**

| ID | Tarea | Agente | Prio |
|---|---|---|---|

## Hito H8 — Endurecimiento 🟡 EN CURSO

**H8a — Suite E2E ✅ hecho (S023).** Playwright sobre Docker, 6 recorridos en verde. Cerró T-040 y
T-053. Quedan los otros dos sub-proyectos:

### H8b — Seguridad ✅ hecho (S024)

T-051 (401 antes que 400) y T-062 (límites por ruta), verificados. Anotado para el día que haya más
de una réplica del API: los contadores están **en memoria**, así que el límite efectivo pasaría a ser
N veces el configurado y habría que conectarlos a un almacén compartido.

### H8c — Deuda técnica ✅ COMPLETADO (S028)

Las ocho cerradas: T-016, T-019, T-022, T-023, T-034, T-035, T-050 y T-061.

**T-034 resultó ser otra cosa de lo que ponía en la ficha.** Estaba descrita como un problema de los
sets anteriores a 2020; medido, los modernos estaban peor (MAMS al 36,4 %, por debajo del set de
2002). Ver **P-021**. De medirlo salieron tres tareas nuevas, abajo.

### Lo que salió de medir el techo de completitud (S028)

**T-071 y T-072 también cerradas.** T-072 empezó como "la suite no se puede relanzar" y acabó
destapando dos defectos del límite de tasa: **P-037** (las imágenes se comían el presupuesto del
usuario) y **P-038** (el tope global no cubría ninguna ruta del catálogo, incluida la búsqueda
FULLTEXT).

**T-068, T-069 y T-070 cerradas en la misma sesión.** El techo de completitud ya no existe en ningún
juego y los productos que no son sobres han dejado de ofrecerse. Lo que sigue abierto salió de
hacerlas.

| ID | Tarea | Agente | Prio |
|---|---|---|---|
| T-083 | **P-040**: cambiar la rareza de una impresión de Yu-Gi-Oh! la DUPLICA en vez de actualizarla, porque el `external_id` lleva la rareza dentro. Se mitigó a mano borrando 110 huérfanas; falta que la ingesta retire lo que un set ya no produce — sin borrar lo que una apertura referencia (P-005) | Backend | 🟡 |

### Además, anotado al hacer T-035

| ID | Tarea | Agente | Prio |
|---|---|---|---|

## Deuda técnica detectada en S004

Esta lista se mantenía en paralelo a la de H8c y llevaba dos sesiones repitiendo tareas ya cerradas.
Se deja sólo lo abierto; lo demás está en `Tareas_Realizadas.md`, que es donde debe estar.

**Ninguna abierta.** Cerradas: **T-040** (S023, con Playwright en vez de Cypress), **T-019** (S026),
**T-035** (S027) y **T-034** (S028).

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

### Anotado al ampliar la ingesta de Pokémon (S028)

| ID | Tarea | Agente | Prio |
|---|---|---|---|
*(T-075 cerrada en S028.)*
