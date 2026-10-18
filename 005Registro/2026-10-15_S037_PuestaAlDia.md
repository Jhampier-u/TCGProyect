# S037 — Puesta al día del Vault, y el resto de H9b

**Fecha:** 2026-10-15 · **Tareas:** T-096 (y H9b: T-093, T-094, T-095)

---

## Lo que el Vault decía y ya no era verdad

La sesión empezó con una pregunta —*«dime el estado del proyecto»*— y la respuesta honesta tuvo que
incluir que el punto de entrada estaba desfasado:

- `05_Continuar_Aqui.md` decía *«tras la sesión S032»* y listaba T-091 y T-092 como siguientes, con
  las dos ya hechas y en `main`.
- `Tareas_Realizadas.md` atribuía T-091 a **S035** y T-092 a **S036**, y en `005Registro/` no había
  ni una ni otra. `Claude.md` seguía en *«última sesión S034»*.
- El README seguía con H8 *«🟡 6 de 8»*, cerrado desde S028, y sin fila para H9.

**La comprobación del Vault estaba en verde con todo eso.** Mira que el mapa de `Claude.md` liste lo
que hay en `005Registro/`, pero no que exista la bitácora de una sesión que se cita; de un fichero que
no existe no hay nada que mirar. Se añade la comprobación en el otro sentido —toda sesión que cierra
una tarea tiene bitácora, y el mapa no nombra ninguna que no esté en disco— y **se vio fallar** antes
de darla por buena: ocultando S035 la señala, igual que señalaba S037 hasta escribir este fichero.

Las dos bitácoras se **reconstruyeron** de los commits `4e1ff60` y `361c879`, que traen mensajes
largos y medidos, y lo dicen en su cabecera. No se inventa nada que no esté en ellos.

---

## T-096 — `npm audit` había dejado de estar limpio sin que nada cambiara (P-041)

En esta máquina no había `node_modules`. `npm ci` con el lockfile de agosto informó de **7
vulnerabilidades, 5 altas**: `fastify` (entre ellas un *bypass* de autenticación), `fast-jwt`
(acepta JWT caducados sin `iat`), `sharp`, `fast-uri`, `ip-address`, `brace-expansion`,
`source-map-js`.

Nadie había tocado una dependencia: **se publicaron avisos nuevos contra las versiones fijadas**. La
regla de P-011 se comprueba al cerrar tareas que tocan dependencias, y un proyecto parado no cierra
ninguna. `npm audit fix` sin `--force` lo resuelve dentro de los rangos declarados; sólo cambia el
lockfile, y la suite sigue en 481/481.

**Otra cosa que el retorno destapó:** `e2e/` no es workspace, así que `npm ci` en la raíz no le
instala `@playwright/test` y `npm test` **no compila** —el type-check de T-086 incluye
`e2e/tsconfig.json`—. `05_Continuar_Aqui.md` lo dice ahora en el arranque local.

---

## T-093 — El catálogo «Consulta», y la pregunta que ninguna capa sabía contestar

El criterio de aceptación del spec es literal: alguien que no conoce el proyecto tiene que poder pedir
*«las de Planta de este set que me faltan»* sin instrucciones. T-092 dejó la API filtrando por Planta y
por set. **"Me faltan" no existía en ninguna capa**: ni la búsqueda ni los recuentos sabían nada de
una colección.

### Por qué en el servidor y no en el navegador

La paginación es keyset. Filtrar en el cliente una página de 60 deja páginas medio vacías —o vacías
del todo— sin que nadie sepa por qué, y "cargar más" pasa a ser una lotería. Así que la API gana tres
cosas, todas sobre una misma condición `EXISTS` contra `user_collection` para que no puedan discrepar:

- `owned=yes|no` en `/api/cards`, que **exige sesión**.
- `owned` por fila en el resumen: la columna «Tienes».
- `owned` por valor en `/api/games/:game/facets`, más `total` y `ownedTotal`. Es lo que deja al raíl
  decir **«Planta 2 de 35»**, que contesta la pregunta del criterio antes de pulsar nada.

### Sesión opcional, con dos reglas

