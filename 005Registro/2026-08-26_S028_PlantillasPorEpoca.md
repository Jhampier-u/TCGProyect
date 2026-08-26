# S028 — El techo de completitud, en los tres juegos (T-034, T-068, T-069, T-070)
**Fecha:** 2026-08-26 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sigue."* — la última de las ocho tareas de deuda técnica de H8c.

**T-034 cerrada. Con ella, H8c completo y H8 cerrado.**

---

## Lo primero fue medir, y la medición cambió la tarea

T-034 llevaba trece sesiones fichada como *"plantillas por época para los sets de Yu-Gi-Oh! anteriores
a 2020"*. Antes de diseñar nada se midió el techo de completitud de **todos** los sets:

```
set                     salida       pool  techo   inalcanzables
LOB  Legend of Blue Eyes 2002-03-08   358  70,7 %  rare, short_print, super_short_print
TDGS Duelist Genesis     2008-09-02   111  72,1 %  rare, ultimate_rare, ghost_rare
BOSH Breakers of Shadow  2016-01-14   100  76,0 %  rare, short_print
ETCO Eternity Code       2020-04-30   105  95,2 %  starlight_rare
LAVD Legendary Arc-V     2026-08-06   153  88,2 %  starlight_rare, new
MAMO Magnificent Monst.  2026-09-04   206  68,9 %  starlight_rare, grand_master_rare
MAMS Magnificent Maest.  2026-11-12    66  36,4 %  starlight_rare, grand_master_rare
```

**Los sets modernos estaban peor que el de 2002.** MAMO al 68,9 %, MAMS al 36,4 %. P-019 se cerró en
S015 con la plantilla moderna y el techo seguía ahí: esa plantilla pide
`quarter_century_secret_rare` y estos sets traen `starlight_rare` y `grand_master_rare`.

El respaldo del motor no lo tapa y no podía taparlo: `#poolFor` actúa cuando la rareza **pedida** está
vacía, nunca añade una que ninguna slot nombra. El motor hace exactamente lo que la plantilla dice.

Con eso delante, el usuario amplió el alcance de *"los sets pre-2020"* a *"el techo entero"*.

## La época es una propiedad de la plantilla, no del set

Ése era el bloqueo real. La solución apuntada en S015 era una plantilla por set asignada según fecha,
lo que exige un paso de asignación **posterior a la ingesta**: miles de filas y hay que repetirlo con
cada set nuevo. Trece sesiones parada por un paso que nadie quería escribir.

`pack_templates` gana `valid_from` / `valid_to` y `findTemplate` resuelve en tres niveles —set,
época, genérica—. **El paso desaparece**: lo hace la consulta que ya elegía plantilla.

Un `CASE` explícito sustituye al `ORDER BY (t.set_id IS NULL)` que había: con tres niveles, ese truco
deja de leerse solo.

## La comprobación es lo que faltaba, y encontró algo que nadie buscaba

Ni P-019 ni P-021 los detectó una prueba. Los destapó mirar aperturas reales, **con siete sesiones de
diferencia**, y el segundo se dio por resuelto sin volver a medir. Lo que faltaba no era una plantilla
mejor: era algo que midiera.

`npm run packs:cobertura` recorre cada set, resuelve su plantilla por el código real y lista las
rarezas del pool que ninguna slot pide. Sale con código 1 si encuentra alguna, para que valga como
comprobación y no sólo como informe.

**En su primera ejecución encontró P-034**, en otro juego:

```
[PTCG] BLK 99,4 % · WHT 99,4 % · inalcanzables: black_white_rare
       MEG 98,9 % · PFL · POR · CRI · PBL · inalcanzables: mega_hyper_rare
```

Siete de nueve sets de Pokémon. Los techos son del 99 % porque es **una o dos cartas por set** — pero
son las *chase*, las que un coleccionista persigue, y son las únicas que no puede obtener jamás. Un
99,4 % que deja fuera justo la carta que la gente quiere es peor que un 70 % repartido.

Fuera del alcance acordado, así que se registra y no se toca: estimar de pasada las tasas de otro
juego dentro de esta tarea sería justo lo que la marca `[ESTIMADO]` intenta evitar.

## Los pesos que son estimaciones van marcados uno a uno

Yugipedia documenta los slots, no cada rareza que un set puede traer. Los short prints, las paralelas
(`ultimate_rare`, `ghost_rare`), la `starlight_rare` y la `grand_master_rare` entran en el slot que
les toca por naturaleza, **con la aritmética del reescalado en la cabecera de cada migración**. Mismo
tratamiento que la QCSR en la `0006` y por el mismo motivo: ADR-005 hizo esto configurable por datos
para que afinar la fidelidad sea un `UPDATE`.

