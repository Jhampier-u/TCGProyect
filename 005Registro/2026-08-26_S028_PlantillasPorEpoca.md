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

---

# Sexta parte: T-066, los iconos por fin visibles

Llevaban cosechados desde S027 y la API los servía, pero **nadie podía ver uno**: un `<option>` no
puede contener una imagen, y no hay CSS que lo arregle. O se cambia el control o los iconos no
existen para el usuario.

## Dos sitios, dos soluciones distintas

**El panel de completitud** de la colección ya era una rejilla de `<div>`: el icono entra como
columna nueva, y esa columna **mantiene su ancho aunque el icono falte** — si no, las filas con y sin
icono dejan de alinear y la lista se lee peor que sin iconos.

**Los tres selectores de set** (sobres, catálogo y buscador de mazos) pasan a un control propio.

## Lo que hay que devolver al sustituir un `<select>`

Un `<select>` nativo trae gratis cosas que se dan por hechas hasta que faltan. Están reimplementadas
a mano y **cubiertas por tests**, que es lo que impide que se pierdan sin que nadie lo note:

- roles `combobox` y `listbox`, con `aria-expanded`, `aria-selected` y `aria-activedescendant`
- teclado completo: flechas, Inicio/Fin, Enter, Espacio, Escape y Tab
- **buscar tecleando**: escribir "sup" salta a *Supreme Darkness*. Con cientos de sets, sin esto el
  control es inservible desde el teclado
- cerrar al hacer clic fuera, y devolver el foco al botón

**Y lo que NO se recupera, dicho en el propio componente:** en móvil, un `<select>` nativo abre la
ruleta del sistema, que es mejor que cualquier lista pintada en la página. Si algún día molesta, la
salida es volver al nativo por debajo de cierto ancho, no apedazar éste.

## La lección de P-030, aplicada por adelantado

El `<select>` anterior se dimensionaba a su opción más larga y se salía de su columna. El control
nuevo **no hereda ese comportamiento, pero tampoco hereda la lección**: la aserción de P-030 se mueve
al control nuevo en vez de borrarse con el viejo, y se añade otra igual en la página de sobres.

## Y algo que sólo se ve mirando

Los "iconos" no son lo mismo en los tres juegos. Magic da SVG limpios y Pokémon el símbolo del set;
**Yu-Gi-Oh! da la portada del sobre**, una imagen vertical que a 20 px se reconoce por color pero no
por detalle. Es lo que el origen ofrece y no hay nada que arreglar, pero conviene saberlo antes de
esperar tres cosas iguales. Del DOM no se deduce: sale de abrir la captura.

## Verificación de la sexta parte

| Comprobación | Resultado |
|---|---|
| Suite E2E | **10 passed**, ninguno saltado |
| `npm test` · `vite build` · `npm audit` | 381/381 · limpios |
| Iconos del selector | todos `^/images/`, ninguno apuntando al origen (P-001) |
| Que hayan **cargado** de verdad | `naturalWidth > 0`; un `<img>` roto también "está visible" |
| Desbordamiento | selector dentro de su columna en sobres y en el editor |
| Las capturas | miradas, no sólo generadas |

**Un test que se saltaba, arreglado en el momento.** El del panel se saltaba porque la cuenta de
prueba no tenía cartas. Un test que nunca corre no prueba nada, así que ahora abre un sobre él mismo
en vez de depender de que otro lo haya hecho — y de paso deja de depender del orden de ejecución.

---

# Séptima parte: T-067, y la ficha se equivocaba

T-067 estaba fichada como *"plantilla propia para los sets de composición atípica"*, y para dos de los
cuatro la medición dice otra cosa:

```
MAMO  sale en   9 dias · el origen declara  18 cartas · ingestadas 206
MAMS  sale en  78 dias · el origen declara  24 cartas · ingestadas  66
BLK   salio hace 404   ·                   172        ·            172
```

**No son productos raros: son sets a medio revelar.** *Magnificent Maestros* son 24 cartas, y el
catálogo tiene 24 ultra + 24 starlight + 18 grand master **de esas mismas 24** — sólo se han
anunciado los tratamientos premium. Las comunes llegarán el día que salga.

Y eso **no se ve mirando la composición**: parece un set premium sin comunes. Se ve mirando la fecha.

Abrirlo hoy entregaba **8,98 ultra rare por sobre** sobre 200 sobres, con **1600 avisos** del motor
—ocho por sobre, uno por cada slot de común que cae al respaldo—.

**Ninguna plantilla arregla eso: faltan las cartas, no las probabilidades.** Así que la fecha de
salida se une a las reglas de "abrible", que es una regla **objetiva** en vez de otra estimación. Y
como la reclasificación corre en cada pasada del CLI, el set se vuelve abrible **solo** el día que
sale, sin que nadie tenga que acordarse.

Detalle que evita un fallo que sólo aparecería en algunos husos: las fechas se comparan como cadenas
`YYYY-MM-DD`. `new Date()` sobre una fecha suelta la interpreta en UTC, y la respuesta cambiaría
según dónde corra el proceso. El día de salida cuenta ya como salido, y un set sin fecha no se toca.

## Lo que sí queda, dicho con su motivo (T-073)