El catálogo sigue siendo público. Un hook nuevo, `identificarSiHay`, identifica al usuario si llega
un token válido y **no corta** la petición si no llega o no vale. Las dos reglas, con su prueba:

- **Un token caducado no tumba el catálogo público.** Duran una hora (ADR-008); contestar 401 a quien
  sólo lo tenía guardado sería romper lo que funciona para proteger lo que no lo necesita.
- **Pedir `owned` sin sesión es 401**, no el catálogo entero. Devolver todo como "lo que te falta"
  sería contestar otra pregunta sin decirlo.

El usuario sale siempre del token: `owned=no&userId=7` es un 400, porque `userId` no está declarado.

### La trampa de T-092, otra vez y esta vez prevista

Añadir `owned` al resumen compartido es exactamente lo que en S036 rompió la ficha con un 500:
`findCard` usa el mismo `toSummary` y no tiene usuario. Esta vez la prueba se escribió antes: sin la
columna, `owned` es `null` explícito, no `Number(undefined) === 1`, que daría `false` y diría *«no la
tienes»* a quien sí la tiene. Y el orden de parámetros: el `?` de la tenencia está en el `SELECT`, así
que su valor va el primero; al revés, MySQL compararía `user_id` con el id del juego y todas las filas
dirían "no" sin un solo error. También tiene su prueba.

### Un comentario que casi dejo escrito y era falso

Moví el registro del plugin JWT delante de las rutas del catálogo y lo justifiqué en un comentario:
*«un plugin sólo decora lo que se declara después de él, la lección de P-038»*. Antes de dejarlo lo
comprobé devolviéndolo a su sitio: **los 12 tests seguían pasando**. Un decorador de petición vale en
tiempo de ejecución para todas las rutas; P-038 mordió porque el limitador es un *hook*, que sí
depende del orden. El registro volvió a su sitio y el comentario dice ahora lo que se midió.

### La interfaz

- **Tabla, no tarjetas.** Son datos tabulares: el lector de pantalla anuncia cada celda con su
  cabecera, y las cifras se alinean con `tabular-nums`. El PS es una barra con tope fijo de 400 (el
  máximo del catálogo es 380) para que compare entre sets, no dentro de uno.
- **El raíl** es una lista de `button` con `aria-pressed`: un interruptor, y así se anuncia. Pulsar la
  fila activa la quita. Las secciones salen de los datos —sin tipos no hay sección de tipos—, que es
  lo que dejará a Magic reutilizarlo sin un `if (juego)` (D-1).
- **La marca de regulación explica su ausencia**: «Sin marca — anteriores a 2019: la marca aún no
  existía», nunca un guion.
- **Todo el estado en la URL** (`filtros-url.ts`, funciones puras con su prueba). Verificado en el
  navegador: el botón de atrás quita el último filtro.
- **En estrecho** el raíl se pliega tras «Filtros (n)», y la tabla se queda en número, carta, tipo y
  tenencia. Medido a 375 px: sin scroll horizontal.

### Lo que sólo se vio en pantalla

Al cargar, todo se pedía **dos veces** —como anónimo y luego con usuario— y durante medio segundo el
raíl invitaba a iniciar sesión a quien ya la tenía, con la barra de progreso al lado diciendo
«llevas 20». Las consultas esperan ahora a que la sesión esté validada. Y el título decía «Todo el
catálogo» con un set en la URL mientras llegaba la lista de sets.

**Verificado contra la base real** (20.433 impresiones de Pokémon): una cuenta de prueba con dos
sobres de *Scarlet & Violet* tiene 20 impresiones; `owned=yes` devuelve 20 filas, el raíl dice
«Planta 2 de 35» y Planta + «Me faltan» da **33**.

---

## T-094 — La ficha de carta, y lo que destapó ponerla junto a la imagen

### Un `<dialog>` nativo

`SelectorDeSet` tuvo que reimplementar en T-066 todo lo que un control nativo trae gratis. Aquí se hizo
al revés: `<dialog>` con `showModal()` deja inerte el resto de la página, de modo que el foco no se
escapa por detrás, y además cierra con `Escape` y se anuncia como diálogo. Lo único que no trae es
**devolver el foco a quien lo abrió**, y eso se hace a mano. Verificado con teclado: tras `Escape`, el
foco vuelve al nombre de la carta en la tabla.