**`new` no entra en ninguna plantilla.** Es la cadena que YGOPRODeck usa para las cartas inéditas de
una caja de Structure Decks. Meterla haría subir un número describiendo mal el producto.

## Una rareza que estaba en la base por accidente

`ensureRarity` inserta las rarezas desconocidas con `tier = 50`, y el tier es lo que ordena el
respaldo del motor. `grand_master_rare` estaba ahí porque la puso la ingesta, no el seed: una
plantilla no debe depender de algo que llegó por descubrimiento. La `0011` la siembra con un tier de
verdad, y ese tier va marcado como **juicio**, no como dato publicado.

## Verificación

**300 sobres reales de Legend of Blue Eyes**, con el motor de verdad:

```
9 cartas por sobre
slot 8:  rare 64,3 %  ·  super_rare 23,0 %  ·  secret_rare 7,0 %  ·  ultra_rare 5,7 %
rarezas vistas: common, rare, secret_rare, short_print,
                super_rare, super_short_print, ultra_rare
```

Las **siete** rarezas del set, short prints incluidos: el techo levantado, medido. El slot 8 sale
cerca de lo que describe la época 1 (62,5 / 25 / 4,2 / 8,3); las desviaciones están en las dos
rarezas escasas, donde 300 muestras no dan para más.

**La precedencia, a través de `findTemplate`, no de una copia de su consulta.** Copiar el SQL en el
comando de comprobación prueba la copia, y la copia puede quedar bien mientras el original se rompe:

```
LOB    2002-03-08 -> Core Booster (hasta Light of Destruction)
TDGS   2008-09-02 -> Core Booster (Duelist Genesis - Dimension of Chaos)
BOSH   2016-01-14 -> Core Booster (Breakers of Shadow - Ignition Assault)
ETCO   2020-04-30 -> Core Booster (Eternity Code en adelante)
```

Cada uno en el **primer día** de su ventana: un error de un día en cualquier corte se habría visto.

**Los dos guardianes, vistos en rojo uno por uno** antes de darlos por buenos:

```
AssertionError: "Core Booster (Breakers of Shadow…)" empieza antes de que acabe
                "Core Booster (Duelist Genesis…)"
AssertionError: expected [ 'ghost_rar' ] to deeply equal []
```

| Comprobación | Resultado |
|---|---|
| `npm test` | **354/354** en 28 ficheros |
| `tsc --build` · `vite build` · `npm audit` | limpios |
| Migraciones 0009-0011, ciclo up → down → up | correcto, mismo informe antes y después |
| Los pesos de las 4 plantillas suman 1000 | verificado con `JSON_TABLE` sobre las filas reales |
| Las 18 aperturas anteriores | intactas, con su `template_snapshot` original (P-005) |
| `npm run packs:cobertura -- --game YGO` | sólo LAVD, con `new` |

## Un agujero del Vault, tapado

**P-021 llevaba trece sesiones citada en cinco documentos y nunca se había redactado.** Existía en la
bitácora de S015 y en las listas de tareas, pero no en `Registro_Problemas.md`. Se ha escrito
completa —con lo que la medición de hoy le añade— y cerrada en el mismo acto. Un problema que se cita
y no está escrito es un problema que nadie puede leer.

---

# Segunda parte: T-068, el techo de Pokémon

El informe encontró el defecto en otro juego, así que se cerró en la misma sesión.

## Medir volvió a cambiar la tarea

T-068 estaba fichada como *"añadir las dos rarezas al slot del hit"*. Contando impresiones por rareza
en todo el catálogo apareció lo que el informe no dice:

```
rare_holo          0 impresiones   <- peso 267 en la plantilla
hyper_rare         0 impresiones   <- peso  18
mega_hyper_rare    6 impresiones   <- peso   0
black_white_rare   2 impresiones   <- peso   0
```

**El 28,5 % del slot del hit pedía rarezas que no existen en ningún set ingestado.** Medido sobre 300
sobres de *Pitch Black*, antes y después:

| rareza | antes | después | la plantilla pide |
|---|---|---|---|
| `rare` | **72,3 %** | 53,7 % | 54,6 % |
| `double_rare` | 12,0 % | 22,0 % | 19,5 % |
| `mega_hyper_rare` | **0 %** | 3,7 % | 2,5 % |

