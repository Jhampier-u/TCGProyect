# Tareas Pendientes

**Última actualización:** 2026-08-26 (S027) · **Total abiertas:** 4 — 3 del proyecto (T-034, T-065, T-066) + T-005, que depende de ti

Leyenda de prioridad: 🔴 crítica · 🟠 alta · 🟡 media · ⚪ baja

## Hito H0 — Fundamentos ✅ COMPLETADO (S019)

T-004 cerrada: `docker compose up --build` levanta mysql, redis, api y web sin ningún paso manual
previo. Sólo queda una tarea, y depende de ti, no del proyecto.

| ID | Tarea | Agente | Prio | Depende de |
|---|---|---|---|---|
| T-005 | Obtener API key de Pokémon TCG en dev.pokemontcg.io | Usuario | 🟠 | — |

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

### H8c — Deuda técnica 🟡 siete de ocho hechas (S027)

Cerradas: T-016, T-019, T-022, T-023, T-035, T-050 y T-061. **Queda una**:

| ID | Tarea | Agente | Prio |
|---|---|---|---|
| T-034 | Plantillas por época para los sets de Yu-Gi-Oh! anteriores a 2020. Hoy topan la completitud en ~70,7 % (P-021). La mayor de las ocho | Base de Datos / Backend | ⚪ |

### Además, anotado al hacer T-035 y T-022

| ID | Tarea | Agente | Prio |
|---|---|---|---|
| T-066 | **Mostrar los iconos de set en la interfaz.** Ya están cosechados y la API los sirve en `iconPath`, pero el selector es un `<select>` nativo y un `<option>` **no puede** contener una imagen. Enseñarlos exige cambiar el control, que es una decisión de diseño, no un retoque: se deja fuera de T-035 en vez de hacerla a escondidas | Frontend | ⚪ |
| T-065 | **P-032**: la migración `0001` fija el nombre de la base con un `USE proyecto_tcg`, así que el migrador ignora la conexión. Hoy hay una guarda en `db:migrate` que se niega a arrancar contra otra base; el arreglo de verdad es un juego de migraciones que no fije el nombre | Base de Datos | 🟡 |

## Deuda técnica detectada en S004

Esta lista se mantenía en paralelo a la de H8c y llevaba dos sesiones repitiendo tareas ya cerradas.
Se deja sólo lo abierto; lo demás está en `Tareas_Realizadas.md`, que es donde debe estar.

| ID | Tarea | Agente | Prio |
|---|---|---|---|
| T-034 | Plantillas por época para los sets de Yu-Gi-Oh! **anteriores a 2020**. Hoy topan la completitud en ~70,7 % (ver **P-021**). La tabla histórica de Yugipedia ya está capturada en P-019; el bloqueo real es que hace falta un paso de asignación de plantilla posterior a la ingesta | Base de Datos / Backend | ⚪ |

Cerradas desde entonces: **T-040** (S023, con Playwright en vez de Cypress), **T-019** (S026) y
**T-035** (S027).

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