**Se abre por la URL** (`?carta=6514`). El enlace se comparte con la ficha abierta, y el botón de atrás
la cierra en vez de sacarte del catálogo. El `Escape` nativo se intercepta para que también cierre por
la URL; si no, el diálogo se cerraría con la URL diciendo que sigue abierto.

El nombre de la carta en la fila **es** el botón que abre la ficha. Un botón «ver» por fila serían 300
botones iguales para un lector de pantalla.

### Lo específico de Pokémon

Ataques con su coste como puntos del color de cada tipo, leídos en voz alta como *«Coste: Planta,
Planta, Incoloro»*. Debilidad, resistencia y retirada sólo en Pokémon: en un Entrenador serían tres
«Ninguna» de ruido. **La marca de regulación explica su ausencia según la fecha**: el Charizard del Base
Set dice *«Sin marca: la carta es de 1999 y las marcas empezaron en 2019»*.

### Acciones

**Añadir a un mazo funciona**, y reutiliza el borrador del editor (`addCard`, `fromDeckDetail`,
`toPayload`) en vez de reescribir dónde va cada carta. Verificado contra la base: dos pulsaciones dejan
el mazo con `Arboliva x2 main`. **Añadir a la colección no se pinta**: la colección real llega en H9c, y
un botón que no hace nada es peor que no tener botón.

### P-042: el campo que faltaba desde H2

La ficha es la primera pantalla que pone la carta impresa al lado de lo que la base dice de ella. Y en
la primera carta que se abrió no cuadraba: la imagen de *Arboliva* muestra la habilidad *Enriching Oil*
y la ficha no. **El adaptador de Pokémon nunca leyó `abilities`**: `RawCard` no las declara. Queda
abierto como P-042, con T-097 para arreglarlo; lo caro es la reingesta, no el código.
`PtcgAbility` ya está declarado y la ficha lo pinta si existe.

---

## T-095 — La suite E2E, por rol, y lo que encontró al ampliarla

### Lo que de verdad estaba roto

El spec contaba **8 de 10 recorridos rotos** porque daba por hecho que H9b rediseñaba todas las
pantallas. No fue así: H9b rehízo el catálogo y añadió la ficha, y Sobres, Colección y Mazos siguen
como estaban. Medido antes de tocar nada: **3 de 11 fallaban**, dos por iconos de Yu-Gi-Oh! que aún no
se habían copiado a esta máquina y uno —la prueba de humo— por algo real.

La reescritura sigue siendo necesaria, y por el motivo del spec: **el rediseño visual que viene**
romperá todas las clases CSS. Una prueba que busca `.volteador` se cae con el primer cambio de nombre;
una que busca *«un botón con `aria-pressed` dentro de la región "Sobre #N"»* sobrevive.

### Buscar por rol obligó a que hubiera rol

La interfaz no tenía la semántica que la suite necesitaba, y añadirla mejoró la interfaz:

- Las columnas del editor son regiones con nombre: «Buscador de cartas» y «Tu mazo». La segunda se
  iba a llamar «Mazo» y chocaba con la única zona de Pokémon, que se llama igual: dos regiones
  anidadas con el mismo nombre son ambiguas para un lector de pantalla, no sólo para Playwright.
- Las zonas, los resultados, los problemas y la lista de mazos son listas con nombre. Se usa `role` en
  vez de `<ul>` donde la maquetación es de rejilla, para no reescribir CSS a ciegas.
- **El selector de sets no decía qué set tenía elegido.** Su `aria-label` era «Set» a secas, y una
  etiqueta tapa el contenido del botón: un lector de pantalla decía *«Set, botón»* y nunca el valor.
  Ahora dice *«Set: Pitch Black»*. Lo encontró escribir el selector de la prueba.
- Los dos `<select>` nativos de Sobres y Colección no tenían nombre accesible.

### P-043: la prueba de humo cazó un fallo de tres sesiones

