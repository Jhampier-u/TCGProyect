# Registro de Problemas

**Última actualización:** 2026-08-26 (S024) · **Abiertos:** 5 · **Cerrados:** 25

Severidad: 🔴 crítica · 🟠 alta · 🟡 media · ⚪ baja

---

## P-001 ✅ CERRADO · YGOPRODeck blacklistea la IP por hotlinking de imágenes
**Estado:** CERRADO el 2026-08-25 (S010) — implementado y verificado en T-014
**Origen:** Guía oficial de la API v7 de YGOPRODeck.
**Detalle:** la documentación es explícita: descargar cada imagen **una sola vez**, re-hospedarla
y no enlazar en caliente. El incumplimiento resulta en **blacklist de IP**. Un frontend que
renderice 30 cartas por sobre apuntando a su CDN dispara esto en minutos.
**Impacto:** pérdida total del acceso a YGO. Recuperación incierta.
**Mitigación:** pipeline `image-harvest` obligatorio (T-014) + invariante "el front nunca recibe
URL externa" (`004Arquitectura/01_Estrategia_APIs.md`).
**RESUELTO en S010 (T-014).** El job `image-harvest` descarga una vez, convierte a WebP y
re-hospeda. Tres salvaguardas independientes contra pedir dos veces la misma imagen:

1. **Se consulta el disco antes de descargar.** Si el fichero ya está, no se pide al origen — ni
   siquiera aunque la base de datos diga que falta.
2. **Disco primero, base de datos después.** Si el proceso muere entre ambos pasos, la salvaguarda 1
   evita la segunda descarga. Al revés, una fila apuntaría a un fichero inexistente.
3. **Tope de descargas por ejecución** (5.000 por defecto). No es una optimización: es un freno de
   mano. Un fallo que impidiera persistir `image_local_path` convertiría el job en un bucle que pide
   las mismas imágenes indefinidamente, y contra YGOPRODeck eso es una lista negra permanente.

**Verificado con descargas reales de los tres orígenes** (muestra deliberadamente pequeña: 2 por
juego, porque verificar el pipeline no justifica pedir más de lo imprescindible):

| Medición | Resultado |
|---|---|
| Primera ejecución | 6 descargadas, 0 fallidas, 3,2 s |
| **Segunda ejecución** | **0 descargas, 6 omitidas** — la salvaguarda funciona |
| Reducción de tamaño | 2.102 KB → 109 KB (**94,8 %**) |
| Rutas locales y relativas | 6 de 6 · ninguna contiene `http` |

**El invariante está codificado, no confiado:** `isSafeLocalPath()` rechaza `http://`, `//cdn/`,
rutas absolutas, unidades de Windows y `..`. Hay un test que lo aplica a todas las rutas que el job
genera. Debería usarse también en el serializador de la API cuando exista (H3).

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

## P-012 ✅ CERRADO · El contador de cuota en memoria se pierde al reiniciar el worker
**Estado:** CERRADO el 2026-08-25 (S009) — resuelto en T-017
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
**RESUELTO en S009 (T-017).** `RedisQuotaStore` sobre una interfaz `RedisLike` mínima (`incr`,
`decr`, `expire`, `get`), que satisfacen tal cual tanto `ioredis` como `node-redis` sin añadir
dependencia al proyecto.

**Dos defensas independientes contra el vuelco de día:**
1. La fecha UTC forma parte de la **clave** (`tcg:quota:api.pokemontcg.io:2026-08-25`). Al cambiar
   el día se cuenta en una clave nueva aunque el TTL fallara. Ésta es la que garantiza la corrección.
2. TTL hasta la medianoche UTC, sólo para que las claves viejas no se acumulen.

`INCR` es atómico, así que dos workers concurrentes no pueden colarse por encima del límite — que es
justo el motivo de contar en Redis y no en cada proceso. Cuando la cuota está agotada se compensa
con `DECR` para que `used()` no se infle en los paneles.

**Verificado:** 10 tests, incluido el que reproduce el escenario original — un store nuevo (worker
reiniciado) sobre el mismo Redis lee 5 de 10 consumidas y sólo permite 5 más.

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

## P-014 ✅ CERRADO · El pool de sobres incluía cartas que NUNCA salen en un sobre
**Estado:** CERRADO el 2026-08-25 (S008) — corregido en T-018
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

**APLICADO en S008 (T-018).** Migración `0004_add_in_boosters` + `DomainPrint.inBoosters` +
mapeo en los dos adaptadores.

### Lo que estábamos entregando mal, medido

Ingesta real de tres sets con perfiles distintos:

