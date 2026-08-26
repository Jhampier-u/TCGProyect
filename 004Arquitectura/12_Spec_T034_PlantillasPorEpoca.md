# 12 — Spec · T-034: plantillas de sobre por época (Yu-Gi-Oh!)

**Estado:** aprobado · **Sesión:** S028 · **Fecha:** 2026-08-26
**Corrige:** P-021 y el hueco que la medición destapó en los sets modernos
**Depende de:** ADR-005 (los sobres son datos, no código)

---

## 1. El problema, medido

T-034 está fichada como un problema de los sets anteriores a 2020. **No lo es.** Medido sobre los
sets de Yu-Gi-Oh! del catálogo:

| Set | Salida | Pool | Techo | Inalcanzables |
|---|---|---|---|---|
| LOB *Legend of Blue Eyes* | 2002-03-08 | 358 | 70,7 % | `rare`, `short_print`, `super_short_print` |
| TDGS *The Duelist Genesis* | 2008-09-02 | 111 | 72,1 % | `rare`, `ultimate_rare`, `ghost_rare` |
| BOSH *Breakers of Shadow* | 2016-01-14 | 100 | 76,0 % | `rare`, `short_print` |
| ETCO *Eternity Code* | 2020-04-30 | 105 | 95,2 % | `starlight_rare` |
| LAVD *Legendary Arc-V Decks* | 2026-08-06 | 153 | 88,2 % | `starlight_rare`, `new` |
| MAMO *Magnificent Monsters* | 2026-09-04 | 206 | **68,9 %** | `starlight_rare`, `grand_master_rare` |
| MAMS *Magnificent Maestros* | 2026-11-12 | 66 | **36,4 %** | `starlight_rare`, `grand_master_rare` |

**Los sets modernos están peor que el de 2002.** P-019 se cerró en S015 con una plantilla que pide
`quarter_century_secret_rare`, y estos sets traen `starlight_rare` y `grand_master_rare`.

**Por qué el respaldo del motor no lo tapa.** `#poolFor` actúa cuando la rareza **pedida** está vacía
en el set: entonces entrega otra. Nunca añade una rareza que ninguna slot nombra. Una rareza que la
plantilla no menciona es inalcanzable, y no hay aviso: el motor no sabe que le falta nada.

`01_Producto.md` define al **coleccionista** como uno de los tres usuarios objetivo: *"quiere ver su
colección virtual crecer y medir su completitud por set"*. Hoy no puede cerrar **ningún** set de
Yu-Gi-Oh!, ni antiguo ni moderno.

---

## 2. Qué se construye

### 2.1 La época es una propiedad de la plantilla, no del set

`pack_templates` gana dos columnas: `valid_from DATE NULL` y `valid_to DATE NULL`. Una plantilla con
ventana se aplica a los sets cuya `released_at` cae dentro.

**Por qué así y no una plantilla por set.** La alternativa registrada en S015 era asignar `set_id` a
cada set según su fecha, lo que exige un paso de asignación **posterior a la ingesta**: miles de
filas, y hay que volver a ejecutarlo cada vez que aparece un set. Ese paso era el bloqueo real de
T-034 desde hace trece sesiones. Con la ventana en la plantilla, el paso **desaparece**: la
resolución la hace la consulta que ya elegía plantilla.

Precedencia en `findTemplate`, de más específica a menos:

1. Plantilla propia del set (`set_id = s.id`) — como hoy
2. Plantilla de época cuya ventana contiene `s.released_at`
3. Plantilla por defecto del juego (`set_id IS NULL AND is_default = 1`)

Un set con `released_at` nulo cae al paso 3, que es lo correcto: sin fecha no hay época.

**El índice único no estorba.** `uq_templates_one_default (game_id, set_key, default_guard)` permite
una sola plantilla con `is_default = 1` por (juego, set). Las de época llevan `is_default = 0` y se
eligen por ventana, así que el índice sigue garantizando exactamente un respaldo por juego.

**Las ventanas no se solapan, y se comprueba.** Solaparlas haría que la plantilla elegida dependiera
del orden de filas. Un test lo verifica sobre lo que hay en la base, no sobre lo que dice el plan.

### 2.2 Las cuatro épocas

Tabla de composición de Yugipedia, ya capturada en la cabecera de la migración `0006`. Los cortes se
han verificado contra las fechas del catálogo.

| Época | Ventana | Estructura |
|---|---|---|
| 1 | 2002-03-08 → 2008-09-01 | 8 comunes + 1 carta (Secret 1/24, Ultra 1/12, Super 1/4, resto **Rare**) |
| 2 | 2008-09-02 → 2016-01-13 | 7 comunes + 1 **Rare** + 1 (Secret 1/24, Ultra 1/12, Super 1/4, resto Common) |
| 3 | 2016-01-14 → 2020-04-29 | 7 comunes + 1 **Rare** + 1 (Secret 1/12, Ultra 1/6, resto Super) |
| 4 | 2020-04-30 → presente | 8 comunes + 1 (Secret 1/12, Ultra 1/6, resto Super) — **es la actual por defecto** |

Fechas de corte, comprobadas en el catálogo: LOB 2002-03-08 · TDGS 2008-09-02 · BOSH 2016-01-14 ·
ETCO 2020-04-30.