Ampliada a las rutas nuevas, la prueba de humo llegaba al catálogo y encontraba **la página en
blanco**. La portada y el resto de pantallas guardaban cosas distintas bajo la misma clave de caché.
Reproducido con el código **anterior** a esta sesión: portada de Pokémon y luego Sobres eligiendo
Pokémon deja la aplicación vacía, y así llevaba desde S034. Arreglado de forma estructural
(`lib/consultas.ts`, una definición por consulta compartida) y con un límite de error para que una
pantalla rota no se lleve por delante la navegación. Detalle en P-043.

**Y una invalidación equivocada que salió de revisar las claves**: la ficha (T-094) invalidaba
`['mazo', id]` y `['mazos']` al añadir una carta, cuando las páginas de mazos usan `['deck', id]` y
`['decks']`. El editor habría seguido enseñando el mazo de antes. Corregido.

### Siete garantías, vistas fallar

Cada una se rompió a mano, se ejecutó sólo su prueba y se restauró:

| Garantía | Rotura | Resultado |
|---|---|---|
| Teclado del selector (T-066) | `Enter`/espacio dejan de elegir | falla |
| Movimiento reducido (T-040) | `PackReveal` ignora la preferencia | falla |
| Iconos locales (P-001) | `imageUrl` devuelve un dominio externo | falla |
| No desbordar la columna (P-030) | `.selector-set` con `min-width: 1400px` | falla |
| Foco devuelto al cerrar la ficha | sin `previo.focus()` | falla |
| «Me faltan» de verdad | el catálogo deja de mandar `owned` | falla |
| Caché con una sola forma (P-043) | la portada vuelve a su clave divergente | falla |

Después, la suite completa otra vez: **16 de 16**.

**Las comprobaciones del Vault me pararon dos veces** antes de cerrar: el recuento publicado de
recorridos seguía en 11, y el test de ASCII cazó `/^Añadir /`, una expresión regular con eñe que yo
acababa de escribir. Igual que en S034, el arreglo mejoró el código: una cadena en vez de una regex.

---

## Cierre de H9b, y la pregunta de D-1

El plan obliga a contestarla antes de construir la segunda sección: **¿puede Magic reutilizar lo que
Pokémon deja montado?** Revisado pieza por pieza:

| Pieza | ¿Sirve a Magic tal cual? |
|---|---|
| Estado en la URL (`filtros-url.ts`), chips, «cargar más» keyset | Sí |
| Sesión opcional, `owned` por fila y por faceta | Sí: no sabe de juegos |
| Raíl: secciones a partir de los datos, interruptores, «N de M» | Sí el mecanismo; **no** sus secciones |
| `listFacets` en la API | **No**: cuenta columnas de Pokémon (`elem_type`, `reg_mark`) |
| Fila de la tabla | **No**: PS, tipo y marca son de Pokémon. Magic querrá coste y colores |
| Ficha: diálogo, URL, foco, añadir a mazo | Sí |
| Ficha: el cuerpo (ataques, debilidad…) | **No**, a propósito |

**D-1 se sostiene, pero con una deuda que hay que nombrar:** lo compartido es el armazón —estado,
sesión, diálogo, raíl como mecanismo—, y lo que cambia por juego son **qué facetas existen** y **qué
columnas tiene la fila**. Hoy eso está escrito para Pokémon en tres sitios (API, raíl, fila). Antes de
la sección de Magic conviene un *perfil de facetas por juego*: una lista declarativa que diga qué
columnas cuenta la API, qué secciones pinta el raíl y qué celdas lleva la fila. Sin él, Magic sería
copiar y pegar tres ficheros, que es exactamente el riesgo que D-1 quería evitar.

---

## Verificación de la sesión

| Qué | Resultado |
|---|---|
| `npm test` | en verde, con el type-check de los tests |
| Suite E2E | **16 passed** —eran 11—, contra la API y la base reales |
| Garantías E2E rotas a propósito | 7 de 7 fallan |
| `npm run vault:mutar` | todas las derivas históricas detectadas |
| `npm audit` | 0 vulnerabilidades (T-096) |
| En el navegador | catálogo, raíl, chips, atrás, ficha, teclado, tema claro y 375 px |

