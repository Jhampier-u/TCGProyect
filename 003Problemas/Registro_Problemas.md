# Registro de Problemas

**Última actualización:** 2026-08-25 (S004) · **Abiertos:** 6 · **Cerrados:** 4

Severidad: 🔴 crítica · 🟠 alta · 🟡 media · ⚪ baja

---

## P-001 🔴 · YGOPRODeck blacklistea la IP por hotlinking de imágenes
**Estado:** ABIERTO — mitigación diseñada, sin implementar
**Origen:** Guía oficial de la API v7 de YGOPRODeck.
**Detalle:** la documentación es explícita: descargar cada imagen **una sola vez**, re-hospedarla
y no enlazar en caliente. El incumplimiento resulta en **blacklist de IP**. Un frontend que
renderice 30 cartas por sobre apuntando a su CDN dispara esto en minutos.
**Impacto:** pérdida total del acceso a YGO. Recuperación incierta.
**Mitigación:** pipeline `image-harvest` obligatorio (T-014) + invariante "el front nunca recibe
URL externa" (`004Arquitectura/01_Estrategia_APIs.md`).
**Verificación:** test de QA que falle si algún `image_local_path` servido contiene `http`.

---

## P-002 🟠 · Rate limits heterogéneos entre las 3 APIs
**Estado:** ABIERTO — mitigación diseñada, sin implementar
**Detalle:** Scryfall ~10 req/s con castigo por ráfagas; YGOPRODeck 20 req/s con **bloqueo de 1 hora**
al excederse; Pokémon TCG usa **cuota diaria**, no por segundo. Un único limitador global es
incorrecto para los tres a la vez.
**Impacto:** ingestas fallidas a medias, datos inconsistentes, bloqueos temporales.
**Mitigación:** `RateLimitedClient` con política **por host** (T-009), márgenes conservadores,
respeto de `Retry-After`, circuit breaker y contador de cuota diaria en Redis.

---

## P-003 ✅ CERRADO · Ninguna API expone la distribución real de rarezas por sobre
**Estado:** CERRADO el 2026-08-25 (S003)
**Detalle:** las tres APIs dan cartas y rarezas, pero no cuántas cartas de cada rareza trae un
sobre real. Además cambia por producto (MTG Play Booster ≠ Collector Booster) y por época.
**Impacto:** el simulador puede resultar poco creíble, que es el núcleo del producto.
**Mitigación:** modelar `pack_templates`/`pack_slots` como datos editables (ADR-005) y semillar
plantillas por defecto documentadas y ajustables sin desplegar.
**RESUELTO en S003 (T-008).** Las 3 plantillas por defecto están sembradas, cada número lleva
declarado su nivel de confianza (`[OFICIAL]` / `[DERIVADO]` / `[ESTIMADO]`) y se validaron por
Monte Carlo con 200.000 sobres por juego contra las tasas publicadas:
- MTG: 27,65 % de sobres con ≥2 raras/míticas frente al ~28 % publicado por Wizards.
- YGO: Ultra 0,1664/sobre (objetivo 1/6) · Secret 0,0841 (objetivo 1/12).
- PTCG: Double Rare 0,1441 (objetivo 1/7) · Hyper 0,0178 (objetivo 1/54).
**Residual (baja severidad):** quedan 3 limitaciones estructurales acotadas → **P-008**.

---

## P-004 🟡 · Volumen del volcado de Scryfall vs memoria
**Estado:** ABIERTO
**Detalle:** el bulk `default_cards` de Scryfall son cientos de MB. Un `JSON.parse` completo
revienta la memoria del proceso.
**Impacto:** el worker de ingesta muere por OOM.
**Mitigación:** parseo **en streaming** obligatorio en `ScryfallAdapter` (T-011); criterio de
aceptación de la tarea: la ingesta de MTG completa no debe superar 512 MB de RSS.

---

