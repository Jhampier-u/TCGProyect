# S029 — Las tres épocas del sobre de Magic (T-084)

**Fecha:** 2026-08-28 · **Cierra:** el punto 3 de P-008 · **Migración:** 0025

---

## Requerimiento del usuario

> "Arregla lo de Magic"

Referido a lo que había salido al comprobar el estado de cierre de S028: Magic tenía **una sola
plantilla** de sobre y **208 sets abribles anteriores a 2018** resolvían a ella.

---

## Lo que estaba mal, y lo que no

Conviene separarlo porque es fácil confundirlo con un problema de cobertura, y no lo era.

**No era un error de rarezas.** El vocabulario de Magic —common, uncommon, rare, mythic— lleva treinta
años estable, y por eso una sola plantilla bastaba para que todo fuera alcanzable. Eso ya lo había
medido T-077: 1045 sets, 207 con pool, y sólo nueve rotos, por los insertos.

**Era un error de estructura.** Un sobre de 1995 eran 15 cartas sin foil. El Play Booster son 14 con
un slot foil garantizado y un comodín. Abrir *Tempest* entregaba un sobre de 2024: catorce cartas, una
de ellas foil segura, en un producto de una época en la que **el foil no existía**.

---

## Las fronteras no se eligieron: se midieron

Dos de las tres están en los datos, y ésa es la diferencia entre poner épocas y adivinarlas.

**El foil.** Medido con `JSON_CONTAINS` sobre `card_prints.finishes`, set por set:

```
1998-10-12  usg  Urza's Saga      356 impresiones,   0 con foil
1999-02-15  ulg  Urza's Legacy    143 impresiones, 143 con foil
```

Los 40 sets anteriores no tienen ni una impresión foil. La frontera es un día concreto y el catálogo
lo dice solo.

**La mítica.** Primera impresión `mythic`: 2008-10-03, *Shards of Alara*. Ni una antes, 2392 después.

**El Play Booster, 2024-02-09.** Ésta *no* sale de los datos —es un cambio de formato, no de
vocabulario— y se dice así en la migración. Lo que sí se comprobó es que cae limpia entre dos sets: el
último Draft Booster del catálogo es de 2024-01-12 y el primer Play Booster de 2024-02-09.

El reparto resultante, sin que **ningún set quede a caballo de dos épocas**:

| Época | Sets | Desde | Hasta |
|---|---|---|---|
| 1 · clásico, sin foil | 40 | 1993-08-05 | 1998-11-01 |
| 2 · foil, sin mítica | 54 | 1999-02-15 | 2008-09-22 |
| 3 · Draft Booster | 310 | 2008-10-03 | 2024-01-12 |
| 4 · Play Booster *(ya existía)* | 115 | 2024-02-09 | — |

---

## La trampa, y por qué había que buscarla antes de escribir nada

Ésta es la parte que podría haber salido mal en silencio.

La **0016** (T-077) metió `special` y `bonus` en el slot 13 del Play Booster para arreglar nueve sets.
**Ocho de esos nueve son anteriores a 2024.** Al darles su época dejarían de resolver a la plantilla
que los arreglaba, y volverían a tener cartas inalcanzables — deshaciendo, sin avisar, el trabajo de
la sesión anterior.

Medido uno a uno antes de diseñar las plantillas:

```
2006-10-06  tsb   121 special   -> época 2
2014-06-16  vma     9 bonus     -> época 3
2016-09-30  mps    54 special   -> época 3
2017-04-28  mp2    54 special   -> época 3
2020-09-26  plst    4 special   -> época 3
2020-11-20  cmr     1 special   -> época 3
2021-03-19  tsr   121 special   -> época 3
2022-06-10  clb     1 special   -> época 3
2023-08-04  cmm     1 special   -> época 3
```

Por eso la época 2 nombra `special` y la 3 nombra `special` y `bonus`. **La época 1 no nombra
ninguna**, porque ningún set anterior a 1999 las tiene y una plantilla no debe pedir lo que no existe
(T-070).