**Entorno de esta máquina, para la próxima vez.** La base de Docker (`proyecto-tcg_db_data`) conserva
el catálogo completo. Las imágenes se copiaron del volumen `proyecto-tcg-prod_imagenes` (182.941
ficheros, montado en sólo lectura) a `storage/`. El puerto 3000 lo ocupa otro proceso, así que la API
local corrió en el 3001 con la proxy de Vite apuntando ahí. **Falta la clave de Pokémon en `.env`**
(T-005), que hará falta para T-097.

## Estado

- **H9b completo.** Abierta: **1** (T-097, habilidades de Pokémon).
- Problemas: **2 abiertos** (P-016, P-042) · 41 cerrados.
- Migraciones: hasta la **0027**, sin cambios en esta sesión.
- **Siguiente:** el rediseño visual que pidió el usuario —sobres recreados, apertura con motion
  graphics, tratamientos por rareza— y la lluvia de ideas. Ambos necesitan su spec.

---

## El rediseño: decidido sobre maquetas, no sobre palabras

Con H9b cerrado, la otra mitad de la petición del usuario: rediseño, apertura con motion graphics,
sobres por juego, estilos por rareza y una lluvia de ideas. Se hizo con maquetas en el navegador
(cartas reales del catálogo servidas por la API local), una pregunta por pantalla:

| Pregunta | Opciones enseñadas | Elegida |
|---|---|---|
| Dirección de arte | Holo Noir · Vitrina · Arcade Pop | **Holo Noir** |
| Cuántos diseños de sobre | Por juego · por época · por set · híbrido | **Híbrido** (recomendado) |
| El ritual | Completo · abanico · cascada | **Completo** |
| Rarezas | 5 niveles · 3 niveles · uno por rareza | **5 niveles**, con el acabado aparte |
| Motor | DOM · WebGL · híbrido | **Híbrido**, sin WebGL |
| Lluvia de ideas | 12 ideas | **11**, todas menos la app instalable |

**Una medición cambió una cifra de la maqueta**: decía «unos 17 diseños de época» y la base tiene
**25** plantillas de época y línea (10, 4 y 11). Se corrigió antes de enseñarla.

**Y una regla del Vault cambió el nombre del hito**: en la conversación era «H10», pero no se abre un
hito con el anterior sin cerrar. El criterio de H9 ya incluía el rediseño y su spec reservaba H9e para
el pulido, así que es **H9e, adelantado**. Spec: `17_Spec_H9e_HoloNoir.md`.

### El plan, y lo que corrigió del spec al mirar el código

`18_Plan_H9e_HoloNoir.md`, diez tareas (T-098 a T-107). Escribirlo contra el código y la base cambió
cinco cosas del spec, todas apuntadas al principio del plan:

1. **El nivel de brillo va por juego, no por tier global.** Magic acaba en tier 6 (la mítica es 4),
   Yu-Gi-Oh! llega a 15, y el 50 de ambos agrupa promos y etiquetas. Una tabla única habría hecho de
   una mítica un simple destello y dejado una Starlight sin nivel.
2. **No hay `reverse` en los datos**: las aperturas sólo devuelven `foil` y `nonfoil`.
3. **Las pruebas de T-040 no pueden quedar intactas al cien por cien**: con el sobre sellado, las
   cartas no existen hasta rasgar. Se mantienen las aserciones; el ayudante gana un paso.
4. **La anticipación de un nivel 5 no se puede probar E2E de forma determinista**, porque el servidor
   decide las cartas. Va a la máquina de estados y a mirarlo en el navegador.
5. **El DOM del ritual tiene un orden obligatorio**, bandeja antes que mazo, y la bandeja no se escala:
   la prueba de T-040 lee la matriz de transformación para saber si el giro terminó.

Y una decisión de diseño que evita una deriva antes de que exista: el arte de cada set y las cartas de
su sobre salen del **mismo fragmento SQL** (`plantilla-sql.ts`), con una prueba que exige que las dos
consultas lo contengan literalmente.

La paleta Holo Noir que lleva el plan **ya pasa** el test de contraste en los dos temas: se calculó con
la misma fórmula antes de escribirla. Y la comprobación del Vault cazó el propio plan: nombraba entre
comillas de código la migración 0028, que todavía no existe.