Siete de cada diez "hits" eran una `rare` del montón. **Pokémon tenía el mismo problema de épocas que
Yu-Gi-Oh!**, así que el mecanismo de T-034 valió tal cual — y de paso quedó demostrado que no era
específico de un juego.

Dos ventanas: `Booster Mega Evolution en adelante` (desde 2025-09-26) y `Booster Black Bolt / White
Flare`, que es de **un solo día**, porque son dos sets gemelos publicados a la vez con una rareza que
no existe en ningún otro producto.

El peso de una rareza que ya no existe se reparte **proporcionalmente**, no se le da a la mayor. Lo
segundo es lo que hace el respaldo del motor, y por eso `rare` llegaba al 72 %.

## Y el fallo de la sesión: un rollback que dejaba la base a medias (P-035)

Al probar el rollback de la 0012 **con aperturas ya hechas**:

```
ERROR 1451: Cannot delete or update a parent row (`pack_openings`,
CONSTRAINT `fk_openings_template`)
```

El primer `DELETE` ya había pasado. Quedaron dos plantillas **vivas y sin slots**, el informe pasó a
decir `techo 0.0%` en los nueve sets de Pokémon, y volver a aplicar la migración insertó un segundo
par de plantillas con la misma ventana — con dos filas empatadas, la que elige `findTemplate` depende
del orden de las filas.

**El ciclo up → down → up de la 0010 lo había dado por bueno**, y era correcto: se ejecutó **antes**
de abrir los 300 sobres de verificación, así que no había nada que restringiera el `DELETE`. La
prueba estaba bien escrita y el caso que importaba no estaba dentro. Misma familia que P-022 y P-029.

Ahora se borran las plantillas sin aperturas y las demás se **retiran**: quitarles la ventana hace
que no encajen en ninguna rama de `findTemplate`. Verificado con las 300 aperturas delante.

El `down` de la 0010 se corrigió antes de publicarse. La regla de migraciones inmutables protege el
**`up`**, que fija el estado que otras instalaciones ya tienen aplicado; un `down` que no ha
funcionado nunca en ninguna parte es un script roto, no un cambio de esquema.

## Verificación de la segunda parte

| Comprobación | Resultado |
|---|---|
| `npm test` | **358/358** en 28 ficheros |
| Suite E2E | 6 passed |
| `npm run packs:cobertura` | Pokémon **sin ningún set con rarezas inalcanzables** |
| Ciclo de la 0010 y la 0012, **con aperturas** | correcto: 2 borradas, 3 retiradas, ninguna elegible |
| Los tres guardianes de Pokémon | vistos en rojo, incluido el que rechaza una rareza de **otro juego** |
| Los pesos de las plantillas de PTCG | suman 1000, verificado con `JSON_TABLE` |

---

# Tercera parte: T-070 y T-069

## T-070 — que el informe vea lo que tuve que contar a mano

El informe medía el techo **set a set**, y por eso no vio el 28,5 % del slot de Pokémon: que una
plantilla pida algo que un set concreto no tiene es normal. Que pida algo que **no existe en todo el
juego** no lo es.

`pesoSinDestino` lo mide, y en la primera ejecución salieron los dos:

```
[YGO]  AVISO "Core Booster (Eternity Code en adelante)" slot 8: el 4.2% del peso
       pide rarezas que ningun set de YGO tiene (quarter_century_secret_rare)
[PTCG] AVISO "Booster Scarlet & Violet" slot 9: el 28.5% del peso
       pide rarezas que ningun set de PTCG tiene (hyper_rare, rare_holo)
```

**Avisa y no rompe, y el de Yu-Gi-Oh! explica por qué:** *Supreme Darkness* —el set con 25 Quarter
Century Secret Rare— no está ingestado ahora mismo. La plantilla es correcta y el aviso también.
Fallar ahí sería fallar sobre un estado legítimo.

## T-069 — qué set es de verdad un producto de sobres

Dos reglas. La primera **no es una heurística**: un set que declara menos cartas de las que lleva un
sobre de su juego no puede ser un producto de sobres. Son **937 de 2254** sets del catálogo. La
segunda son patrones de nombre, que sí son juicio, y por eso **todo lo que descartan sale en el
informe**.

**Comprobado contra los 2254 nombres reales antes de conectarlo a nada.** Ningún set de 100+ cartas
lo descarta la aritmética, y todas las exclusiones grandes por nombre son productos de mazos —también
en Magic, cuyos nombres no usé para ajustar los patrones.

**Y un patrón que dejé fuera con los datos delante.** `Tin` parecía obvio:

```
2025 Mega-Pack Tin                    450 cartas
25th Anniversary Tin: Dueling Mirrors 398 cartas
```