*Black Bolt* y *White Flare* **sí** son atípicos de verdad: salieron hace 404 días, están completos
—172 de 172 declaradas— y tienen **69 Illustration Rare de 172 impresiones**, el 40 % del set frente
al 8 % de un booster normal. Su plantilla les da el 10,2 %.

Todas sus cartas son alcanzables; lo que falta es que el sobre se parezca al producto. **Ése sí
necesita tasas que nadie publica**, así que se registra en vez de inventarse.

## Verificación de la séptima parte

| Comprobación | Resultado |
|---|---|
| `npm test` | **384/384** en 31 ficheros |
| Suite E2E | 10 passed |
| Reclasificación | 7 sets cambiaron; MAMO y MAMS dejan de ofrecerse |
| `npm run packs:cobertura` | "Todos los sets son completables" en los tres juegos |
| Sets sin publicar en el catálogo | 8 en Magic, 2 en Yu-Gi-Oh!, 0 en Pokémon |

---

# Octava parte: la ingesta de Pokémon, y lo que destapó (T-005, T-074)

El usuario dio la clave de la API. La ingesta:

```
sets descubiertos 174 · procesados 18 · fallidos 2 · impresiones 3414
[imagenes] descargadas 3414 · ya en disco 0 · fallidas 0 · reduccion 97.1%
```

**Cero imágenes fallidas.** Los dos sets caídos son P-016 tal cual —`swsh12pt5` con un 500 y `svp`
con un 502—; se recuperan relanzando (**T-075**).

| | antes | después |
|---|---|---|
| Sets de Pokémon ingestados | 9 | **27** |
| Impresiones de Pokémon | 1295 | **4709** |
| Imágenes en disco | 3635 | **7049** (173 MB) |

## Y la comprobación hizo exactamente lo que se escribió para hacer

Con el catálogo **3,6 veces más grande**, `packs:cobertura` señaló **once sets con cartas
inalcanzables, tres al 0 %** — con nombre, porcentaje y rareza. Nadie tuvo que ir a mirar.

Medido, eran **tres problemas distintos y sólo dos de plantilla**:

**Las galerías.** *Lost Origin Trainer Gallery*, *Silver Tempest Trainer Gallery* y *Crown Zenith
Galarian Gallery*: 30, 30 y 70 impresiones **sin ni una común**. No son productos: son el subconjunto
de galería de su set padre, y sus cartas salen en los sobres del padre. Va al clasificador (T-069),
no a una plantilla — con un test de que **el set padre sobrevive**, porque un patrón que se llevara
`Crown Zenith` por delante quitaría un set de 160 cartas.

**La era Sword & Shield**, que no tenía plantilla. *Silver Tempest* trae once rarezas de las que la
de Scarlet & Violet nombra tres: techo del 67 %.

**Dos huecos dentro de Scarlet & Violet.** *Paldean Fates* es una bóveda shiny —132 de sus 245
impresiones lo son— y la plantilla no nombraba ninguna de las dos rarezas shiny: techo del 46,1 %. Y
las `ace_spec_rare`, 33 impresiones repartidas por seis sets.

**Las ACE SPEC van a la genérica y no a una ventana propia, y la cabecera dice por qué:** la ventana
existiría —seis sets, diez meses— pero con peso 20 el coste de llevarla siempre es ~1 % de los hits
mal repartido, contra una plantilla más que mantener para siempre.

## Verificación, con sobres reales

```
SIT  Booster Sword & Shield · las ONCE rarezas del set vistas
     rare 41,0% · rare_holo 26,3% · rare_holo_v 14,0% · rare_ultra 5,3% ...
PAF  Booster Paldean Fates  · shiny_rare 30,0% · shiny_ultra_rare 3,7%
TEF  Booster Scarlet & Violet · ace_spec_rare 2,0%
```

| Comprobación | Resultado |
|---|---|
| `npm run packs:cobertura` | **"Todos los sets son completables"**, los tres juegos |
| `npm test` | **385/385** en 31 ficheros |
| Suite E2E · `npm audit` | 10 passed · limpio |
| Los pesos de las 5 plantillas de PTCG | suman 1000, con `JSON_TABLE` |

## Un test que pasaba por llegar antes que la red

Al crecer el catálogo, el test de los iconos empezó a fallar. Los ficheros estaban y la API los servía
con `200`: lo que fallaba era la aserción, que miraba **un instante** en vez de esperar. Pasaba porque
con pocos sets la descarga terminaba antes. **Un test que depende de llegar antes que la red no mide
lo que dice medir**, así que ahora espera.

---

# Novena parte: T-075, y lo que salió de reingestar dos sets

Los dos que se cayeron entraron **a la primera**:

```
svp: 200 impresiones · swsh12pt5: 160 impresiones
procesados 2 · fallidos 0 · imagenes descargadas 359 · fallidas 1
```

**La imagen fallida es un 404 real del origen** (`svp-102`): la carta no tiene imagen publicada. Es
exactamente el caso para el que se hizo T-019 — lleva 1 intento de 3 y dejará de pedirse. Nada que
arreglar; el contador funcionando.

## Pero la cobertura señaló dos cosas más

