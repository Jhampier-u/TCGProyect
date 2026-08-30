# Tareas Pendientes

**Última actualización:** 2026-08-28 (S034) · **Total abiertas:** 5 — las de H9b

Leyenda de prioridad: 🔴 crítica · 🟠 alta · 🟡 media · ⚪ baja

## Hito H9 — Identidad propia por juego 🟡 EN CURSO (S033)

Spec aprobado: `15_Spec_H9ab_Pokemon.md`. Se hace **Pokémon entero primero** y sirve de plantilla
probada para Magic y Yu-Gi-Oh!. Decidido con el usuario: tokens y primitivas compartidas con layouts
propios donde el dominio manda, dirección **Carpeta** para la colección y **Consulta** para el
catálogo.

### H9a — Cimientos de interfaz ✅ COMPLETADO (S034)

T-088, T-089 y T-090 cerradas: sistema de tokens con los dos temas, módulo de cadenas con la regla de
ASCII por fin comprobada, y la raíz convertida en elección de juego con la portada de Pokémon.

### H9b — Catálogo de Pokémon y ficha de carta

| ID | Tarea | Agente | Prio |
|---|---|---|---|
| T-091 | **Migración: columnas generadas e índices** para `supertype`, `types[0]` y `regulation_mark`, siguiendo el patrón de `cmc`/`atk`/`hp`. Sin ella los filtros son un escaneo completo | Base de Datos | 🟠 |
| T-092 | **API: facetas y ficha**. Ojo con ADR-007: todo campo nuevo hay que declararlo en el esquema o desaparece sin error. La paginación sigue siendo keyset por `card_prints.id` | Backend | 🟠 |
| T-093 | **Catálogo «Consulta»** con el raíl de estructura del set filtrando al pulsar, chips borrables y estado en la URL | Frontend | 🟠 |
| T-094 | **Ficha de carta** con toda la información y acciones para añadir a una colección o a un mazo | Frontend | 🟠 |
| T-095 | **Reescritura de la suite E2E**: 8 recorridos rotos rehechos, 2 de invariante ampliados, y las cuatro garantías portadas (teclado, movimiento reducido, iconos locales, P-030). Selectores por rol, no por clase CSS | QA |  🟠 |

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

## Hito H8 — Endurecimiento ✅ COMPLETADO (S028)

Los tres sub-proyectos cerrados. Este encabezado decía "EN CURSO" hasta S031, tres sesiones después
de que el hito se cerrara: corregido al revisar el estado.

**H8a — Suite E2E ✅ hecho (S023).** Playwright sobre Docker. Cerró T-040 y T-053. Eran 6 recorridos
entonces; hoy son 10, con los de iconos que añadió T-066.

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

**Ninguna abierta.** T-083 cerrada en S028: la ingesta ya retira lo que el origen dejó de listar,
sin tocar lo que una apertura referencia. Con ella se cerró **P-040**.

Después, y ya fuera de H8c: **T-084** (S029) dio a Magic sus cuatro épocas de sobre, **T-085** (S030)
cerró P-008 entero enseñándole al motor a sacar cartas de otro set y a filtrar por tipo, y **T-086**
(S031) puso comprobación de tipos a los ficheros de prueba, que no la tenían.

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
