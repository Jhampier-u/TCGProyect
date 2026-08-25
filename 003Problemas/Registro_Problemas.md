# Registro de Problemas

**Última actualización:** 2026-08-25 (S007) · **Abiertos:** 5 · **Cerrados:** 8

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

## P-002 ✅ CERRADO · Rate limits heterogéneos entre las 3 APIs
**Estado:** CERRADO el 2026-08-25 (S005)
**Detalle:** Scryfall ~10 req/s con castigo por ráfagas; YGOPRODeck 20 req/s con **bloqueo de 1 hora**
al excederse; Pokémon TCG usa **cuota diaria**, no por segundo. Un único limitador global es
incorrecto para los tres a la vez.
**Impacto:** ingestas fallidas a medias, datos inconsistentes, bloqueos temporales.
**Mitigación:** `RateLimitedClient` con política **por host** (T-009), márgenes conservadores,
respeto de `Retry-After`, circuit breaker y contador de cuota diaria.
**RESUELTO en S005 (T-009).** Implementado y verificado: 38 tests con reloj virtual + prueba de
humo contra Scryfall y YGOPRODeck reales (huecos medidos de 136 y 137 ms frente al mínimo de 120).
**Residual:** el contador de cuota es en memoria y se pierde al reiniciar el worker → **P-012**.

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

## P-004 ✅ CERRADO · Volumen del volcado de Scryfall vs memoria
**Estado:** CERRADO el 2026-08-25 (S007)
**Detalle:** el bulk `default_cards` de Scryfall son cientos de MB. Un `JSON.parse` completo
revienta la memoria del proceso.
**Impacto:** el worker de ingesta muere por OOM.
**Mitigación:** parseo **en streaming** obligatorio en `ScryfallAdapter` (T-011); criterio de
aceptación de la tarea: la ingesta de MTG completa no debe superar 512 MB de RSS.

**RESUELTO en S007.** Y resultó más fácil de lo previsto: **Scryfall ya no sirve un array JSON
gigante, sino JSONL comprimido en gzip** (un objeto por línea). Eso convirtió el problema de
"escribir un analizador de JSON incremental" en "partir por saltos de línea", que es trivial y
robusto.

**Medición real** con el volcado `default_cards` completo (74 MB comprimidos):

| Métrica | Valor | Criterio |
|---|---|---|
| Impresiones procesadas | **116.752** | — |
| Tiempo | **12,5 s** | — |
| **Pico de RSS** | **210 MB** | < 512 MB ✅ |

El RSS se mantuvo plano (104 → 138 → 144 → 206 MB conforme avanzaba), sin crecer de forma
proporcional al fichero. Hay además un test que comprueba la propiedad de forma aislada con
40 MB sintéticos.

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

## P-007 ✅ CERRADO · YGOPRODeck devuelve valores de rareza corruptos
**Estado:** CERRADO el 2026-08-25 (S006) — implementado y verificado en T-012
**Origen:** muestreo vía `cardinfo.php` el 2026-08-25.

> **CORRECCIÓN DE S003.** Aquí se escribió que la basura procedía del set *Supreme Darkness*.
> Es **inexacto**. Al implementar T-012 se descubrió por qué: `card_sets` de una carta lista
> **todas** sus impresiones en **todos** los sets, así que la respuesta de `?cardset=Supreme
> Darkness` incluye entradas de otros sets. El muestreo de S003 contó rarezas sin filtrar.
> Procedencia real de cada valor corrupto:
> - `"2"` y `"3"` → sets *Legendary Modern Decks 2026* y *Legendary Arc-V Decks*
> - `"PLatinum Secret Rare"` → set *Rarity Collection 5*
>
> Filtrando por `set_name = 'Supreme Darkness'`, ese set está limpio: 5 rarezas, todas válidas.
> **La basura es real y P-007 sigue siendo válido**; sólo estaba mal atribuida.
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
**Verificación (S006):** implementado en `YgoprodeckAdapter`. Tests con las cadenas reales:
`"PLatinum Secret Rare"` → `platinum_secret_rare` (recuperada, sin aviso); `"2"` → `common` con
aviso `invalid_rarity`, **sin perder la carta**. Ingesta real de *Supreme Darkness*: 125
impresiones, 5 rarezas, **0 avisos**.

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

---

## P-012 🟠 · El contador de cuota en memoria se pierde al reiniciar el worker
**Estado:** ABIERTO — bloquea la ingesta real de Pokémon (T-017)
**Origen:** decisión consciente al implementar T-009.
**Detalle:** `InMemoryQuotaStore` cuenta las peticiones diarias a `api.pokemontcg.io` en un `Map`
del proceso. Si el worker se reinicia a mitad de una ingesta, **el contador vuelve a cero** mientras
que la cuota real en el servidor de Pokémon sigue consumida.