## P-005 🔴 · La semilla por sí sola NO garantiza reproducir una apertura (rompía RN-01)
**Estado:** MITIGADO en el esquema — pendiente de que el motor lo respete (H4)
**Origen:** detectado por el Agente Base de Datos al implementar T-006.
**Detalle:** ADR-005 dice que una apertura se reproduce ejecutando el PRNG con la semilla guardada.
Pero la salida del PRNG depende de `pack_slots`, que es **editable** (esa es justo su virtud). Si
alguien ajusta la distribución de un sobre, todas las aperturas anteriores empezarían a devolver
cartas distintas al reproducirlas. RN-01 ("apertura inmutable y auditable") se rompería en
silencio, sin ningún error visible.
**Impacto:** corrupción silenciosa del historial de aperturas y de la auditoría de la colección.
**Mitigación aplicada en el DDL:**
1. `pack_opening_cards` materializa el resultado — **es la fuente de verdad al reproducir**,
   no la semilla.
2. `pack_openings.template_snapshot JSON` congela la configuración vigente en el momento de abrir.
La semilla queda como prueba de auditoría (permite demostrar que el resultado no fue manipulado),
no como mecanismo de reproducción.
**Pendiente:** el `PackService` de H4 debe leer de `pack_opening_cards` al reproducir, jamás
re-ejecutar el PRNG. Criterio de aceptación de QA: editar `pack_slots` y comprobar que una
apertura antigua devuelve exactamente las mismas cartas.

---

## P-006 ✅ CERRADO · Error 1215 al crear `pack_templates`
**Estado:** CERRADO el 2026-08-25 (S002)
**Detalle:** MySQL rechaza (error 1215, "Cannot add foreign key constraint") una FK con
`ON DELETE CASCADE` sobre una columna que es **base de una columna generada STORED**. El diseño
inicial tenía `set_id` con FK CASCADE y a la vez alimentando la generada `set_key` STORED.
**Diagnóstico:** aislado con un caso mínimo reproducible en MySQL 8.0.42 — STORED+CASCADE falla,
VIRTUAL+CASCADE funciona, STORED+RESTRICT funciona.
**Solución:** `set_key` y `default_guard` pasan a **VIRTUAL**. Se conserva el CASCADE (borrar un
set debe borrar sus plantillas) y además se ahorra almacenamiento.
**Lección:** el DDL se valida ejecutándolo. Este fallo no era visible por revisión.

---

## P-007 🟠 · YGOPRODeck devuelve valores de rareza corruptos
**Estado:** ABIERTO — contrato definido, pendiente de implementar en T-012
**Origen:** muestreo real del set *Supreme Darkness* vía `cardinfo.php` el 2026-08-25.
**Detalle:** junto a rarezas válidas, `card_sets[].set_rarity` devolvió basura:
- `"PLatinum Secret Rare"` — errata de mayúsculas en el origen (L intercalada).
- `"2"` y `"3"` — números sueltos que no son rarezas en absoluto.

**Impacto:** un mapeo por igualdad exacta habría creado rarezas fantasma en la tabla
(`PLatinum Secret Rare` distinta de `Platinum Secret Rare`) y habría contaminado las
distribuciones de sobre. Con un mapeo estricto que descarte lo desconocido, se habrían
**perdido cartas silenciosamente**.
**Mitigación (contrato para T-012):**
1. Normalización agresiva a snake_case → `"PLatinum Secret Rare"` cae en `platinum_secret_rare`.
2. Valores numéricos o vacíos → se descartan y se cae a `common`, dejando aviso en el log.
3. Cualquier otra rareza desconocida → se inserta al vuelo con `tier = 50`. **Nunca se pierde
   una carta por no reconocer su rareza.**
**Verificación de QA:** ingestar *Supreme Darkness* y comprobar que no aparecen rarezas nuevas
con `tier = 50` que sean variantes ortográficas de una ya existente.

---

## P-008 🟡 · Limitaciones estructurales de las plantillas de sobre
**Estado:** ABIERTO — aceptadas conscientemente para v1
**Origen:** T-008. Son el residuo de P-003, no un fallo.

1. **"The List" de MTG (12,5 % del slot 7) no se modela.** Extrae cartas de *otros* sets y el
   motor sólo sabe elegir dentro del pool `(set_id, rarity_id)`. **Consecuencia medida en el
   Monte Carlo:** los sobres MTG simulados nunca alcanzan 4 raras/míticas, mientras que los
   reales lo hacen en <1 % de los casos.
