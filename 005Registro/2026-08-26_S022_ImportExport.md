# S022 — Import/export de mazos: H7 cerrado (T-048)
**Fecha:** 2026-08-26 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sigue con T-048."*

Spec en [`08_Spec_T048_ImportExport.md`](../004Arquitectura/08_Spec_T048_ImportExport.md), plan de
nueve tareas en [`09_Plan_T048_ImportExport.md`](../004Arquitectura/09_Plan_T048_ImportExport.md).

**Con esto se cierra H7 y, con él, la última épica de producto del alcance v1.0.** Sólo queda H8.

## P-027 — el validador de Pokémon no aplicaba RN-04

Apareció **antes de escribir una línea de T-048**, al investigar con qué identidad cuenta las copias
cada juego, que es justo de lo que dependen los tres formatos de texto.

RN-04 dice "máximo 4 copias **por nombre**". `aggregate()` agrupaba por `oracleKey`, y en Pokémon esa
clave es `set-número`: **una por impresión**. Medido en el catálogo ingestado: **775 nombres en 1279
filas** de `cards`. Ejecutado contra el motor:

```
16 copias de "Acerola's Mischief" en 4 impresiones distintas
  antes -> valido: true   problemas: []
  ahora -> valido: false  problemas: ["too_many_copies"]
```

En Magic y Yu-Gi-Oh! no ocurría: sus claves son el `oracle_id` y el *passcode*, estables entre
impresiones. Medido: **92/92 y 290/290** nombres únicos. No se vio en S020 porque las cartas de
Pokémon se ingestaron al final de aquella sesión, después de escribir el validador.

### Cambiar la agrupación sin más habría roto tres cosas en silencio

Los tres validadores indexaban sus excepciones por `oracleKey` y las consultaban con la clave de
`byCard`. El plan exigía **ver el rojo antes de tocarlos**, y aparecieron seis:

| Rojo | Causa |
|---|---|
| `la tierra basica no tiene limite` · `la tierra basica NEVADA tampoco` | Exención de Magic |
| `la Energia Basica no tiene limite` | Exención de Pokémon |
| `la banlist aprieta el limite: Limited admite 1` · `Semi-Limited admite 2 y Banned ninguna` | Mapa de la banlist de Yu-Gi-Oh! |
| `SUMA las impresiones distintas de la misma carta` | Una aserción que buscaba por `oracleKey` |

Cinco de las tres causas previstas —dos tenían dos casos cada una— y una aserción de test. **Si no
hubieran salido en rojo, la exención de tierras básicas, la de Energías Básicas y la banlist entera
habrían dejado de aplicarse sin que nada lo dijera.**

### Un test cuya fixture no se parecía a la realidad

`aggregate.test.ts` daba a las dos cartas de Nidoran el nombre `Nidoran` a secas, que no existe en
ningún catálogo. P-013 registró que se llaman `Nidoran` seguido de ♂ y de ♀, y colapsarlas fue el
bug. Corregida a los nombres reales, construidos con `String.fromCharCode`. Es otra vez la lección de
P-022: **la fidelidad de la fixture determina lo que el test puede detectar.**

## Los tres códecs

`packages/shared/src/deck-formats/`, puros y sin base de datos, por el mismo motivo que el motor de
reglas: el editor ya tiene el mazo entero, así que **exportar no debe generar ni una petición**.

| Juego | Formato | Tests |
|---|---|---|
| MTG | Texto plano, `Sideboard` por cabecera **y por línea en blanco** | 13 |
| YGO | `.ydk`: un passcode por línea y por copia, `!side` con `!` | 10 |
| PTCG | PTCG Live, con secciones por supertipo y `Total Cards` | 10 |
| — | Registro `parseDeck`/`serializeDeck` | 4 |

En Yu-Gi-Oh! el passcode **es** nuestro `oracle_key`, así que la ida y vuelta no tiene ambigüedad.

### Dos errores cazados en la revisión del plan, antes de escribir código