### 2.3 Las rarezas que la tabla oficial no menciona

Yugipedia documenta los slots, no cada rareza que un set puede traer. Las que faltan entran en el
slot que les corresponde por naturaleza, **con peso estimado y marcado como tal** — el mismo
tratamiento que la QCSR recibió en la `0006`, y por el mismo motivo: ADR-005 hizo esto configurable
por datos para que afinar la fidelidad sea un `UPDATE`.

| Rareza | Dónde entra | Por qué | Origen del peso |
|---|---|---|---|
| `short_print`, `super_short_print` | slots de comunes | En el producto real son Comunes impresas en menor cantidad, no un slot aparte | **[ESTIMADO]** — no hay tasa publicada |
| `ultimate_rare`, `ghost_rare` | slot *hit* de la época 2 | Rarezas paralelas: sustituyen ocasionalmente a la carta del slot superior | **[ESTIMADO]** |
| `starlight_rare` | slot *hit* de las épocas 3 y 4 | Apareció con *Ignition Assault* (2020-01-30), dentro de la época 3 | **[ESTIMADO]** ~ 1/288 |
| `grand_master_rare` | slot *hit* de la época 4 | Presente en el catálogo (36 impresiones entre MAMO y MAMS); sin tasa publicada | **[ESTIMADO]** |

Los pesos oficiales se reescalan para que cada slot siga sumando 1000. Cada migración lleva la
aritmética en la cabecera.

**`new` NO entra en ninguna plantilla.** Es la cadena que YGOPRODeck usa para las cartas inéditas de
*Legendary Arc-V Decks*, que es un producto de **mazos**, no de sobres. Meterla en una plantilla de
Core Booster sería describir mal el producto para que un número suba. Ver §5.

### 2.4 La comprobación que faltaba

**Nada mide hoy si un set es completable.** Ni P-019 ni P-021 los detectó una prueba: los destapó
mirar aperturas reales. Es lo más valioso de esta tarea.

Se añade:

- **`rarezasInalcanzables(slots, rarezasDelPool)`**, función pura en `apps/api/src/packs/`. Devuelve
  las rarezas presentes en el pool que ninguna slot nombra. Definición deliberadamente conservadora:
  no se le acredita al respaldo global lo que pueda alcanzar, porque sólo actúa cuando la
  distribución entera de una slot está vacía.
- **Un informe de CLI** que la ejecuta contra la base real y saca la tabla de §1 para los tres
  juegos. Criterio de aceptación: **cero inalcanzables** en los Core Booster de Yu-Gi-Oh!
- **Un test de coherencia**: toda rareza nombrada en una plantilla debe existir en `rarities` para
  ese juego. Una errata en el JSON de una slot la deja muerta hoy sin decir nada.

---

## 3. Lo que NO cambia

- **El motor de sobres.** No se toca ni una línea: el problema siempre fue de datos, que es lo que
  ADR-005 anticipó.
- **Las aperturas ya realizadas.** `pack_openings.template_snapshot` congela la configuración vigente
  al abrir y la reproducción lee `pack_opening_cards` (P-005, RN-01). Cambiar plantillas no reescribe
  el pasado. La `0006` ya se enfrentó a este caso y la salvaguarda aguantó.
- **MTG y Pokémon.** Sus plantillas quedan con las columnas de ventana a `NULL` y la resolución cae
  al paso 3, exactamente como hoy.

---

## 4. Verificación

| Qué | Cómo |
|---|---|
| Precedencia de plantilla | Test: set con plantilla propia, set dentro de una ventana, set sin fecha |
| Ventanas sin solape | Test contra las filas reales de `pack_templates` |
| Rarezas de plantilla existen | Test contra `rarities` |
| Techo de completitud | Informe de CLI sobre la base real, antes y después |
| Migración | Ciclo up → down → up contra MySQL real |
| El historial no se toca | Reproducir una apertura anterior a la migración y comparar |

**Cada comprobación se verifica en rojo antes de darla por buena.** Es la lección de P-029 (una
salvaguarda inerte que pasaba por el valor por defecto) y de P-022 (un test que pasaba en vacío
porque la fixture devolvía `null`).

---

## 5. Fuera de alcance, dicho

**Los productos que no son sobres.** *Legendary Arc-V Decks* es una caja de Structure Decks y sus 153
impresiones están marcadas `in_boosters = 1`; la aplicación ofrece abrir un sobre de ella. La
suposición de P-014 —"en Yu-Gi-Oh! los productos que no son sobres son sets aparte"— es cierta, pero
el adaptador marca esos sets como abribles igualmente. Se registra como problema y tarea propios.

**Los sets de composición atípica.** MAMO y MAMS **no tienen ni una carta común** y la plantilla pide
ocho: los ocho slots caen al respaldo en cada sobre. Con esta tarea sus rarezas pasan a ser
alcanzables y el techo llega al 100 %, pero **alcanzable no es realista**: un sobre de MAMO seguirá
sin parecerse al producto. Describirlos bien exige una plantilla propia, que es un `INSERT` cuando se
decida hacerlo. Se registra como tarea aparte en vez de fingir que esta la resuelve.