2. **El slot de tierra de MTG no filtra por tipo.** Las tierras básicas son rareza `common` en
   Scryfall; distinguirlas exige filtrar por `type_line` y el pool sólo indexa `(set, rareza)`.
   *Solución prevista:* campo opcional de filtro por tipo en `pack_slots.distribution`.
3. **Sets antiguos con estructura distinta** (Draft Boosters de MTG previos a 2024, sobres
   Pokémon de la era WOTC, sobres YGO de 5 cartas) usarán la plantilla por defecto y serán
   inexactos hasta que reciban la suya propia. Es exactamente el caso de uso para el que
   ADR-005 hizo esto configurable por datos: se arregla con un INSERT, no con un despliegue.

---

## P-009 ✅ CERRADO · `rarities.code` VARCHAR(32) se desbordaba
**Estado:** CERRADO el 2026-08-25 (S003)
**Detalle:** error 1406 (*Data too long*) al ejecutar el seed T-007.
`duel_terminal_normal_parallel_rare` son 34 caracteres.
**Solución:** `rarities.code` ampliado a **VARCHAR(48)** en la migración 0001. Al no haber nada
desplegado, se corrigió el DDL en origen en vez de arrastrar un `ALTER TABLE` permanente.
**Lección:** repetida de P-006 — sólo apareció al ejecutar el SQL contra un MySQL real.

---

## P-010 ✅ CERRADO · `oracleKey` fusionaba Nidoran macho y hembra
**Estado:** CERRADO el 2026-08-25 (S004)
**Origen:** detectado **al escribir el test** de `normalizeOracleKeyFromName` (T-010).
**Detalle:** la primera versión de la función eliminaba todo carácter no alfanumérico, incluidos
los signos ♂ (U+2642) y ♀ (U+2640). Consecuencia: `Nidoran♂` y `Nidoran♀` producían ambos el
`oracleKey` `nidoran`.

Como `cards` tiene `UNIQUE (game_id, oracle_key)` y la ingesta escribe con
`INSERT ... ON DUPLICATE KEY UPDATE`, el segundo Nidoran **habría sobrescrito al primero**. Dos
Pokémon distintos colapsados en uno, sin error, sin aviso, y con una carta desaparecida del
catálogo y por tanto de los sobres.
**Solución:** los signos de género se mapean a sufijos `-m` y `-f` **antes** de eliminar los no
alfanuméricos → `nidoran-m` y `nidoran-f`.
**Test de regresión:** `normalize.test.ts` afirma explícitamente que los dos códigos **no** son
iguales.
**Lección:** el bug no estaba en el código que escribí, sino en el que **no** escribí. Apareció
sólo al buscar un caso límite para el test.

---

## P-011 ✅ CERRADO · 5 vulnerabilidades en la cadena vitest/vite, 2 específicas de Windows
**Estado:** CERRADO el 2026-08-25 (S004)
**Origen:** `npm audit` tras el primer `npm install` de T-003.
**Detalle:** las versiones inicialmente fijadas (`vitest@2`, `vite@6`) arrastraban 5 avisos,
uno **crítico**:

| Paquete | Sev. | Problema |
|---|---|---|
| vitest | 🔴 crítica | con el servidor de UI escuchando, se puede leer y ejecutar un fichero arbitrario |
| vite | 🟠 alta | path traversal en `.map` de deps optimizadas · **divulgación de hash NTLMv2 vía rutas UNC en Windows** · bypass de `server.fs.deny` en rutas alternativas de Windows |
| esbuild | 🟡 moderada | cualquier web puede hacer peticiones al servidor de desarrollo y leer la respuesta |

Las dos de `vite` marcadas en negrita son **específicas de Windows**, que es la plataforma de
desarrollo de este proyecto: no eran teóricas.
**Solución:** `vitest` → 4.1.11, `vite` → 8.2.2, `@vitejs/plugin-react` → 6.1.0.
**Verificación:** `npm audit` → **0 vulnerabilidades**. Suite de tests y build siguen verdes tras
el salto de versión mayor.
**Rutina propuesta:** `npm audit` forma parte del criterio de aceptación de cualquier tarea que
toque dependencias, no de una revisión final de seguridad.