**Una bolsa de promocionales colada.** `Scarlet & Violet Black Star Promos`: 200 impresiones, todas
de rareza `promo`, techo 0 %. Los patrones cazaban `promotional cards` pero no `Promos`. Son **173
sets del catálogo** —`Magic Online Promos` con 3094 cartas, `War of the Spark Promos`, los cuatro
`Black Star Promos`— y ninguno es un producto de sobres.

**Y las galerías habían vuelto.** Ése fue error mío: **no reconstruí la imagen de `ingest`** tras
añadir su patrón, así que el contenedor reclasificó con las reglas viejas.

## La tercera vez es la que se arregla

`ingest` es un servicio de compose con **imagen propia** aunque comparta `Dockerfile` con `api`. Ha
mordido tres veces —S025, y dos en esta sesión— y siempre con el mismo síntoma: **la ingesta termina
en verde y hace lo que hacía antes del cambio**.

Acordarse no es un arreglo. El comando documentado pasa a llevar `--build`:

```bash
docker compose --profile ingest run --rm --build ingest --game YGO --sets 3
```

Actualizado en el README —con la nota de por qué—, en el punto de entrada, en infraestructura, en el
spec de H8a y en la fixture de la suite E2E, que es la que dicta el comando cuando faltan datos. Los
planes viejos de `004Arquitectura` no se tocan: son históricos.

## Estado final

| | |
|---|---|
| Catálogo | MTG 1177 · YGO 1163 · **PTCG 5069** impresiones · 7408 imágenes |
| `npm run packs:cobertura` | **"Todos los sets son completables"**, los tres juegos |
| `npm test` | **385/385** en 31 ficheros |
| Suite E2E · `npm audit` | 10 passed · limpio |

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
- Abierta: **T-073**, ⚪. **Nada bloqueado por el usuario**: T-005 cerrada.
- Problemas: 5 abiertos · 33 cerrados.

---

> **Nota de honestidad sobre las seis partes que siguen.** No se escribieron mientras ocurrían: se
> reconstruyeron el 2026-08-27, al cerrar la sesión, a partir de las cabeceras de las migraciones, los
> mensajes de commit y la tabla de tareas realizadas. Las cifras y la aritmética son las que quedaron
> registradas en el momento; lo que no está aquí es el orden exacto en que se probaron las cosas, que
> ya no se puede recuperar. Se dejan escritas porque el razonamiento —por qué una columna y no una
> plantilla por set, por qué se descartó una regla que parecía obvia— es lo que no se deduce leyendo
> el SQL.

---

# Décima parte: T-076, un error sin nombre de columna (P-039)

## Cómo salió

La primera ingesta completa de Magic abortó a los **98 sets de 1045**:

```
[MTG] abortado: Out of range value for column '(null)' at row 1
```

**El nombre de columna vacío es la pista.** MySQL lo deja así cuando el desbordamiento ocurre
calculando una columna **generada**. En `cards` hay cinco, y la culpable era `cmc DECIMAL(4,1)`, que
topa en 999,9.

El dato no estaba mal: **la columna estaba estrecha.** Magic tiene cartas con coste de maná de
**1.000.000** —las de los *Un-sets*, *Gleemax* entre ellas— y los cuatro sets que las traen (`unh`,
`ust`, `und`, `unf`) estaban justo en la cola. El máximo que había entrado en 27 sesiones era **16**.

## Reproducido antes de tocar nada

```sql
CREATE TABLE t (game_data JSON, cmc DECIMAL(4,1) GENERATED ALWAYS AS (...));
INSERT INTO t VALUES ('{"cmc": 16}');       -- entra
INSERT INTO t VALUES ('{"cmc": 1000000}');  -- ERROR 1264 (22003)
```

Y aquí está lo que explica por qué nadie lo vio venir leyendo el esquema: un
`SELECT ... CAST(1000000 AS DECIMAL(4,1))` **sólo trunca** a 999,9 con un aviso. Es el `INSERT` en
modo estricto el que lo convierte en error. El mismo valor, dos comportamientos, según la sentencia.

## Lo que hubo que cuidar al arreglarlo

`DECIMAL(9,1)` cabe hasta 99.999.999,9 —sitio de sobra por encima del millón sin irse a un tipo
mayor— y **conserva el decimal**, porque el coste convertido de Magic lo usa de verdad: las cartas
con medio maná (`{1/2}`) tienen `cmc` 0,5.

Un `MODIFY` sobre una columna generada **exige repetir la expresión entera**. Omitirla la convertiría
en una columna normal y vacía, en silencio. Y como `cmc` está en `idx_cards_game_cmc`, MySQL rehace
ese índice.

El rollback de esta migración **puede fallar, y debe**: si ya hay una carta con coste 1.000.000
guardada, estrechar la columna otra vez no cabe. Está dicho en la cabecera del `.down.sql` en vez de
dejar que alguien lo descubra.

---

# Undécima parte: T-077 y T-078, lo que sólo se ve con el catálogo entero

Con Magic y Yu-Gi-Oh! ingestados completos, el informe de cobertura dejó de hablar de una muestra.

## T-077 — `special` y `bonus` en el Play Booster (0016)