Con una ingesta inicial que puede tardar horas y un worker que puede reiniciarse (despliegue,
OOM, circuit breaker), el escenario no es hipotético: dos o tres reinicios bastarían para agotar
la cuota diaria real creyendo que quedan miles de peticiones. El síntoma sería una avalancha de
429 y, con ella, el cortocircuito abierto durante 15 minutos en bucle.
**Impacto:** un día entero de ingesta de Pokémon perdido, sin causa evidente en los logs.
**Mitigación prevista (T-017):** `QuotaStore` sobre Redis con clave por día y TTL a medianoche UTC.
La interfaz `QuotaStore` ya está definida precisamente para poder sustituir la implementación sin
tocar el cliente.
**Mientras tanto:** es seguro para desarrollo y tests. **No arrancar la ingesta completa de Pokémon
en producción hasta cerrar T-017.**

---

## P-013 ✅ CERRADO · `set_code` de YGOPRODeck no identifica una impresión
**Estado:** CERRADO el 2026-08-25 (S006) — resuelto en el diseño de T-012
**Origen:** inspección de la API real antes de escribir el adaptador.

Dos colisiones distintas, ambas con capacidad de **perder datos en silencio**:

**1. `set_code` se repite DENTRO de un set.** En *Supreme Darkness* hay **24 códigos duplicados**:
la misma carta, el mismo `SUDA-EN049`, en dos rarezas (*Quarter Century Secret Rare* y *Secret
Rare*). Son dos productos distintos: un sobre entrega uno u otro y un coleccionista los posee por
separado. Con `external_id = set_code` y `UNIQUE (set_id, external_id)`, el `ON DUPLICATE KEY
UPDATE` de la ingesta habría hecho que la segunda **sobrescribiera** a la primera.
*Solución:* `externalId = "{set_code}::{rarityCode}"`. Verificado: 125 impresiones a partir de 101
cartas conceptuales, **0 colisiones**.

**2. `set_code` se repite ENTRE sets.** De los 1032 sets del catálogo, sólo 644 códigos son únicos.
`JUMP` lo comparten **70 sets** distintos; `LART`, 65. Usarlo como `sets.external_id` habría
colapsado esos 70 en una sola fila.
*Solución:* `externalId = set_name`, que sí es único en los 1032 y además es la clave por la que se
consulta `cardinfo.php?cardset=`.

**Lección:** es el tercer caso de la misma familia (P-010 con Nidoran ♂/♀, y ahora estos dos). El
patrón se repite: una clave natural que *parece* única, un `ON DUPLICATE KEY UPDATE`, y datos que
desaparecen sin un solo error en los logs. **Antes de elegir una clave natural, contarla.**

---

## P-014 🔴 · El pool de sobres incluye cartas que NUNCA salen en un sobre
**Estado:** ABIERTO — requiere decisión del usuario (migración de esquema)
**Origen:** análisis del volcado real de Scryfall al implementar T-011 (S007).

**Detalle.** Scryfall marca cada impresión con un booleano `booster`: vale `false` en las cartas
que no se obtienen abriendo sobres — promos, buy-a-box, Secret Lair, art series, cartas de mazos
precondstruidos, The List…

En la muestra analizada del volcado, **el 54,7 % de las impresiones tiene `booster: false`**.
Hay sets enteros al 100 % (`prm`, `sld`, `who`).

**Nuestro esquema no guarda ese campo.** El motor de sobres elige del pool
`(set_id, rarity_id)` de `card_prints`, así que un sobre simulado de un set con promos podría
entregar cartas que físicamente no pueden salir de un sobre.

**Impacto.** Golpea el núcleo del producto. P-003 se cerró midiendo que las *distribuciones de
rareza* son fieles; de nada sirve acertar que el hueco de rara sale 1 de cada 7 veces si la carta
que entrega es una promo de Secret Lair que jamás estuvo en un sobre. El simulador dejaría de ser
creíble, que es exactamente el riesgo R-03.

**Corrección propuesta (T-018), de una sola migración:**
1. `ALTER TABLE card_prints ADD COLUMN in_boosters TINYINT(1) NOT NULL DEFAULT 1;`
2. Rehacer `idx_prints_pool` como `(set_id, rarity_id, in_boosters, id)` para que siga siendo
   covering al filtrar.
3. Añadir `inBoosters: boolean` a `DomainPrint` en `@tcg/shared`.
4. Mapearlo en los adaptadores: `raw.booster ?? true` (MTG). YGO y PTCG no exponen el campo, así
   que por defecto `true` — es correcto, ambos catálogos son casi enteramente de sobre.

**Por qué no se ha hecho ya:** cambia el esquema y el contrato de dominio compartido, que va más
allá de lo que pedía T-011. Se documenta con la medición para que la decisión sea informada.