- La regex de Magic escrita como `\s*[xX]?\s+` **no acepta `4 Lightning Bolt`**: exige dos tramos de
  espacio donde sólo hay uno. La forma con `4x` funcionaba y la normal no.
- El parser de Pokémon con una sola regex de nombre perezoso y grupo opcional se rompe con nombres
  que acaban en cifra, como `Team Rocket's Great Ball ME2PT5 205`. Se separó en dos pasos.

### Y uno cazado al releer el código propio

`ptcg.ts` tenía dos `é` **literales** dentro de regex —no en comentarios—, copiados de mi propio
plan. El proyecto exige ASCII puro en el código. Sustituidos por normalización con `\p{M}`, que es lo
que ya hace `normalizeRarityCode`; ahora acepta las dos grafías por construcción y no por
enumeración.

## `POST /api/decks/resolve`

El cliente parsea con el códec compartido y manda las líneas; el servidor las resuelve contra el
catálogo en **una consulta** y devuelve dos listas. **No muta nada**: el cliente mete lo resuelto en
el borrador y el usuario guarda cuando quiere, así que D5 del spec de H7 sigue en pie.

Verificado contra MySQL real:

| Comprobación | Resultado |
|---|---|
| YGO por passcode | `Infinite Impermanence -> print 317 x3` |
| PTCG por `set-numero` | `Bulbasaur (MEG 1)` |
| Mezcla | 1 resuelta, 1 no resuelta con su informe |
| **Clave de PTCG pedida como YGO** | **No resuelve** — el filtro por juego funciona |
| Misma petición dos veces | Misma impresión: determinista |

El cuarto punto importa: sin ese filtro se podrían colar cartas de otro juego en un mazo por la
puerta de atrás del import.

## El tercer hueco de identidad seguido

Exportar un `.ydk` necesita el passcode, y `CARD_SUMMARY` no declaraba `oracleKey`. Es la tercera vez
en tres sesiones que al cliente le falta un campo de identidad que el servidor ya tiene: **P-024**
(`cardId`), **T-052** (`oracleKey` y `gameData` del mazo) y ahora ésta.

Lo que evitó la cuarta fue el test de P-024, que compara las claves que produce `toSummary` con las
que declara el esquema y **obliga a mover los dos lados a la vez**.

Al añadirlo, `tsc` falló en `deck-draft.test.ts`. Detalle útil: **`tsc` sí comprueba los tests de
`apps/web`** —su tsconfig no los excluye—, al revés que los de `api` y `shared`.

## Verificación en navegador real

El panel del navegador sigue sin componer imágenes en este entorno, así que se verificó por DOM y por
panel de red. La apariencia sigue pendiente (T-053).

| Comprobación | Resultado |
|---|---|
| Exportar un mazo de 40 cartas | `.ydk` de 44 líneas: 4 cabeceras + 40 passcodes |
| **Peticiones que genera exportar** | **Cero** |
| Vaciar el mazo (40 borrados) | Cero peticiones |
| Importar el `.ydk` de vuelta | `Entraron 40 cartas.` · `Mazo valido` · 40/40-60 |
| **Reexportar y comparar** | **Idéntico byte a byte al original** |
| Peticiones que genera importar | **Una**, a `/api/decks/resolve` |
| Importar con dos passcodes inventados | `Entraron 2 cartas.` y los dos listados como ausentes |
| URLs externas en el HTML renderizado | **`null`** (P-001) |

También se vio funcionando el arreglo de concordancia de S021: la barra dice **"1 cosa por
resolver"**, no "1 cosas".

## Verificación final

| Comprobación | Resultado |
|---|---|
| `npm test` | **332/332** |
| `tsc --build` | limpio |
| `vite build` | 374 kB |
| `npm audit` | 0 vulnerabilidades |

## Estado
- **H7 ✅ COMPLETADO.** Motor de reglas, seis endpoints, interfaz e import/export.
- **Con H7 se cierra la última épica de producto del alcance v1.0.** Queda **H8**: Cypress,
  auditoría de seguridad y la deuda técnica acumulada.