Los Mega Pack dentro de un tin sí son sobres. El patrón habría quitado más contenido real del que
arregla.

Vive en `sets.is_openable`, no en `in_boosters`: son dos cosas distintas y confundirlas es justo lo
que P-033 describe. Y así corregir una mala clasificación es un `UPDATE` de una fila.

**Con Arc-V Decks fuera, el informe dice `Todos los sets son completables`** en los tres juegos: su
rareza `new` no era un hueco, era un producto mal clasificado.

## El otro fallo de la sesión, y lo destapó la suite E2E (P-036)

El test de humo falló con **quince 404 de imágenes**. La causa era mía: había lanzado las cosechas
con `STORAGE_PATH=C:/TCGProyect/storage`, y lo que el proyecto documenta —y el contenedor usa— es
`./storage/cards`. 3101 imágenes escritas donde la API no las busca.

**Lo que lo convierte en problema y no en errata: nada avisa.** El cosechador termina en verde, la
API arranca sin quejarse, la base dice que 2000 impresiones tienen imagen, y el único síntoma es un
404 por imagen en el navegador. Peor: la salvaguarda 1 del cosechador consulta la raíz equivocada,
así que la siguiente ejecución con la raíz buena volvería a pedirle al origen 3101 imágenes que ya
se tenían — justo lo que P-001 existe para evitar.

Ficheros movidos a su sitio; la causa queda como **P-036** y **T-071**. Y conviene subrayarlo: **lo
encontró la suite E2E**, que es exactamente para lo que se escribió en H8a.

## Y una limitación de la propia suite (T-072)

Al relanzarla varias veces seguidas empezó a fallar con `429 Too Many Requests`: cada test registra
un usuario y el límite de `/api/auth/register` es por IP y por hora (T-062, H8b). El rate limiting
hacía su trabajo. Hoy se sortea reiniciando la API —los contadores están en memoria— y eso es un
apaño, no una solución.

## Verificación de la tercera parte

| Comprobación | Resultado |
|---|---|
| `npm test` | **368/368** en 29 ficheros |
| Suite E2E | 6 passed, con la API reiniciada |
| `vite build` · `npm audit` | limpios |
| `npm run packs:cobertura` | **"Todos los sets son completables"**, los tres juegos |
| Clasificador contra los 2254 nombres reales | 1165 abribles · 1089 descartados · cero falsos positivos revisables |
| Reclasificación de lo ya ingestado | 1089 filas, exactamente las que predijo la simulación |

---

# Cuarta parte: T-071 y T-072, y el límite de tasa que no limitaba

## T-071 — que un almacén mal configurado se note al arrancar

La API compara al arrancar veinte de las rutas más recientes que la base dice tener. Reproduciendo
la configuración mala de la tercera parte:

```
ALMACEN DE IMAGENES: La base dice que 2000 impresiones tienen imagen y NINGUNA de
las 20 comprobadas esta bajo "C:\TCGProyect\storage".
  Es casi seguro un STORAGE_PATH distinto del que se uso al cosechar (P-036).
```

No bloquea el arranque —quien borre `storage/` a propósito tiene que poder levantar la API— y
distingue "faltan unos ficheros" de "la raíz es otra": tratarlos igual convertiría el aviso en ruido.

## T-072 — empezó siendo una molestia de los tests

De 6 altas por vuelta a **1**, con una fixture de ámbito worker. Una variable de módulo no vale:
Playwright carga los módulos de test aislados. Y **un test sí dependía de la cuenta virgen** —"la
lista de mazos muestra el mazo creado" exigía exactamente una fila—; se arregló el test, porque su
sujeto nunca fue cuántos mazos hay.

Pero al relanzar diez veces seguía fallando a la cuarta, y el cupo de altas ya no era la causa.

## P-037 — las imágenes se comían el presupuesto del usuario

```
300 respuestas 200  ·  la peticion 301 -> 429
```

El tope global es de 300 peticiones por minuto y por IP, y `/images/` contaba dentro. **Desde que las
imágenes se sirven de verdad** (tercera parte), una página del catálogo pide decenas: un usuario
navegando agota su propio presupuesto en un par de minutos y ve el catálogo lleno de huecos. Detrás
de un NAT, mucho antes. No era una molestia de la suite: era un defecto de producto que la suite
destapó.

## P-038 — y al medirlo, el tope no cubría el catálogo en absoluto

Con las imágenes ya exentas, el catálogo tampoco cortaba:

```
GET /api/games  x340  ->  340 respuestas 200      (registrada ANTES del limitador)
GET /api/decks  x340  ->  300 pasan, 40 son 429   (registrada DESPUES)
```

Un plugin de Fastify sólo afecta a lo declarado **después** de él. `buildServer` registraba todas las
rutas del catálogo y `buildFullServer` metía el limitador detrás. **Desde H3, el tope global no
cubría `/api/games`, `/api/cards` —que recorre un FULLTEXT— ni ninguna otra ruta pública.** El
comentario del código las llamaba *"última línea"*, y no había línea.

Es P-029 otra vez: una salvaguarda escrita, revisada y comentada, que no hacía nada. Y no la encontró
la auditoría de seguridad de H8b —que iba exactamente de esto—, sino intentar relanzar unos tests.

## Verificación de la cuarta parte

| Comprobación | Resultado |
|---|---|
| `npm test` | **373/373** en 30 ficheros |
| `/api/games` x340 | 299 pasan · 41 son 429 — **antes pasaban las 340** |
| `/images/` x500 | 500 con 200 — exentas |
| Suite E2E, **diez vueltas seguidas** | 6 passed cada una — antes fallaba a la tercera |
| Aviso de almacén | reproducido con la raíz mala y visto callar con la buena |

---

# Quinta parte: T-065, y P-032 cerrado tres sesiones después

La idea que lo mantuvo abierto era *"un juego de migraciones que no fije el nombre"*, y no se podía
hacer: las migraciones publicadas son inmutables y la `0001` está aplicada en instalaciones que no
controlamos. **Lo que sí se puede cambiar es el migrador**, que es código.

Ahora retira antes de ejecutar las sentencias que deciden contra qué base se aplica, y lo dice:

```
0001_initial_schema.up.sql: retirada(s) 2 sentencia(s) que elegian base
  (CREATE DATABASE IF NOT EXISTS proyecto_tcg · USE proyecto_tcg;).
```

Y después de cada fichero comprueba que la base activa no ha cambiado. **El límite de esa segunda
comprobación está escrito en el código:** corre *después* de ejecutar, así que no deshace lo que ese
fichero ya hizo —MySQL confirma cada DDL al vuelo—. Lo que evita es que la ejecución siga y que la
migración quede anotada como aplicada en una base donde no ha creado nada, que es justo lo que hacía
a P-032 silencioso. Comprobado metiendo un `USE` con un comentario detrás, que la regla de línea no
reconoce: aborta nombrando el fichero y las dos bases.

**La guarda de S025 se retira.** Evitaba el daño negándose a migrar, pero dejaba el problema entero y
ahora además estorbaría.

**Verificado de punta a punta, que es lo que nunca se había podido hacer:**

| | |
|---|---|
| `tcg_prueba_t065` tras migrar | 14 tablas · 13 migraciones · 3 juegos · 67 rarezas · 8 plantillas |
| `proyecto_tcg` | intacta, 3635 impresiones |
| `npm test` | **381/381** en 31 ficheros |
| Suite E2E | 6 passed |

Con esto **P-032 queda cerrado** y por fin se puede tener una base de pruebas.

## Lo que NO se ha hecho, y por qué

| ID | Qué queda |
|---|---|
| **T-071** (P-036) | Una cosecha con el `STORAGE_PATH` equivocado deja la base diciendo que hay imágenes y la API devolviendo 404 |
| **T-072** | La suite E2E no se puede relanzar dentro de la misma hora: choca con su propio rate limit |
| **T-067** | **MAMO y MAMS** no tienen ni una carta común y la plantilla pide ocho. **Black Bolt y White Flare** tienen el 40 % del set en Illustration Rare y su plantilla les da el 10,2 %. En los cuatro, la carta del chase ya es alcanzable; lo que falta es que el sobre se parezca al producto |

Los tres salieron de medir. Ninguno se ha tapado subiendo un número.

## Un apunte de higiene

Los 300 sobres de la verificación se abrieron **de verdad** contra la base de desarrollo, así que el
usuario 1 tiene ahora esas aperturas y su colección de LOB. Es una base local y abrir sobres es lo
que hace la aplicación, pero conviene saberlo antes de sacar conclusiones de esos datos.

## Estado
- **H8 cerrado.** H8a (suite E2E), H8b (seguridad) y H8c (las ocho de deuda técnica).
- **T-068, T-069 y T-070 cerradas también**, fuera de H8c: las tres salieron del informe que se
  escribió para T-034.
- Abiertas: T-066, T-067 y T-005, que depende del usuario. Ninguna bloquea nada.
- Problemas: 5 abiertos · 33 cerrados.