## H9e ejecutado (2026-10-16): T-098 a T-107

El plan se ejecutó con un subagente por tarea y dos revisiones entre tareas, una de cumplimiento del
spec y otra de calidad. Cada corrección volvió al mismo agente que había hecho la tarea. Rama
`h9e-holo-noir`, 26 commits, sin fusionar.

### Lo que cazaron las revisiones, y que el plan traía escrito

- **Colores literales en el CSS** del plan, fuera de `tokens.css`, se movieron a tokens.
- **La clase `.brillo` chocaba** con la capa de foil vieja y se renombró con el prefijo `carta-brillo`.
- **Pruebas vacuas en T-099**: se reescribieron hasta verlas fallar.
- **La paleta elegía el marco y los grises**: ahora recorta la ilustración según el juego y pesa
  saturación² × valor. Se revisó sobre hojas de contacto.
- **Plantilla sin desempate**: dos plantillas empatadas podían dar un arte distinto del sobre que
  entrega el motor. Se resolvió con `, t.id` en el fragmento compartido.
- **`clip-path` recortaba la sombra y el anillo de foco** del sobre, y su flotación infinita impedía
  que Playwright lo diera por estable.
- **Partículas por fotograma y sin tope de `devicePixelRatio`**: en una pantalla de 120 Hz el efecto
  iba al doble de velocidad. Ahora se simulan por tiempo y el `devicePixelRatio` tiene tope de 2.
- **Las rarezas se congelaban antes de llegar**: el orden se calculaba con un mapa vacío. Ahora la
  página espera a tenerlas.
- **Sin región viva ni pies de foto en el resumen**: un lector de pantalla no oía qué salía. Ahora
  oye cada carta revelada.

### Verificación

Se miró en pantalla con Playwright sin cabecera, porque el panel del navegador oculto no ejecuta
`requestAnimationFrame`:

- el catálogo y la ficha en Holo Noir;
- la inclinación medida con el puntero;
- el ritual entero sobre *151*;
- una caja de 24 sobres con anticipación y rayos a 59-60 fps;
- la sombra y los pies de foto en el tema claro.

La suite E2E pasa de 16 a **22 recorridos** con `ritual.spec.ts`. Se rompió a mano cada garantía y se
vio fallar la prueba correspondiente:

- el teclado;
- el foco tras rasgar;
- Saltar;
- que no haya lienzo con movimiento reducido;
- P-001;
- que el arte salga de la plantilla del motor;
- la región viva.

**Y la revisión de T-107 cazó una prueba vacua en la propia T-107**: la del teclado esperaba 800 ms
fijos tras rasgar, y sin esa espera el bucle de cartas no daba ni una vuelta (el mazo aún no estaba
pintado), con la aserción final cumpliéndose sobre cero cartas. Ahora espera el foco en la carta de
arriba, comprueba en cada vuelta que el foco llegó solo y cuenta las cartas reveladas, que tienen que
ser más de cero. La prueba de P-001, además, sólo miraba el sobre sellado: ahora mira también las
imágenes de las cartas, que es por donde se colaría una URL externa.

Al repetir la suite muchas veces se agotó el cupo de altas de la API, y hubo que reiniciarla para
vaciarlo. El fallo era de cupo, no de las pruebas.

### Lo que queda

- **Del usuario**: generar las 25 ilustraciones (`19_Prompts_Sobres.md`) y decidir si se fusiona la
  rama.
- **Pendiente**: T-097, la hoja de ruta de la lluvia de ideas y el perfil de facetas por juego antes
  de Magic.

## La revisión final de la rama, y lo que encontró entre tareas

Una revisión de la rama entera (`fee44dd..HEAD`) buscó lo que ninguna revisión por tarea podía ver:

- **Un sobre sin paleta salía transparente.** La reserva usaba `--dorso-*`, que sólo existe bajo
  `[data-juego]`, y `/sobres` no lo pone. En local no se notaba porque la base ya tenía paletas. En
  un clon recién hecho, que no tiene paletas hasta lanzar `npm run sobres:paleta`, se habría visto
  en todos los sets. Se arregló de dos formas, cada una suficiente por sí sola:
  - el ritual lleva su `data-juego`;
  - la reserva tiene su propio valor por defecto.

  Se añadió un recorrido E2E que borra las paletas con `page.route`. Fallaba sin el arreglo, y la
  suite queda en **23 recorridos**.