1045 sets de Magic, 207 con pool y ofrecidos, y **sólo nueve** con cartas inalcanzables. Es una
noticia buena y dice algo del juego: el vocabulario de rarezas de Magic —common, uncommon, rare,
mythic— lleva treinta años estable, así que **una sola plantilla cubre de 1993 a 2026**. Nada que ver
con Pokémon, que necesitó cuatro épocas para tres años.

Los nueve fallaban por dos rarezas que la plantilla no nombraba:

| Set | Impresiones | Techo | Rareza |
|---|---|---|---|
| `tsr` Time Spiral Remastered | 410 | 70,5 % | `special` |
| `tsb` Time Spiral Timeshifted | 121 | **0,0 %** | el set entero |
| `mps` Kaladesh Inventions | 54 | 0,0 % | `special` |
| `mp2` Amonkhet Invocations | 54 | 0,0 % | `special` |
| `plst` The List | 4654 | 99,9 % | `special` |
| `cmr` / `clb` / `cmm` Commander | 361/361/451 | 99,7-99,8 % | `special` |
| `vma` Vintage Masters | 325 | 97,2 % | `bonus` |

Scryfall marca `special` lo que va en una hoja aparte —los Timeshifted de borde morado, los
Masterpiece, los inventos de Kaladesh— y `bonus` la hoja extra de Vintage Masters. En el producto
real son **insertos**: aparecen en el sobre, pero no en la tabla de rarezas normal. Van al slot 13,
el último y el único siempre foil, que es el sitio del producto donde de verdad aparece un inserto.

**Lo que esto no arregla, y se dijo en su sitio:** `tsb`, `mps` y `mp2` son hojas de inserto
*enteras*, no productos; sus cartas salen en los sobres del set padre. Pasan a ser completables, pero
"abrir un sobre" de ellas seguirá entregando catorce cartas `special`, que no se parece a nada real.
Misma familia que las galerías de Pokémon (T-069).

**Y una regla obvia que se descartó midiendo.** "Un set de una sola rareza no es un producto" habría
resuelto los tres de golpe, y caza **505 sets de Yu-Gi-Oh!**, entre ellos productos reales como `MVP1`
o `WI26`, donde todas las cartas son Ultra Rare por diseño. Habría quitado más contenido real del que
arregla —el mismo error que ya se evitó con el patrón `Tin` en T-069—. Es la tercera heurística
plausible que esta sesión rechaza porque la medición dice que no.

## T-078 — las paralelas están en las cuatro épocas, no en una (0017)

Un error de la **0010**, que sólo el catálogo completo podía destapar: puso `ultimate_rare` y
`ghost_rare` sólo en la época 2 (2008-2016). Con nueve sets de Yu-Gi-Oh! ingestados no había forma de
verlo. Con los 1032, sí: **143 sets** con cartas inalcanzables, y los primeros de la lista eran de
2004-2007 —*Soul of the Duelist*, *Rise of Destiny*, *Flaming Eternity*— topados en el 70-74 % por
`ultimate_rare`.

Contado por época sobre los sets ofrecidos:

| Época | `ultimate_rare` | `ghost_rare` | sets |
|---|---|---|---|
| 1 · hasta 2008-09-01 | 348 | 4 | 16 |
| 2 · hasta 2016-01-13 | 290 | 30 | 48 |
| 3 · hasta 2020-04-29 | 54 | 0 | 18 |
| 4 · genérica | 479 | 22 | 37 |

Las dos rarezas van de 2004 a 2026. **No son de una época: son las paralelas del Core Booster**, y
llevan ahí toda la vida. La 0010 acertó en que existen y falló en dónde.

Los pesos son los mismos que la 0010 estimó para la época 2 —`ultimate` 42 (~1 por caja), `ghost` 3
(~1 cada doce cajas)—, porque no hay motivo para que cambien de época y usar dos escalas distintas
para lo mismo sería peor. Siguen siendo `[ESTIMADO]`.

**La lección, por tercera vez.** Una muestra de nueve sets no ejercita el mismo camino que el catálogo
entero. P-017, P-020, y ahora esto.

---

# Duodécima parte: T-079, las cinco épocas históricas de Pokémon (0018)

Con los 174 sets de Pokémon ingestados, el informe señaló **un centenar** de sets con cartas
inalcanzables. La causa era la ya conocida: cada bloque de la historia del juego tiene su rareza
estrella, y sólo estaban descritas las tres últimas eras.

Medido sobre los sets ofrecidos, con fechas reales y no de memoria:

| Rareza | Sets | Ventana |
|---|---|---|
| `rare_holo_ex` | 37 | 2003-07-01 .. 2016-11-02 |
| `rare_holo_gx` | 15 | 2017-02-03 .. 2019-11-01 |
| `rare_holo_lv_x` | 11 | 2007-05-01 .. 2009-11-04 |
| `rare_holo_star` | 9 | 2004-11-01 .. 2007-02-02 |
| `rare_prism_star` | 6 | 2018-02-02 .. 2019-02-01 |
| `rare_break` | 5 | 2015-11-04 .. 2016-11-02 |
| `rare_prime` · `legend` | 4 · 4 | 2010-02-10 .. 2010-11-03 |
| `rare_ace` | 4 | 2012-11-07 .. 2013-08-14 |
| `rare_shining` | 3 | 2001-09-21 .. 2017-10-06 |