---

## El hueco variable

En las épocas 2 y 3 hay un slot que no es una común normal. En el producto real ese sitio lo ocupan
tres cosas que se turnan, y **las tres sustituyen a una común**: la foil (desde 1999), la carta de
inserto —la *timeshifted* de borde morado de Time Spiral, los Masterpiece— y, desde 2008, la tierra
básica. Se modela como un slot de común con probabilidad de foil y con las rarezas de inserto
nombradas.

**La tierra sigue sin poder expresarse, y esta migración no lo tapa.** Las tierras básicas son rareza
`common` en Scryfall; distinguirlas exige filtrar por `type_line`, que el pool no indexa. Es el punto
2 de P-008 y sigue abierto. Aquí la tierra es una común más, igual que ya lo era en el Play Booster.

---

## Los números, y de dónde sale cada uno

| Valor | Origen |
|---|---|
| mítica 125 / rare 875 | **[OFICIAL]** Wizards publica "1 de cada 8 sobres lleva una mítica" para el Draft Booster. 125/1000 = 1/8 |
| `foil_chance` 0,22 | **[ESTIMADO]** derivado de un dato oficial: "aproximadamente 1 de cada 67 cartas es foil". Un sobre de 15 → 15/67 = 0,224 |
| special 15 / bonus 5 | **[ESTIMADO]** los mismos pesos que la 0016 fijó. No hay tasa publicada y usar dos escalas para lo mismo sería peor que usar una |

El Play Booster mantiene su 140 de mítica: es otro producto y esta migración no lo toca.

## Lo que la migración simplifica, dicho en ella

La época 3 son **dieciséis años con un solo `foil_chance`**. La tasa real subió a lo largo del
periodo: el 1-de-cada-67 es de los primeros años, y para 2020 los sobres llevaban foil mucho más a
menudo. Se modela con un valor porque no hay una serie publicada por bloque, y partir la época en
trozos que no se pueden justificar sería inventar precisión. Si aparece el dato, es un `UPDATE`
(ADR-005).

---

## El Play Booster no se toca

Sigue siendo la plantilla **por defecto** del juego (`is_default = 1`, sin ventana), así que un set sin
fecha de salida o posterior a 2024 sigue cayendo en ella. Mismo patrón que Pokémon en la 0018: las
épocas se añaden, la moderna se queda de red. **Ante la duda, la estructura actual.**

---

## La comprobación que no existía

`template-eras.test.ts` comprobaba solapes de ventanas y rarezas huérfanas… de Yu-Gi-Oh! y Pokémon.
**Magic no estaba, y no era un descuido: no tenía ventanas.** Una sola plantilla de 1993 a 2026 no
puede solaparse consigo misma. En cuanto la 0025 le dio tres épocas, la comprobación pasó a hacer
falta, y se añadió en la misma sesión.

Y se comprobó que **no es vacua**: adelantando a mano el inicio de la época 2 a 1998-06-15, el test
falla con el mensaje correcto —*"Booster con foil (sin mítica)" empieza antes de que acabe "Booster
clásico (sin foil)"*— y vuelve a pasar al restaurarlo. Un test de solapes que nunca ha visto un solape
no ha demostrado nada.

Un detalle que costó un intento: la `0003` no entra en la lista de migraciones cuyas `distribution` se
revisan, porque **siembra las plantillas de los tres juegos a la vez** y el lector no sabe de quién es
cada una. Meterla hacía que las rarezas de Pokémon contaran como huérfanas de Magic. Los otros dos
juegos tampoco la incluyen; ahora está dicho por qué.

---

## Verificación

Cien sobres de cada época, abiertos de verdad contra la base:

```
lea  1993-08-05  "Booster clasico (sin foil)"
     15.0 cartas/sobre · foils 0.00/sobre
     common 11.00 · uncommon 3.00 · rare 1.00
tmp  1997-10-14  "Booster clasico (sin foil)"
     15.0 cartas/sobre · foils 0.00/sobre
     common 11.00 · uncommon 3.00 · rare 1.00
rav  2005-10-07  "Booster con foil (sin mitica)"
     15.0 cartas/sobre · foils 0.25/sobre
     common 11.00 · uncommon 3.00 · rare 1.00
ktk  2014-09-26  "Draft Booster"
     15.0 cartas/sobre · foils 0.18/sobre
     common 11.00 · uncommon 3.00 · rare 0.95 · mythic 0.05
blb  2024-08-02  "Play Booster"
     14.0 cartas/sobre · foils 1.17/sobre
     common 9.25 · uncommon 3.49 · rare 1.09 · mythic 0.17
```

Un sobre de 1993 y uno de 2024 ya no son el mismo objeto. **Cero foils** en la época clásica, que es
lo que había que conseguir.

La mítica de `ktk` salió 0,05 por sobre en la muestra de 100 —contra el 0,125 esperado— y eso son 2,3
desviaciones típicas: suficiente para no darlo por bueno. Repetido con **400 sobres: 47, una cada
8,5**, contra la tasa oficial de una cada 8. Convergía; era ruido.

| Qué | Resultado |
|---|---|
| `npm run build` | limpio |
| `npm test` | **399/399** en 31 ficheros |
| Suite E2E | **10 passed** |
| `npm run packs:cobertura` | "Todos los sets son completables", los tres juegos |
| Reparto MTG | 119 Draft Booster · 42 con foil · 30 clásico · 16 Play Booster |

---

## Y el rollback, probado con aperturas encima

P-035 nació de un `.down.sql` que nadie había ejecutado. Éste se ejecutó, y en el peor escenario
posible: **las tres plantillas nuevas tenían ya 800 aperturas** de la propia verificación.

Aplicado a mano, hizo lo que su cabecera dice: borró los slots, no pudo borrar las plantillas
—`pack_openings` es `ON DELETE RESTRICT`, y hace bien— y las **retiró**, quitándoles la ventana y
marcándoles el nombre. Comprobado después:

- los cuatro sets de prueba resuelven a `Play Booster`, ninguno se queda **sin plantilla** y ninguno
  elige una retirada — una plantilla sin `set_id`, sin `product_line`, sin fechas y con
  `is_default = 0` no la selecciona ningún nivel de la precedencia;
- una apertura cuya plantilla está retirada **sigue devolviendo sus cartas** (RN-01, P-005).

Reaplicada la `up`, el reparto vuelve a ser idéntico al de antes del rollback. Las tres filas
retiradas se quedan en la base de desarrollo como lo que son: la huella de haber probado el rollback.

---

## Un apunte de higiene

Los sobres de la verificación se abrieron **de verdad** contra la base de desarrollo: unas 900
aperturas del usuario 1, sobre `lea`, `tmp`, `rav`, `ktk` y `blb`. Es una base local y abrir sobres es
lo que hace la aplicación, pero conviene saberlo antes de sacar conclusiones de esos datos. Misma nota
que en S028, y por el mismo motivo.

---

## Estado

- **P-008 pierde su punto 3.** Los tres juegos tienen ya sus épocas: Pokémon seis (0018), Yu-Gi-Oh!
  cuatro más seis líneas de producto (0010, 0017, 0020-0023) y Magic cuatro (0025).
- **Siguen abiertos sus puntos 1 y 2**, y los dos son de más calado que éste: modelar *The List*
  —que extrae cartas de **otros** sets— y el filtro por tipo del slot de tierra. Los dos exigen que el
  pool sepa algo más que `(set_id, rarity_id)`, que es un cambio de motor, no de datos.
- Tareas abiertas: **0**. Bloqueadas: **0**. Problemas: **2 abiertos** (P-008 🟡 y P-016 🟠) · 38
  cerrados.
- Migraciones publicadas: hasta la **0025**.