| Set | Catálogo | Pool de sobres | Descartado |
|---|---|---|---|
| Secret Lair Drop (`sld`) | 2706 | **0** | **100 %** |
| Bloomburrow (`blb`) | 398 | 281 | 29,4 % |
| The List (`plst`) | 5117 | 4321 | 15,6 % |

Y el desglose de Bloomburrow por rareza es lo verdaderamente revelador:

| Rareza | Pool antiguo | Pool correcto | Cartas imposibles |
|---|---|---|---|
| **rare** | 129 | **60** | **69** |
| **mythic** | 45 | **20** | **25** |
| common | 118 | 101 | 17 |
| uncommon | 106 | 100 | 6 |

**Más de la mitad del pool de raras era inalcanzable en un sobre real.** Ejemplos concretos que el
simulador antiguo podía entregar como rara de Bloomburrow: *Sword of Vengeance* (#395),
*Colossification* (#392), *Mind Spring* (#389) — números de coleccionista por encima del rango
normal del set, todos ellos "Special Guests" que sólo aparecen en otros productos.

### El índice sigue sirviendo a los dos casos
- Con filtro: `Covering index lookup (set_id=1, rarity_id=3, in_boosters=1)`
- Sin filtro (catálogo): `Covering index lookup (set_id=1, rarity_id=3)` — el prefijo de 2 columnas
  sigue valiendo.

### Riesgo residual documentado
El rollback de la 0004 **pierde el dato**: al eliminar la columna y volver a crearla, todo queda a
`DEFAULT 1`. Verificado (8221 de 8221 volvieron a 1). Queda avisado en el propio fichero `.down.sql`:
tras un ciclo de rollback hay que **re-ingestar MTG**.

---

## P-015 ✅ CERRADO · El nombre NO identifica una carta en Pokémon TCG
**Estado:** CERRADO el 2026-08-25 (S009) — resuelto en el diseño de T-013
**Origen:** análisis de la API real antes de escribir el adaptador.

**Detalle.** El diccionario de datos planteaba `oracle_key = nombre normalizado` para PTCG, porque
la API no expone un identificador conceptual. **Los datos reales lo desmienten.**

En el set `sv1` hay **258 cartas y sólo 175 nombres distintos**. Y las homónimas no son
reimpresiones: son cartas **realmente distintas**.

| id | nombre | PS | ataque | rareza |
|---|---|---|---|---|
| `sv1-16` | Tarountula | 40 | String Haul | common |
| `sv1-17` | Tarountula | 40 | String Shot | common |
| `sv1-18` | Tarountula | **60** | **Surprise Attack** | common |
| `sv1-199` | Tarountula | 40 | String Shot | illustration_rare |

Con clave por nombre, las cuatro habrían colapsado en una sola fila de `cards` y el
`ON DUPLICATE KEY UPDATE` habría dejado el `game_data` de la última ingerida. **En un solo set se
habrían perdido 83 cartas.**

**Solución:** `oracleKey = id` de la API (`sv1-16`). Para PTCG, `cards` y `card_prints` quedan 1:1,
lo cual refleja honestamente lo que el origen ofrece.

**Lo que NO se rompe:** la regla de mazo "máximo 4 copias por nombre" (RN-04) sigue funcionando,
porque el validador agrupa por `cards.name`, que sigue ahí.

**Coste aceptado:** `sv1-17` y `sv1-199` **sí** son la misma carta (mismos PS, mismo ataque, distinta
ilustración) y quedan como dos filas conceptuales. Es una sobre-división inocua: dos filas con datos
idénticos. La alternativa —un hash de contenido— sería más exacta pero frágil ante cualquier cambio
de campos en el origen.

**Cuarto caso de la misma familia** (P-010 Nidoran, P-013 los dos `set_code`, y éste): una clave
natural que *parece* única, un `ON DUPLICATE KEY UPDATE`, y datos que desaparecen sin un error.

---

## P-016 🟠 · La API de Pokémon TCG es intermitentemente inestable
**Estado:** ABIERTO — mitigado, pero es un riesgo operativo permanente
**Origen:** medido el 2026-08-25 durante T-013.

**Detalle.** Sondeo de 8 peticiones idénticas repetidas:

| Petición | 200 | Errores |
|---|---|---|
| `/v2/sets?pageSize=250` | 3 | 5 (500, 502) |
| `/v2/sets?pageSize=1` | 2 | 6 (500, 502) |

**No es un límite de paginación** — el primer sondeo lo sugería, pero repetir la misma petición
demostró que los fallos son independientes del tamaño de página. Los 502 vienen de Cloudflare con
`error_name: origin_bad_gateway`: el origen está sobrecargado.

**Mitigación aplicada:** `maxRetries: 8` para `api.pokemontcg.io` (en vez de 5). Con 9 intentos y
~30 % de éxito, la probabilidad de perder una página baja del 12 % al ~4 %.

**Pero no basta.** Durante la verificación de S009 una ingesta **agotó los 9 intentos y falló**.
El reintento posterior fue a la primera. Consecuencias operativas:
- La ingesta de PTCG **debe** poder reanudarse. Ya está previsto: `sets.ingested_at` es el
  checkpoint de ADR-004.
- Los reintentos consumen cuota diaria. Con la API a este ritmo, una ingesta completa puede gastar
  el triple de peticiones de lo previsto. El contador de T-017 lo hace visible.
- **El cortocircuito NO llegó a abrirse** en ninguna prueba, porque los éxitos intercalados
  reinician el contador de fallos consecutivos. Es el comportamiento correcto: el origen no está
  caído, está degradado.

---

## P-017 ✅ CERRADO · `sets.external_id` VARCHAR(64) tumbaba la ingesta entera de Yu-Gi-Oh!
**Estado:** CERRADO el 2026-08-25 (S011) — migración 0005
**Origen:** **la primera ejecución del orquestador real.**

**Detalle.** Para Yu-Gi-Oh! la clave natural de un set es su **nombre** (decisión de T-012:
`set_code` se repite en 142 casos, ver P-013). Y hay nombres que superan de largo los 64 caracteres:

```
"Trials of the Pharaoh - Match of the Millennium & Twisted Nightmares promotional card"
-> 85 caracteres
```

**16 de los 1032 sets** desbordan la columna. Longitudes máximas medidas:

| Juego | `external_id` máx. | Sets afectados |
|---|---|---|
| MTG | 6 | 0 |
| **YGO** | **85** | **16** |
| PTCG | 11 | 0 |

**Impacto: no se perdían 16 sets — no entraba ninguno.** El upsert por lotes es una sola sentencia,
así que el error 1406 abortaba el `INSERT` completo y con él la ingesta de todo el juego.

**Por qué no se detectó antes.** Las verificaciones de S006 a S010 insertaban **un set cada vez**,
elegido a mano. Ninguna ejercitó el upsert del catálogo completo. La primera ejecución del
orquestador lo destapó en el primer intento.

**Solución:** `VARCHAR(255)`. El máximo real es 85; la clave `UNIQUE (game_id, external_id)` ocupa
1 + 255×4 = 1021 bytes, muy por debajo del límite de 3072 de InnoDB con `ROW_FORMAT=DYNAMIC`.
`sets.name` se deja en 160: su máximo también es 85 y ahí el margen ya bastaba. **Se amplía sólo lo
que realmente rompió.**

**El rollback falla a propósito** si ya hay sets de YGO ingestados: MySQL rechaza el `MODIFY` en vez
de truncar en silencio. Perder la clave natural de 16 sets sería peor que no poder deshacer.

**Lección:** es el quinto problema de longitud/unicidad de clave (P-009, P-010, P-013, P-015 y éste).
Y el primero que sólo aparece **a escala**: probar con una muestra elegida a mano no ejercita el
mismo camino que procesar el catálogo entero.

---

## P-018 ✅ CERRADO · El motor registraba la rareza PEDIDA, no la entregada
**Estado:** CERRADO el 2026-08-25 (S012)
**Origen:** primera tanda de sobres contra el catálogo real.

**Detalle.** Cuando el set no tiene ninguna carta de la rareza que el slot pide, el motor recurre a
otra (respaldo diseñado a propósito). Pero registraba en `OpenedCard.rarityCode` la rareza **pedida**,
no la de la carta realmente entregada.

Caso real que lo destapó: *Supreme Darkness* **no tiene ninguna carta `rare`**, pero la plantilla por
defecto de Yu-Gi-Oh! pide una en el slot 7. El motor entregaba una `common` y la etiquetaba `rare`.

**Impacto: `open()` y `replay()` se contradecían.**

| Vía | Qué decía |
|---|---|
| `open()` | `rare` — la rareza que el slot pedía |
| `replay()` | `common` — lee `card_prints.rarity_id`, la real |

RN-01 promete que una apertura es reproducible y auditable. Si las dos vías no coinciden, esa promesa
no significa nada. Además la UI habría mostrado una etiqueta de rareza falsa.

**Solución:** `#poolFor` devuelve la rareza **efectivamente usada** junto con los candidatos, y el
motor registra ésa. Verificado contra la base de datos: `open()` y la consulta a `card_prints`
coinciden en `common` para el slot 7.

**Por qué no lo detectaron los tests unitarios:** todos usaban pools con las cinco rarezas presentes,
así que el respaldo nunca se activaba en el camino que registra la rareza. Añadido test de regresión
con un pool sin `rare`.

---

## P-019 ✅ CERRADO · La plantilla por defecto de Yu-Gi-Oh! no encajaba con los sets modernos
**Estado:** CERRADO el 2026-08-25 (S015) — migración 0006
**Origen:** tanda de sobres contra *Supreme Darkness* (S012).

**Detalle.** La plantilla sembrada en T-008 (7 comunes + 1 `rare` + 1 *hit*) describe el Core Booster
clásico. Los sets modernos han cambiado:

| Rareza en *Supreme Darkness* | Impresiones | ¿La pide la plantilla? |
|---|---|---|
| `common` | 50 | Sí |
| `super_rare` | 26 | Sí |
| **`quarter_century_secret_rare`** | **25** | **No** |
| `ultra_rare` | 14 | Sí |
| `secret_rare` | 10 | Sí |
| `rare` | **0** | Sí — y no existe |

Dos consecuencias medidas sobre 3.000 sobres:
1. El slot 7 pide `rare`, no hay ninguna, y el respaldo entrega una `common`: **8 comunes por sobre**
   en vez de 7.
2. Las **25 Quarter Century Secret Rare son inalcanzables**: la plantilla nunca las pide. Sólo se
   llegan a ver 100 de las 125 impresiones del pool.

**No es un fallo del motor** — el motor hace exactamente lo que la plantilla dice, y avisa cuando
recurre al respaldo. Es que la plantilla por defecto no describe este set.

**Solución: un `INSERT`, no un despliegue.** Es justo el caso de uso para el que ADR-005 hizo esto
configurable por datos. Hace falta una plantilla con `set_id` propio para los sets de la era Quarter
Century. Registrado como **T-024**.

### Medición en S014 que eleva la severidad

Con la colección ya funcionando, se abrieron **103 sobres reales** de *Supreme Darkness* y se midió
la completitud por rareza:

| Rareza | En el pool | Poseídas tras 103 sobres |
|---|---|---|
| `common` | 50 | **50** |
| `super_rare` | 26 | 25 |
| **`quarter_century_secret_rare`** | **25** | **0** |
| `ultra_rare` | 14 | 10 |
| `secret_rare` | 10 | 6 |

**Cero de 25, y no por mala suerte: la plantilla nunca las pide.** Eso pone un **techo del 80 %** a
la completitud del set.

`01_Producto.md` define al **coleccionista** como uno de los tres usuarios objetivo: *"quiere ver su
colección virtual crecer y medir su completitud por set"*. Con esta plantilla, ese usuario **no puede
completar ningún set moderno de Yu-Gi-Oh!, jamás**, y la interfaz se lo mostraría atascado en el 80 %
sin explicación. Deja de ser una imprecisión de fidelidad para ser una promesa incumplida.

---

## P-020 ✅ CERRADO · La paginación keyset perdía filas del catálogo
**Estado:** CERRADO el 2026-08-25 (S013)
**Origen:** primer recorrido completo de la API sobre datos reales.

**Detalle.** El cursor de paginación usaba `(cards.name, cards.id)`. Pero cada fila del resultado es
una **impresión**, no una carta, y varias impresiones comparten la misma carta conceptual — en
Yu-Gi-Oh! la misma carta sale en dos rarezas dentro del mismo set (P-013).

Con `cards.id` como desempate, el cursor no identifica una fila sino un **grupo**. Al pedir "lo que
va después de este cursor", la condición `c.id > ?` descartaba **todas** las impresiones restantes de
esa carta.

**Medición sobre 733 impresiones reales:**

| | Antes | Después |
|---|---|---|
| Impresiones devueltas | **723** | **733** |
| Duplicados | 0 | 0 |
| Cobertura completa | ❌ | ✅ |

**Diez filas desaparecidas del catálogo, en silencio.** Un usuario navegando nunca las habría visto,
y nada en la respuesta indicaba que faltasen.

**Solución:** el desempate pasa a `card_prints.id`, que sí es único por fila, y el `ORDER BY` a
`(c.name, p.id)`.

**Por qué no lo vieron los tests unitarios:** el catálogo falso devolvía una página fija sin paginar
de verdad. Sólo recorrer el catálogo entero contra la base de datos lo destapa. Es el mismo patrón
que P-017: **el bug que sólo aparece a escala**.

**Comprobación añadida:** el recorrido completo verifica `impresiones vistas == COUNT(*)` y ausencia
de duplicados. Cualquier regresión futura de la paginación falla ahí.

---

## P-022 ✅ CERRADO · La API filtraba 1032 URLs externas en `iconUrl`
**Estado:** CERRADO el 2026-08-25 (S016)
**Origen:** **arrancar el servidor de verdad y mirar la respuesta.**

**Detalle.** `GET /api/games/:game/sets` devolvía `iconUrl` con el valor de `sets.icon_url`, que es la
URL del **origen**:

```
"iconUrl": "https://images.ygoprodeck.com/images/sets/SUDA.jpg"
```

Con 1032 sets de Yu-Gi-Oh!, un frontend que pintara iconos de set haría **1032 peticiones de imagen
a YGOPRODeck por cada usuario que abriera el selector**. Es exactamente el hotlinking que castiga con
lista negra de IP permanente — el riesgo que P-001 llevaba quince sesiones conteniendo.

**Por qué ADR-007 no lo impidió.** La serialización por esquema sólo elimina lo **no declarado**, y
`iconUrl` **sí estaba declarado**. La garantía estructural protege de los descuidos, no de haber
declarado el campo equivocado a propósito.

**Por qué el test de S013 no lo detectó.** El test *"ninguna respuesta contiene http"* recorría
`/api/games/MTG/sets`… pero el catálogo falso devolvía `iconUrl: null`. **El test pasaba sin
comprobar nada.** Un test verde que no ejercita el caso es peor que no tenerlo: da confianza falsa.

**Solución:** `iconUrl` deja de exponerse. El job `image-harvest` cubre las cartas pero no los iconos
de set; hasta que lo haga, el campo se queda dentro de la API. Registrado como **T-035**.

**Y el test ya no puede pasar de forma vacua:** la fixture devuelve ahora una `iconUrl` real de
`images.ygoprodeck.com`, así que si alguien vuelve a exponerla, el test falla.

**Lección:** es la tercera vez que un problema sólo aparece al ejecutar de verdad (P-017 a escala,
P-020 recorriendo el catálogo entero, y éste al arrancar el servidor). Los dobles de prueba son útiles
para la lógica, pero **la fidelidad de sus datos determina lo que el test puede detectar**.

---

## P-023 ✅ CERRADO · La imagen de Docker se construía sin `dist/` y sin un solo error
**Estado:** CERRADO el 2026-08-25 (S019)
**Origen:** **levantar los contenedores de verdad** (T-004).

**Detalle.** El primer `docker compose up` dejó la API en bucle de reinicio:

```
Error: Cannot find module '/app/apps/api/dist/index.js'
```

El `docker compose build` había terminado en verde. Dentro de la imagen estaban `src/`,
`package.json` y `tsconfig.tsbuildinfo` — pero **no** `dist/`.

**Causa.** Los patrones de `.dockerignore` **no son recursivos si no llevan `**/`**. `**/dist` sí
excluía `apps/api/dist`, pero `*.tsbuildinfo` sólo excluía la raíz. El `tsconfig.tsbuildinfo` que el
host tenía de un `npm run build` anterior viajó en el contexto de build; `tsc --build` lo leyó,
concluyó que **la salida ya estaba al día** y no emitió nada. Salida cero, imagen sin código.

**Solución.** Añadir `**/*.tsbuildinfo` a `.dockerignore`.

**Por qué es un problema y no una errata.** Es la familia del *paso silencioso*, la misma de P-009,
P-010, P-013, P-015 y P-017: algo decide no hacer trabajo y no lo dice. `tsc` no avisa de que ha
optado por no compilar, así que un build incremental con un estado heredado que no le corresponde es
**indistinguible de un build correcto** salvo por lo que falta al final. Y es la cuarta vez que un
fallo sólo aparece al ejecutar de verdad (P-017 a escala, P-020 recorriendo el catálogo entero,
P-022 arrancando el servidor, y éste levantando los contenedores).

**Regla que deja:** todo estado incremental —`*.tsbuildinfo`, cachés de compilador, `dist/`— se
excluye del contexto de build de forma **recursiva**. Una compilación dentro de una imagen debe
partir siempre de cero.

---

## P-024 ✅ CERRADO · La API no ha expuesto el id de la carta desde H3
**Estado:** CERRADO el 2026-08-25 (S020)
**Origen:** montar la verificación extremo a extremo de H7, que necesita el id de la carta para
agrupar impresiones de la misma carta.

**Detalle.** `GET /api/cards` devolvía esto:

```json
{"printId": 67, "game": "YGO", "name": "A Bao A Qu, the Lightless Shadow", ...}
```

Sin `cardId`. El esquema de respuesta lo declaraba **desde S013**; el repositorio devolvía `id`.
Fastify elimina lo que el esquema no declara —y por eso `id` no salía— y omite lo que el objeto no
lleva —y por eso `cardId` tampoco—. **Los dos campos desaparecían.**

**Por qué no lo detectó nadie durante cuatro sesiones.** Ninguna pantalla lo usaba todavía. Pero el
`CardSummary` del frontend declara `cardId` desde S016: llevaba dos sesiones leyendo `undefined` sin
que nada fallara.

**Por qué TypeScript no ayuda aquí.** El esquema es un **literal JSON**, no un tipo. `tsc` verifica
que el repositorio y sus consumidores concuerden —de hecho encontró `auth-routes.ts` al renombrar—
pero no relaciona `CardSummary` con `CARD_SUMMARY`. Ese contrato no lo comprobaba nadie.

**Solución.** El repositorio emite `cardId`, que es además el nombre correcto: `printId` viaja al
lado en la misma respuesta y un `id` a secas es ambiguo.

**Relación con P-022.** Son la misma grieta por las dos caras. En P-022 el esquema declaró de más y
filtró 1032 URLs externas; aquí declaró el nombre equivocado y calló un campo durante cuatro
sesiones. La serialización por esquema garantiza que **no sale lo que no declaras**, no que **salga
lo que sí**.

**El test costó tres intentos, y los dos primeros eran vacuos:**

1. Comprobar la respuesta HTTP con un catálogo falso. **Pasaba con el bug puesto**: el doble
   devuelve la fixture ya construida y `toSummary` no se ejecuta.
2. Un objeto anotado como `CardSummary` comparado con las claves del esquema. **También pasaba**:
   Vitest borra los tipos y `tsc` **excluye los ficheros de test**, así que la anotación no la
   comprobaba nadie.
3. El bueno: exportar `toSummary`, ejecutarla de verdad y comparar las claves que produce con las
   que declara el esquema. **Verificado reintroduciendo el bug: falla.**

**Regla que deja:** un test sólo cuenta cuando se le ha visto fallar. Y cuando el doble sustituye
justo a la función que se quiere probar, el test no prueba nada.

---

## P-025 ✅ CERRADO · La imagen web de Docker llevaba rota dos sesiones
**Estado:** CERRADO el 2026-08-25 (S021)
**Origen:** abrir la aplicacion en el contenedor por primera vez desde que el frontend importa un
**valor** de `@tcg/shared`.

**Detalle.** Pantalla en blanco y un 500 del servidor de Vite:

```
[TSCONFIG_ERROR] Failed to load tsconfig '../api': Tsconfig not found
  File: /app/packages/shared/dist/index.js
```

**Causa.** La etapa `deps` del Dockerfile copia `apps/api/package.json` para que `npm ci` resuelva
el workspace. Eso hace que `/app/apps/api` **exista** en la imagen web, pero sin su `tsconfig.json`.
El `tsconfig.json` **raiz** —que tambien viajaba— referencia ese proyecto, y Vite lo sigue al
transformar `@tcg/shared`.

**Por que llevaba dos sesiones oculta.** Hasta S021 el frontend solo importaba **tipos** de
`@tcg/shared`. Los tipos se borran al compilar: el modulo **nunca se cargaba en tiempo de ejecucion**
y Vite nunca lo transformaba. La primera importacion de un **valor** —`validateDeck`— lo destapo.

En S019 se cargo el catalogo a traves del contenedor y funciono. Aquella verificacion era correcta:
simplemente no ejercitaba este camino, porque no existia todavia.

**Solucion.** El `tsconfig.json` raiz deja de copiarse a la imagen web. Solo viaja
`tsconfig.base.json`, que es de la que hereda el paquete.

**Leccion.** Un artefacto puede estar roto y **parecer sano durante sesiones enteras** si nada
ejercita el camino que lo rompe. No basta con que la verificacion sea correcta: tiene que tocar el
codigo que va a usarse.

---

## P-026 ✅ CERRADO · La cache que el spec prometia no existia
**Estado:** CERRADO el 2026-08-25 (S021)
**Origen:** **el panel de red del navegador**, en la comprobacion que T-047 tenia como criterio.

**Detalle.** El spec (E6) decia que anadir una carta pediria su detalle una vez y que React Query lo
cachearia, porque una carta cosechada es inmutable. La medicion dijo otra cosa:

```
GET /api/cards/193 -> 200      (primer anadido)
GET /api/cards/193 -> 200      (segundo anadido de LA MISMA carta)
```

**Causa.** El buscador llamaba a `api.card(printId)` **directamente**. Una llamada suelta no pasa por
la cache de React Query: no hay `queryKey`, no hay entrada, no hay cache. La promesa estaba escrita
en el spec y **no implementada en el codigo**.

**Solucion.** `queryClient.fetchQuery` con `queryKey: ['card', printId]` y `staleTime: Infinity`.
**Reverificado en el panel de red: dos anadidos, una sola peticion.**

**Leccion.** Un spec puede afirmar un comportamiento que el codigo no tiene, y compilar, y pasar los
tests, y parecer correcto al leerlo. Lo unico que lo distingue es medirlo. El criterio de aceptacion
de T-047 —"cero peticiones al cambiar cantidades"— se cumplia; el que fallaba era el otro, y estaba
escrito en el plan justo para esto.

---

## P-027 ✅ CERRADO · El validador de Pokemon no aplicaba RN-04
**Estado:** CERRADO el 2026-08-26 (S022)
**Origen:** investigar, antes de escribir T-048, con que identidad cuenta las copias cada juego.

**Detalle.** RN-04 dice "maximo 4 copias **por nombre**". `aggregate()` agrupaba por `oracleKey`, y
en Pokemon esa clave es `set-numero`: **una por impresion**. La misma carta en cuatro sets eran
cuatro cartas distintas para el motor.

**Medido**, no argumentado. En el catalogo ingestado: **775 nombres en 1279 filas** de `cards`;
`Acerola's Mischief` tiene cuatro. Ejecutado contra el motor:

```
16 copias de "Acerola's Mischief" en 4 impresiones distintas
  antes -> valido: true   problemas: []
  ahora -> valido: false  problemas: ["too_many_copies"]
```

En Magic y Yu-Gi-Oh! no ocurria: sus claves son el `oracle_id` y el passcode, estables entre
impresiones. Medido: 92/92 y 290/290 nombres unicos.

**Por que no se vio en S020.** Las cartas de Pokemon se ingestaron **al final** de aquella sesion,
despues de escribir el validador. Los tests usaban `oracle_key` inventados, todos distintos, asi que
la agrupacion parecia correcta.

**Solucion.** `aggregate()` agrupa por `entry.name`. `CardTally` gana un `oracleKey` representativo
para que la interfaz pueda seguir referenciando la carta.

**Lo que casi rompe la correccion.** Los tres validadores indexaban sus excepciones por `oracleKey` y
las consultaban con la clave de `byCard`. Cambiar la agrupacion sin reindexarlos habria dejado sin
efecto **la exencion de tierras basicas, la de Energias Basicas y la banlist entera**, en silencio.

Por eso se hizo en dos pasos deliberados: cambiar, **ver los seis rojos**, y solo entonces
reindexar. Sin ver el rojo no hay prueba de que esos tests cubrieran nada.

**Y una fixture que no se parecia a la realidad.** El caso de Nidoran daba a las dos cartas el nombre
`Nidoran` a secas, que no existe en ningun catalogo: P-013 registro que llevan los signos de macho y
hembra. Corregida a los nombres reales. Tercera vez que aparece la misma leccion (P-020, P-022,
esta): **la fidelidad de la fixture determina lo que el test puede detectar.**

---

## P-028 ✅ CERRADO · Vite bloqueaba a la suite E2E con un 403
**Estado:** CERRADO el 2026-08-26 (S023)
**Origen:** el primer test de Playwright dentro de la red de compose.

**Detalle.** El documento cargaba pero con el titulo vacio. No era Playwright:

```
HTTP/1.1 403 Forbidden
Blocked request. This host ("web") is not allowed.
```

Vite rechaza las peticiones cuyo `Host` no reconoce. Dentro de la red de compose el Host es el
**nombre del servicio** (`web`), no `localhost`.

**Solucion.** Se abre por variable de entorno (`VITE_ALLOWED_HOSTS`), no cableando `web` en el
config: la proteccion existe por un motivo y quien la abre debe decir para quien. Mismo patron que
`API_PROXY_TARGET` desde T-004.

**Un segundo tropiezo del mismo asunto.** El arreglo no surtio efecto hasta **reconstruir la
imagen**: el contenedor `web` monta solo `src/` e `index.html`, y `vite.config.ts` viaja dentro de
la imagen. Facil perder media hora ahi.

---

## P-029 ✅ CERRADO · La salvaguarda del test del volteo era inerte
**Estado:** CERRADO el 2026-08-26 (S023)
**Origen:** **el paso del plan que exigia comprobar que el test no fuera vacuo.**

**Detalle.** El spec de H8a insistia en fijar `reducedMotion: 'no-preference'` de forma explicita,
porque `PackReveal` llama a `useReducedMotion()` y con movimiento reducido revela todas las cartas de
golpe: un test corriendo asi pasaria sin ejercitar el volteo.

Se puso en `playwright.config.ts`, se comento con tres lineas de justificacion, y al comprobarlo
—forzando `'reduce'` para verlo en rojo— **el test paso igual**.

Medidos los dos caminos en la misma ejecucion:

```
POR_CONFIG=false   POR_API=true
```

`reducedMotion` en el `use` del config **no llega al navegador** en esta version; en
`browser.newContext()`, si. **La salvaguarda no hacia nada.** El test pasaba porque el valor por
defecto coincidia con el deseado: suerte, no diseno.

**Solucion.** Los tests crean su contexto a mano y **comprueban la media query** antes de medir:

```ts
expect(reduce, `la emulacion de movimiento no se aplico: se pidio "${movimiento}"`)
  .toBe(movimiento === 'reduce');
```

Asi la salvaguarda no puede volver a ser inerte sin que un test lo diga. Verificado en rojo y en
verde.

**Leccion.** Una salvaguarda en la que se confia y que no hace nada es **peor** que no tenerla. Y la
unica forma de saberlo fue el paso que obligaba a romperla a proposito. Es la cuarta vez que aparece
la misma familia (P-020, P-022, P-024, esta).

---

## P-030 ✅ CERRADO · El selector de sets se salia de su columna
**Estado:** CERRADO el 2026-08-26 (S023)
**Origen:** **mirar una captura de pantalla**, que era el sentido entero de T-053.

**Detalle.** En el editor de mazos, el `<select>` de sets se solapaba con el panel del mazo. Medido
antes y despues:

```
antes:  selectRight=703   columnaRight=604   (614 px dentro de una columna de 530)
ahora:  selectRight=589   columnaRight=604
```

Un `<select>` se dimensiona a su opcion mas larga, y los nombres de set de Yu-Gi-Oh! llegan a
"THE CHRONICLES DECK: Spirit Charmers (All-Foil Edition)". En el Catalogo hay anchura de sobra; en la
columna estrecha del editor, no.

**Por que ninguna comprobacion anterior lo vio.** En S021 y S022 la interfaz se verifico por DOM y
por panel de red. **Todo cuadraba**: los elementos existian, `.zona` eran 3, `.editor-columna` eran
2, la validacion respondia. Un DOM correcto no dice nada sobre dos cajas encima de la otra.

**Solucion.** `.filtros select { max-width: 100%; min-width: 0 }`. Y el hallazgo queda como
**asercion** en el test de mazos, midiendo el desbordamiento, para que no vuelva en silencio.

**Leccion.** Hay defectos que solo ve un ojo. Verificar por DOM es necesario y no es suficiente, y
por eso T-053 existia como tarea aparte en vez de darse por hecha.

---

## P-031 ✅ CERRADO · S023 se reporto como limpio sin serlo
**Estado:** CERRADO el 2026-08-26 (S024)
**Origen:** ejecutar `npm test` en S024 y ver `Test Files 3 failed`.

**Detalle.** Vitest recoge los `*.spec.ts` de Playwright —encajan con su patron por defecto— e
intenta ejecutarlos:

```
FAIL  e2e/src/humo.spec.ts
Error: Playwright Test did not expect test() to be called here.
```

Los 332 tests de Vitest seguian pasando, asi que la linea de resumen decia `Tests 332 passed` y solo
`Test Files` delataba el fallo.

**Se comprobo si era nuevo antes de tocar nada: no lo era.** Ya estaba en el commit de cierre de
S023, y se reporto esa sesion como "limpia".

**Por que se colo.** La salida se leyo con `tail -4`, que mostraba la linea de los tests y cortaba la
de encima. **Se reporto verde sobre una lectura incompleta.**

**Solucion.** `vitest.config.ts` excluyendo `e2e/`. Las dos suites son de herramientas distintas y no
deben mezclarse.

**Leccion.** Truncar la salida de un comando puede esconder justo la senal que importa. Un resumen de
tests tiene que incluir cuantos FICHEROS fallaron, no solo cuantos tests pasaron: son dos numeros y
el bueno puede tapar al malo.
