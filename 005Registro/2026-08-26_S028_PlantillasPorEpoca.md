# S028 — Plantillas por época en los dos juegos, y un rollback que no lo era (T-034, T-068)
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

## Lo que NO se ha hecho, y por qué

| ID | Qué queda |
|---|---|
| **T-069** (P-033) | LAVD es una caja de Structure Decks con sus 153 impresiones marcadas `in_boosters = 1`. Es un criterio del adaptador, no una plantilla |
| **T-070** | El informe mide el techo **por set**, y por eso no vio que el 28,5 % del slot de Pokémon pedía rarezas que **ningún** set del juego tiene. Se midió a mano con SQL; debería salir del informe |
| **T-067** | **MAMO y MAMS** no tienen ni una carta común y la plantilla pide ocho. **Black Bolt y White Flare** tienen el 40 % del set en Illustration Rare y su plantilla les da el 10,2 %. En los cuatro, la carta del chase ya es alcanzable; lo que falta es que el sobre se parezca al producto |

Los tres salieron de medir. Ninguno se ha tapado subiendo un número.

## Un apunte de higiene

Los 300 sobres de la verificación se abrieron **de verdad** contra la base de desarrollo, así que el
usuario 1 tiene ahora esas aperturas y su colección de LOB. Es una base local y abrir sobres es lo
que hace la aplicación, pero conviene saberlo antes de sacar conclusiones de esos datos.

## Estado
- **H8 cerrado.** H8a (suite E2E), H8b (seguridad) y H8c (las ocho de deuda técnica).
- **T-068 cerrada también**, fuera de H8c: salió del informe que se escribió para T-034.
- Abiertas: T-065, T-066, T-067, T-069, T-070 y T-005, que depende del usuario.
- Problemas: 7 abiertos · 28 cerrados.
