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