Y tres que **no son de una época sino de fondo**: `rare_holo` (1999-2023), `rare_secret` (2000-2023) y
`rare_ultra` (2011-2023). Van en todas las épocas donde existen.

## Un fallo que esto corrigió de paso

`Booster Sword & Shield` (0014) se había creado con `valid_from` NULL, así que **se tragaba toda la
historia anterior a 2023**: los sets de 1999 resolvían a la plantilla de 2020. Con nueve sets
ingestados no había forma de verlo. Se le puso su inicio real.

Las seis ventanas quedan contiguas y sin solape, del *clásico* (hasta 2007-04-30) a *Sword & Shield*
(2020-01-01 .. 2023-03-30). **Los nueve primeros slots son los mismos en todas**: 4 comunes, 3
infrecuentes y 2 reversos. Un sobre de Pokémon ha llevado esa estructura toda su historia moderna; lo
que cambia de época es el hit.

Con esto, **Magic y Pokémon quedaron a cero sets con cartas inalcanzables.**

---

# Decimotercera parte: T-073, que un sobre se parezca a su producto (0019)

Esta no es una tarea de cobertura. Desde la 0012 **todas** las cartas de *Black Bolt* y *White Flare*
eran alcanzables, incluida la `black_white_rare`, que es una sola carta. Lo que fallaba era el
**realismo**.

Los dos sets son idénticos en composición:

```
illustration_rare           69 de 172 impresiones   40,1 % del set
rare                        11
ultra_rare                   8
special_illustration_rare    7
double_rare                  6
black_white_rare             1
```

Un booster normal de Scarlet & Violet lleva un **8 %** de Illustration Rare. Estos llevan el **40 %**,
y la plantilla les daba el **10,2 %** del slot del hit. El sobre salía mucho menos brillante de lo que
el producto real es.

## La diferencia entre estimar e inventar

No hay tasa publicada por sobre para estos dos sets. Se estimó con una regla que **se puede decir en
voz alta**, que es exactamente lo que separa una estimación de un número a ojo:

1. **Las rarezas de caza mantienen la tasa de su época.** La escasez de una Special Illustration Rare
   no depende de cómo esté compuesto el set: es rara porque el fabricante la imprime poco. Se quedan
   en 41 y 25, como en la 0012.
2. **El resto del peso —934— se reparte en proporción a lo que el set tiene de cada rareza.** Si 69 de
   las 94 cartas de esos niveles son Illustration Rare, un sobre de este set entrega una Illustration
   Rare la mayoría de las veces. Eso es lo que hace a estos dos sets lo que son.

```
934 * 11/94 = 109   rare
934 *  6/94 =  60   double_rare
934 * 69/94 = 686   illustration_rare
934 *  8/94 =  79   ultra_rare
------------------------------
              934  +  41 + 25 = 1000
```

El hit pasa del 10,2 % al **66,3 %** para Illustration Rare, medido sobre 300 sobres.

**Y lo que esta estimación no es**, dicho en la propia migración: no es una medición. Si aparece la
tasa real del fabricante, esto es un `UPDATE` (ADR-005). Y no se aplica a ningún otro set —la
plantilla es sólo de estos dos, por su ventana de un día— precisamente porque la regla depende de una
composición que sólo ellos tienen.

---

# Decimocuarta parte: T-080, un nivel de precedencia que faltaba (0020-0022)

Quedaban **154 sets** con cartas inalcanzables, y **80 de ellos pertenecían a líneas de producto**:
Duel Terminal, Gold Series, Battle Pack, Mega Pack, Rarity Collection y Legendary Duelists. Cada una
tiene su propia escalera de rarezas —un Gold Series trae `gold_rare`, un Duel Terminal cuatro grados
de `duel_terminal_*_parallel_rare`— y ninguna plantilla las nombraba.

## Por qué las épocas no podían resolverlo

```
Gold Series    2008-04-02 .. 2021-11-18
Battle Pack    2012-05-24 .. 2026-02-05
Mega Pack      2014-08-28 .. 2025-09-04
```

Se solapan **entre sí y con los Core Booster de esos mismos años**. Una ventana por fecha no puede
decir "los sets de 2015 son Battle Pack", porque en 2015 también salieron Core Boosters y Mega Packs.
El test de solapes lo rechazaría, y tendría razón.

## Por qué una columna y no una plantilla por set

`pack_templates.set_id` existe desde H4 y habría permitido una plantilla por set: serían **70
plantillas casi idénticas** —las diez de Gold Series describen el mismo producto— y **cada set nuevo
de una línea exigiría añadir la suya a mano**. Eso es exactamente el "paso de asignación posterior a
la ingesta" que mantuvo T-034 bloqueada trece sesiones. No se vuelve a construir.

Lo que es verdad del dominio es otra cosa: **un set pertenece a una línea, y una línea tiene una
estructura de sobre.** Modelado así son seis plantillas, y los sets se etiquetan solos en la ingesta
—igual que `is_openable` (T-069) y por la misma razón: lo que se calcula solo no se olvida.

La precedencia de `findTemplate` pasa a tener cuatro niveles:

| # | Nivel | Columna |
|---|---|---|
| 1 | plantilla propia del set | `set_id` |
| 2 | **línea de producto** | `product_line` ← nuevo |
| 3 | época que cubre su fecha | `valid_from` / `valid_to` |
| 4 | genérica del juego | — |

**La línea va antes que la época** porque es más específica: un Gold Series de 2010 es antes un Gold
Series que un sobre de 2010.

## Por nombre y no por código, y esto también se decidió midiendo

Los prefijos de código parecían más fiables y son una trampa: `^BP` se lleva `BPRO` (Burst Protocol,
un Core Booster), `^LED` se lleva `LEDE` (Legacy of Destruction, otro) y `^MP1` se lleva las
promocionales de McDonald's de 2002. Los nombres separan limpio: *Legendary Duelists* no casa con
*Legendary Dragon Decks* ni con *Legacy of Destruction*.

Comprobado contra los **1032 nombres reales** del catálogo antes de conectarlo: 70 sets en seis
líneas, sin un solo falso positivo. La única excepción va por código y está justificada en su sitio:
los Mega Pack de lata **no llevan "Mega Pack" en el nombre desde 2021** —*2021 Tin of Ancient
Battles*, *25th Anniversary Tin: Dueling Mirrors*—, pero el código sí es consistente, `MP14` a `MP25`,
y con dos dígitos no colisiona con `MP1`.

## Los pesos, con el método declarado

Misma regla que en la 0019: **el slot se reparte en proporción a lo que los sets de esa línea tienen
de cada rareza.** Composición medida sobre los sets ofrecidos:

```
Duel Terminal   normal_par 591 · rare_par 147 · common 143 · super_par 87 · ultra_par 86
Gold Series     gold 272 · rare 208 · common 160 · premium_gold 106 · gold_secret 93
Battle Pack     common 843 · starfoil 440 · shatterfoil 287 · mosaic 215 · rare 160 ...
Mega Pack       common 1564 · ultra 642 · prismatic_secret 390 · rare 310 · super 273 ...
Rarity Coll.    platinum_secret 787 · qcsr 716 · ultra 461 · ultimate 398 · collectors 397 ...
Legendary Duel. common 345 · super 105 · ultra 101 · rare 100 · qcsr 25 · secret 10
```

**Rarity Collection no tiene ni una común**: sus cinco slots salen todos del extremo premium. Es el
único caso, y por eso su plantilla no se parece a ninguna otra.

## La cola que quedó, y por qué no se le hizo una línea (0022)

Tras las plantillas de línea sobrevivían 19 sets con `rare` y 16 con `collectors_rare` inalcanzables.
Medidos, son todos la misma familia: **los mini-boosters modernos** —*Toon Chaos*, *Genesis Impact*,
*Ancient Guardians*, *King's Court*, *Maze of Memories*, *Crossover Breakers*, *Phantom Revenge*—, con
unas 35-42 `rare` y 14-17 `collectors_rare` sobre pools de 74-105.

**Esto matiza P-019 sin contradecirlo.** Aquella medición decía que el slot de Rare desapareció de los
sobres en 2020, y es cierto de los Core Booster de línea principal: *Supreme Darkness* no tiene ni
una. Pero estos mini-boosters sí la conservan, y es casi la mitad de su pool. La conclusión de P-019
era correcta para lo que se midió entonces —un solo set— y demasiado ancha para el catálogo completo.

No se les hizo línea propia, y es deliberado: sus nombres no comparten nada, así que cualquier patrón
sería adivinar. Van a la genérica, donde el respaldo del motor se encarga: en un set sin `rare` esa
entrada se cae a otra del mismo slot y no cambia nada.

**De 154 sets con cartas inalcanzables a 31.**

---

# Decimoquinta parte: T-081, cuando el origen mete el estado en el campo de la rareza

De los 31 que quedaban, 16 no tenían un problema de plantilla: tenían un problema de **dato**.

YGOPRODeck usa `set_rarity` para dos cosas distintas —la rareza de verdad y, a veces, el **estado** de
la carta en ese set—. Medido sobre el catálogo completo:

```
new                       80 impresiones
reprint                   11
new_artwork                9
european_oceanian_debut    6
force_smw · european_debut · oceanian_debut   1 cada una
```

**"New" no dice que la carta sea común: dice que no es una reimpresión.** Dejarlas pasar creaba
rarezas fantasma que ninguna plantilla podía nombrar —ni debía—, y por eso 16 sets salían en el
informe como si les faltara una plantilla cuando lo que falta es el dato en el origen.

Se tratan como **rareza irrecuperable**, que es el caso que el contrato de T-007 ya cubría: `null`
aquí, el adaptador cae a `FALLBACK_RARITY_CODE` y emite un aviso.

**El precio, dicho.** Esas cartas quedan registradas como comunes, y algunas no lo son: las 22 de
*Battles of Legend: Monster Mayhem* conviven con secret y starlight. Se acepta porque la alternativa
es peor —sin rareza utilizable son **inobtenibles para siempre**, y P-021 enseñó lo que cuesta un set
que el coleccionista no puede cerrar—. El aviso deja constancia de cada una.