- **Una apertura que llegaba después de cambiar de juego se pintaba como el juego nuevo**, y el
  ritual la congelaba así. La carrera ya existía antes de esta rama, pero ahora el error quedaba
  fijo. La petición guarda su juego y la respuesta de otro juego se descarta.
- **Correcciones menores:**
  - Saltar ya no dispara los efectos.
  - Los sobres en espera son `inert` y el activo se desplaza a la vista.
  - La etiqueta «N nuevas» ya no destripa el sobre antes del resumen.
  - Se quitaron dos tokens muertos.
  - La carta sin imagen tiene estilo.
  - El orden y los niveles se calculan una sola vez.
  - «Sobre #» pasó a `es.ts`.

**Quedan anotadas, sin hacer:**
- partículas que nacen en el centro de la escena y no en la carta revelada;
- `CartaConBrillo` en la Colección (spec §6);
- el halo de nivel 3 con el color de tipo de Pokémon;
- un reflejo del sobre que siga al puntero;
- deslizar para voltear;
- «Reintentar» si falla la apertura;
- `pattern` en el esquema de `palette`.

Ninguna rompe nada. Son el siguiente pulido.

## Las 25 ilustraciones de sobre (2026-10-17)

El usuario generó las 25 con Nano Banana Pro. Esa herramienta no ofrece la proporción 2:3, así que se
pasó el prompt base a 9:16: con `cover` se pierde un 4 % arriba y otro abajo, frente al 9 % por lado
que habría recortado 3:4.

**Llegaron como JPEG de 1536 × 2752 con la extensión `.webp`**, unos 3,4 MB cada una y 80 MB en
total. El navegador las habría pintado sin quejarse. Se convirtieron a WebP de verdad, a 640 px de
ancho (de sobra para el sobre de 210 px en una pantalla 3×) y calidad 82: quedaron entre 69 y 146 KB,
2,7 MB en total. Los originales no entran en el repositorio.

Para que la lista escrita a mano no se desfase, `tools/arte-sobres.test.ts` comprueba tres cosas:
- cada clave de `DISPONIBLES` tiene su fichero;
- cada fichero tiene su clave;
- cada fichero es WebP por su cabecera, no por su extensión, y pesa 150 KB como mucho.

Se vio fallar de tres formas: con un JPEG original devuelto a su sitio, con un fichero que faltaba y
con una clave borrada.

Las 25 claves que devuelve la API para los sets abribles coinciden **exactamente** con las 25
ilustraciones. Se miraron todas en pantalla, en una hoja de contacto con un sobre por época, y
encajan con el emblema y el título.

Dos cosas que ya venían de antes se ven ahora más:
- el «icono» de set de Yu-Gi-Oh! es una foto del producto y parece una pegatina sobre el arte;
- los nombres largos ocupan tres o cuatro líneas y se montan sobre la ilustración.

### Los nombres largos, que ya caben (2026-10-17)

Antes todos los nombres iban a 18 px y sin tope de líneas. Los sets abribles van de «151» a 65
caracteres, y Yu-Gi-Oh! tiene 79 de más de 28. Por eso los largos ocupaban cuatro líneas y se
montaban sobre la ilustración.

Ahora la talla baja según la longitud (`tallaDelNombre`):

| Longitud | Talla |
|---|---|
| hasta 18 caracteres | 18 px |
| hasta 28 | 15 px |
| hasta 42 | 13 px |
| más | 11,5 px |

Además hay un tope de tres líneas con puntos suspensivos. El nombre completo sigue en el nombre
accesible del botón.

**Medido en el navegador con los 757 nombres**, con la fuente real:
- 555 caben en una línea;
- 198 en dos;
- los 4 más largos en tres;
- ninguno llega a recortarse.

Revisado en pantalla: todos quedan dentro de la franja tranquila del arte.
