# S030 — The List y el slot de tierra: P-008 cerrado del todo (T-085)

**Fecha:** 2026-08-28 · **Cierra:** P-008 (puntos 1 y 2) · **Migración:** 0026

---

## Requerimiento del usuario

> "Arregla los otros dos puntos de P-008"

Los dos que quedaban tras cerrar el punto 3 en S029. A diferencia de aquél, éstos **no se arreglan con
datos**: el motor sólo sabía elegir dentro del pool `(set_id, rarity_id)` del set que se abre, y las
dos cosas piden que sepa algo más.

---

## Qué había que poder expresar

**1. The List.** Uno de cada ocho Play Booster trae, en su séptimo cartón, una carta de un set aparte
—`plst`, 4654 impresiones en sobre— que no está en el pool del set abierto. No había forma de decir
"esta entrada saca la carta de otro sitio".

**2. El slot de tierra.** Las tierras básicas son rareza `common` en Scryfall, así que un slot que
pide `common` entrega cualquier común. El sobre no llevaba la tierra que el producto real lleva.

---

## El motor: dos cosas, y una invariante que ninguna puede romper

`distribution` admite ahora una entrada `{"set":"plst","weight":125}`, excluyente con `rarity`. Y
`pack_slots` tiene una columna `card_filter`.

**El pool ajeno se carga perezosamente**, sólo cuando la tirada elige esa entrada. Traer 4654 filas en
cada apertura para usarlas una de cada ocho veces sería pagar el coste ocho veces de más. Tiene su
prueba: con peso 0, el repositorio no recibe ni una petición.

**La invariante es que un slot consume exactamente tres valores del PRNG**: entrada, impresión y
acabado. Si una entrada de otro set gastara uno de más, la misma semilla daría cartas distintas según
si salió The List o no, y RN-01 dejaría de significar nada. Está comprobado con dos plantillas
idénticas salvo por el primer slot: la carta del **segundo** tiene que coincidir, y sólo coincide si
el primero gastó lo mismo. Lo mismo con un filtro que no deja candidatos.

**La lista de filtros es cerrada, por CHECK en la base.** Un `type_line LIKE` libre con una errata
—`Basic Lnd%`— no casaría con nada, vaciaría el slot, y el respaldo del motor lo taparía entregando
una común cualquiera: sin error, sin aviso, con el sobre alterado. Es la misma familia de fallo que
P-034 y que las rarezas fantasma de T-081. Comprobado a mano contra la base:

```
mysql> UPDATE pack_slots SET card_filter="basic_lnd" WHERE slot_index=11 LIMIT 1;
ERROR 3819 (HY000): Check constraint 'ck_slots_card_filter' is violated.
```

---

## El fallo que encontraron las pruebas, y era del motor

La primera versión de `#poolDeOtroSet` devolvía **una sola rareza para todo el grupo** de candidatos.
Dentro de un set conviven rarezas distintas, así que se entregaba una carta y se apuntaba la rareza de
otra — exactamente la discrepancia entre `open()` y `replay()` contra la que el propio código llevaba
avisando en un comentario desde H4.

Lo destapó la prueba de reparto uniforme: esperaba ~10% de `special` en un pool de 90 comunes y 10
especiales, y salieron **cero**. El arreglo fue que cada candidato lleve su propia rareza, no el
grupo. Es un tipo `Candidato { entry, rarityCode }` de cuatro líneas, y sin la prueba habría entrado
en producción sin que nada fallara.

---

## Y el error que sólo destapó medir

La primera versión puso The List en el **comodín** (slot 12). Parecía el sitio natural —es el slot "de
cualquier rareza"— y estaba mal.

Medido con 4000 sobres: The List salía al 12,8%, la tierra al 100%… y los sobres con cuatro o más
raras seguían en **0,00%**. Que es literalmente el síntoma que P-008 describe y que esto tenía que
arreglar.

La razón, una vez vista, es obvia: **el comodín ya podía entregar una rara**. Meter The List ahí no
añade una fuente de raras, la sustituye. El producto real la pone en el séptimo cartón, sustituyendo a
una **común**, y P-008 lo decía con todas sus letras desde el principio:

> "The List de MTG (**12,5 % del slot 7**) no se modela."

Tenía la respuesta escrita delante y diseñé sin releerla. La migración no estaba publicada, así que se
corrigió en sitio; el error queda en su cabecera porque es la parte que no se deduce del SQL.

---

## The List va sólo en el Play Booster

Apareció en 2020 en los **Set Booster**, un producto que este proyecto no modela, y pasó al Play
Booster en 2024. El Draft Booster —la época 3 de la 0025, de 2008 a 2024— **nunca la llevó**. Ponérsela
sería inventar un producto que no existió. Verificado: 2000 sobres de `ktk` dan 0 cartas de The List.

---

## La época 3 se reordena, y hay que decir por qué