En la dirección contraria va `cr`: aparece una vez en *Quarter Century Stampede*, un set que además
tiene `collectors_rare`. Es la misma rareza escrita corta, y traducirla **es lo contrario de
inventar**: crear `cr` como rareza propia habría partido en dos algo que es uno.

**De 31 a 20.** Y destapó **P-040**, que fue lo que acabó siendo T-083: al reingestar, las 110
impresiones cuya rareza había cambiado no se actualizaron —se duplicaron.

---

# Decimosexta parte: T-082, la cola larga y la sorpresa (0023)

Los 20 restantes parecían veinte productos sueltos que necesitarían veinte plantillas propias.
Medidos uno a uno, **casi ninguno la necesitaba**: eran las plantillas de línea a las que les faltaba
una rareza, más cuatro sets que no son sobres.

| Rareza que faltaba | Sets | Dónde |
|---|---|---|
| `ghost_rare` | LED7, LED8, LED9, LD10 | en `legendary_duelists` |
| `secret_rare` | HAC1 | en `duel_terminal` |
| `dt_normal_rare_parallel_rare` | DT07 | un quinto grado de Duel Terminal |
| `ghost_gold_rare` | GLD5 | en `gold_series` |
| `common` | RA05 | **una sola** carta común de 692 |
| `prismatic_secret_rare` | WSUP | en la época 2 |
| `ultra_rare_pharaohs_rare` | KICO, MAMA | en la genérica |
| `10000_secret_rare` | BLAR | una carta |
| `ultra_parallel_rare` | TBC1 | ídem |

Los pesos son pequeños y `[ESTIMADO]`: todas estas rarezas aparecen una o dos veces por set. Se
añaden con peso bajo y **se reescala lo que había**, para que cada slot siga sumando 1000 sin deformar
la línea. La aritmética va en cada bloque de la migración.

Se sembraron además **cinco rarezas** que estaban en la base por descubrimiento, con el `tier` 50 que
les puso `ensureRarity`. Misma razón que en la 0011 y la 0020: el tier ordena el respaldo del motor, y
una plantilla no debe apoyarse en un valor que llegó por accidente.

**Los cuatro que no eran plantilla se arreglaron en el clasificador**, no aquí: los Mega Pack de lata
(MP21, MP22, MP24) y las latas (TN19). El problema no era la plantilla, era que sus nombres no dicen
lo que son —y el patrón por código los separa, que es lo único que distingue la lata del Mega Pack que
lleva dentro—.

Y un caso que merece nombre propio: **tres productos distintos comparten el código `MVP1`** —Movie
Pack, Gold Edition y Secret Edition— y cada uno es de **una sola rareza**. Cinco cartas del mismo
nivel; el respaldo del motor entrega la que el set concreto tenga, que es exactamente para lo que
existe.

**Los tres juegos quedan a cero sets con cartas inalcanzables.**

---

# Y una corrección del propio Vault

Entre T-080 y T-082 se paró a arreglar el Vault, no el código. **P-005 llevaba doce sesiones diciendo
"pendiente de que el motor lo respete (H4)"** cuando H4 se cerró en S012: el arreglo estaba puesto y
verificado todo ese tiempo; lo que faltaba era escribirlo. Su criterio de aceptación pedía editar
`pack_slots` y que una apertura vieja devolviera las mismas cartas — S028 editó plantillas **catorce
veces**, y la apertura #1 pertenece a un set que **ya ni siquiera es abrible**, y sigue intacta con el
nombre de su plantilla congelado. También se corrigieron los recuentos de tareas y problemas, que
habían derivado.

Es la misma clase de deriva que P-032 (tres sesiones) y que la ficha equivocada de T-067. Un documento
que no se actualiza no es neutral: **miente con autoridad**.

---

# Decimoséptima parte: T-083, y las filas que el origen dejó de listar (P-040)

## Lo que estaba mal

La clave natural de una impresión es `(set_id, external_id)`, y en Yu-Gi-Oh! el `external_id` lleva
la rareza dentro — `SUDA-EN049::quarter_century_secret_rare`. Es correcto y necesario (P-013), pero
tiene un precio que nadie había escrito: **si la rareza cambia, cambia la clave**, y el upsert deja de
reconocer la fila. En vez de actualizarla, inserta otra.

Se destapó al normalizar las etiquetas que no son rarezas (T-081): las impresiones de Yu-Gi-Oh!
pasaron de 44.365 a 44.475. Las 110 nuevas convivían con las 110 viejas. Nada falló.

La mitigación de aquel momento fue borrarlas a mano. Esto es el arreglo.

## Retirar, no borrar

Una impresión referenciada por una apertura **no se puede borrar**: `pack_openings` y
`pack_opening_cards` son la fuente de verdad de RN-01, y borrar una carta que alguien sacó de un
sobre reescribiría su historial (P-005). La clave foránea lo impide, y hace bien.

Así que se distinguen dos casos, el mismo criterio que se usó con las plantillas en P-035:

- sobrante que **nadie referencia** → se borra;
- sobrante **referenciada** por una apertura, una colección o un mazo → se **retira**.

Retirar es poner `card_prints.withdrawn_at` (migración 0024). La fila sigue ahí para que la apertura
se resuelva, y desaparece del pool de sobres, del catálogo navegable, del recuento de completitud y
del informe de cobertura: siete consultas, siete `AND p.withdrawn_at IS NULL`.

**Y cuatro consultas más que a propósito NO lo llevan**, que es la parte que hay que escribir porque
no se deduce:

| Consulta | Por qué sigue viendo las retiradas |
|---|---|
| Ficha de una impresión (`findCard`) | Se llega desde una colección o una apertura, y ésas sí las contienen. Ocultarla sería un 404 en la ficha de una carta que el usuario tiene delante |
| Listado de la colección | Es suya. La sacó de un sobre |
| Repetición de una apertura | RN-01: la apertura se resuelve como ocurrió |
| Validar ids al guardar un mazo | Un mazo que ya contenía una retirada tiene que poder guardarse |

La quinta es un matiz, no un sí o un no: al resolver **nombres** a impresiones en un import, las
retiradas van **al final** del desempate en vez de excluirse. Si de un nombre sólo quedan retiradas,
es preferible resolverlo a una de ellas que decirle al usuario que su carta no existe.

**Columna propia y no `in_boosters = 0`.** Habría funcionado y habría sido una verdad a medias: ese
campo significa "esta impresión puede salir de un sobre de su set" (P-014), y una carta retirada no es
que no salga en sobre, es que el origen ya no la lista. Con una columna propia, el día que alguien se
pregunte por qué una carta desapareció de los sobres, la respuesta está ahí con su fecha.

## Las dos cosas que había que hacer bien

**La lista de vigentes se acumula sobre todo el set, no sobre el último lote.** El buffer se vacía
cada 500 impresiones; mirar sólo lo que queda al final habría declarado sobrante todo lo anterior y
lo habría borrado. Hay una prueba que ingesta tres impresiones y comprueba que llegan las tres.

**Un origen vacío no puede vaciar un set.** Si el adaptador devuelve cero impresiones, no se retira
nada. Sin esa condición, un 500 a mitad de una petición arrasaría el catálogo de un set en silencio —
un problema mucho peor que el que se está arreglando. También tiene su prueba, y esa prueba **empezó
pasando por el motivo equivocado**: el `FakeRepo` no tenía sets pendientes, así que la ingesta no
miraba el set siquiera. Se le añadió `expect(repo.marcados).toEqual([1])`, que es lo que la habría
hecho fallar.

## El SQL nunca ejecutado, ejecutado

Las tres pruebas unitarias no tocan la consulta que de verdad importa: la UNION contra
`pack_opening_cards`, `user_collection` y `deck_cards` que decide qué se borra y qué se retira. Un SQL
que nunca ha corrido no está comprobado.

Se escribió una comprobación puntual contra la base real — un fichero de usar y tirar, no parte del
producto — que sobre un set de 66 impresiones pidió retirar una referenciada y borrar una libre,
verificó que la primera conserva su fila con fecha y la segunda desaparece, y devolvió el set a su
estado.

**Y a la primera no devolvió nada.** `finishes` es una columna JSON y el driver la entrega ya
parseada; reinsertarla tal cual la bindea como lista de cadenas y MySQL la rechaza. La impresión
borrada se quedó borrada. Se arregló el `JSON.stringify`, se volvió a pasar la comprobación entera —
esta vez cerrando el círculo — y la impresión perdida se recuperó reingestando su set con
`--set "Magnificent Maestros"`, que es la bandera que salta los filtros de pendiente y de fecha. El
set volvió a sus 66 impresiones y el catálogo entero quedó en 181.951 con cero retiradas.

Merece decirse tal cual: la comprobación que se escribió para no dañar datos dañó un dato, y lo
destapó ella misma al fallar en su propio paso de restauración.

## Verificación

| Qué | Resultado |
|---|---|
| `npm run build` | limpio |
| `npm test` | **395/395** en 31 ficheros |
| Suite E2E | **10 passed** (16,1 s) |
| `npm run packs:cobertura` | "Todos los sets son completables", con los filtros nuevos puestos |
| Base real | set 419 devuelto a 66 impresiones · 181.951 impresiones · 0 retiradas |

## Estado al cerrar S028

- **Cero tareas abiertas.** T-083 era la última.
- Problemas: **2 abiertos** (P-008 🟡 y P-016 🟠, los dos asumidos a propósito, no trabajo) ·
  38 cerrados.
- Migraciones publicadas: hasta la **0024**.

## Lo que este registro no contaba, y ya cuenta

Las partes décima a decimosexta -- T-076 a T-082 -- no se escribieron mientras ocurrían. Se
reconstruyeron al cerrar la sesión a partir de las cabeceras de las migraciones, los mensajes de
commit y la tabla de tareas realizadas, y llevan dicho arriba que son una reconstrucción. Lo que no se
ha podido recuperar es el orden exacto en que se probaron las cosas dentro de cada tarea; el
razonamiento sí, porque estaba escrito donde tenía que estar.

**T-077 y T-078 no existían en ningún sitio salvo la cabecera de sus migraciones** -- ni siquiera en
`Tareas_Realizadas.md`. Se han añadido. Dos tareas que corrigieron el catálogo completo y que, de no
haberse mirado, habrían desaparecido del proyecto sin dejar rastro fuera del SQL.