La 0025 metió en su slot 10 tres cosas a la vez: la común, la probabilidad de foil y las rarezas de
inserto. Lo hizo **porque no había filtro de tipo**: la tierra no era expresable, así que el slot de
tierra y el hueco variable eran el mismo sitio a la fuerza. Ahora sí se separan, que es como es el
producto real —el foil y el inserto sustituyen a una común, y la tierra básica es un slot propio—.

No cambia el número de cartas del sobre ni ninguna rareza deja de ser alcanzable.

**La época 2 no se toca.** Los sobres anteriores a 2008 no tenían slot de tierra: eran 11 comunes, 3
infrecuentes y 1 rara.

---

## El número que importa no era el que medí primero

La primera medición fue "1962 tierras básicas en 112 sets, de 207 con pool" → 95 sets sin tierra.
Falso como cifra operativa: **sólo dos de las cuatro épocas tienen slot de tierra**. De los 135 sets
que caen en Draft Booster o Play Booster, **58 no traen tierras básicas y 77 sí**.

Los 58 salen por su nombre en `npm run packs:cobertura`, que es donde tienen que estar: es fidelidad
perdida, no un fallo, y lo que no se publica se termina contando a mano (T-070).

---

## Verificación

```
8000 sobres de blb ("Play Booster")
raras+miticas por sobre:
  1:  5655  70.69%
  2:  2101  26.26%
  3:   241  3.01%
  4:     3  0.04%
sobres con carta de The List: 1020  12.8%
sobres con tierra basica:     8000  100.0%

2000 sobres de ktk ("Draft Booster")
  1:  2000  100.00%
sobres con carta de The List: 0  0.0%
sobres con tierra basica:     2000  100.0%
```

**El síntoma de P-008 está corregido**: cuatro o más raras pasan de ser estructuralmente imposibles a
salir el 0,04% de las veces, contra el "<1% en los reales" que el problema citaba.

| Qué | Resultado |
|---|---|
| `npm run build` | limpio |
| `npm test` | **409/409** en 32 ficheros |
| Suite E2E | **10 passed** |
| `npm run packs:cobertura` | "Todos los sets son completables", los tres juegos |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| CHECK de `card_filter` | rechaza una errata, comprobado a mano |

**Una nota sobre la medición de The List.** De cuatro corridas, tres dieron 12,6-12,8% y una dio
11,0%, que son cuatro desviaciones típicas y no debería haber pasado. `pickWeighted` medido aparte
sobre 200.000 tiradas da 12,453%, y una sonda que mira sólo el slot 6 da 12,60%. Se deja escrito el
valor atípico en vez de callarlo: el mecanismo está comprobado por otras dos vías, pero la corrida rara
existió.

---

## El rollback, probado

La 0026 sólo hace UPDATEs sobre slots existentes y añade una columna, así que no hay nada del tipo
P-035 que vigilar. Aun así se ejecutó: la columna y su CHECK desaparecen, no queda ni una entrada
`{"set":...}`, y los cuatro slots tocados vuelven exactamente a su valor de la 0025. Reaplicada, el
estado vuelve a ser el de arriba.

El orden del `.down.sql` importa y está dicho en él: **primero las `distribution`, después la
columna**. Dejar una entrada de otro set con el motor de una versión anterior la haría elegir una
rareza inexistente, y el respaldo lo taparía sin decir nada.

---

## Lo que se encontró de paso y NO se arregló aquí

`apps/api/tsconfig.json` excluye `src/**/*.test.ts`, así que **los ficheros de prueba no se comprueban
de tipos nunca**. Vitest los ejecuta quitando los tipos sin mirarlos.

La consecuencia es concreta: `class FakeRepo implements PackRepository` en `pack-service.test.ts` no
implementaba un método de esa interfaz y no falló nada. Se descubrió a mano al añadir `loadPoolByCode`.
Se arregló ese doble —ahora implementa lo que dice implementar— pero no la causa.

Medido: activarlo destapa **44 errores**, y la gran mayoría son la misma forma —pruebas que pasan un
`undefined` explícito para simular un campo ausente, que `exactOptionalPropertyTypes` rechaza—. Es una
tarea propia, no un apéndice de ésta, y meterla aquí habría enterrado el trabajo de verdad. Queda
anotada.

---

## Un apunte de higiene

Las mediciones abrieron unos **28.000 sobres** de verdad contra la base de desarrollo, sobre `blb` y
`ktk`, con el usuario 1. Es una base local y abrir sobres es lo que hace la aplicación, pero conviene
saberlo antes de sacar conclusiones de esos datos. Tercera sesión seguida con esta nota; si las
mediciones van a ser rutina, merecería la pena un usuario de pruebas aparte.

---

## Estado

- **P-008 CERRADO**, veintisiete sesiones después de abrirse en T-008 (S003, 2026-08-25).
- Tareas abiertas: **0**. Bloqueadas: **0**. Problemas: **1 abierto** (P-016 🟠, riesgo operativo
  permanente, no trabajo) · 39 cerrados.
- Migraciones publicadas: hasta la **0026**.
