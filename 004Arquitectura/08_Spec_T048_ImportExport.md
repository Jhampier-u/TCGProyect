# 08 — Spec T-048 · Import/export de mazos (H7, 3.ª y última pasada)

**Fecha:** 2026-08-25 · **Sesión:** S022 · **Estado:** aprobado por el usuario, pendiente de plan

Última pasada de H7. Cierra la última épica de producto del alcance v1.0: después de esto sólo queda
H8, el endurecimiento.

---

## 1. Qué se construye

| Pieza | Dónde | Qué hace |
|---|---|---|
| **Corrección de P-027** | `packages/shared/src/deck-rules/` | Las copias se cuentan por **nombre**, no por `oracleKey` |
| Códecs de formato | `packages/shared/src/deck-formats/` | Texto ↔ líneas. Puros, sin base de datos |
| Resolución | `apps/api/src/db/deck-repository.ts` + `deck-routes.ts` | `POST /api/decks/resolve`: líneas → impresiones del catálogo |
| `oracleKey` en el catálogo | `apps/api/src/db/catalog-query-repository.ts` + `schemas.ts` | El cliente lo necesita para exportar `.ydk` |
| Interfaz | `apps/web/src/components/DeckTransferencia.tsx` | Exportar e importar desde el editor |

---

## 2. P-027 — el validador de Pokémon no aplica RN-04

**Medido, no argumentado.** RN-04 dice "máximo 4 copias **por nombre**". `aggregate()` agrupa por
`oracleKey`, y en Pokémon `oracle_key` es `set-número` (`me1-113`): **una por impresión**.

En el catálogo ingestado hay **775 nombres en 1279 filas** de `cards`; `Acerola's Mischief` tiene
cuatro. Ejecutado contra el motor:

```
16 copias de "Acerola's Mischief" en 4 impresiones distintas
  valido: true      problemas: []
```

En Magic y Yu-Gi-Oh! no ocurre: sus `oracle_key` son el `oracle_id` y el *passcode*, estables entre
impresiones. Medido: **92/92 y 290/290** nombres únicos.

**No se vio en S020** porque las cartas de Pokémon se ingestaron al final de aquella sesión, después
de escribir el validador.

### La corrección

`aggregate()` agrupa por `entry.name`. `CardTally` gana un `oracleKey` representativo —el primero
visto— para que `DeckIssue` pueda seguir referenciando la carta desde la interfaz.

**Y hay que mover tres cosas más, o la corrección rompe en silencio lo que hoy funciona.** Los tres
validadores construyen su mapa de excepciones indexado por `oracleKey` y luego lo consultan con la
clave de `byCard`:

| Fichero | Qué indexa hoy por `oracleKey` | Debe pasar a indexar por nombre |
|---|---|---|
| `mtg.ts` | `sinLimite`, las tierras básicas | sí |
| `ptcg.ts` | `sinLimite`, las Energías Básicas | sí |
| `ygo.ts` | `limites`, el tope de la banlist por carta | sí |

Si se cambia `aggregate` y no estos tres, la exención de tierras básicas, la de Energías Básicas y
**la banlist entera** dejan de aplicarse sin un solo error. Los tests actuales lo detectan —cada uno
tiene su caso—, y por eso el orden es: cambiar, ver los tests en rojo, arreglar los tres, verlos en
verde. Sin ese paso intermedio no hay prueba de que los tests cubrían nada.

### Un test cuya fixture no se parecía a la realidad

`aggregate.test.ts` tiene este caso:

```ts
it('no colapsa dos cartas con oracle_key distinto (Nidoran, P-013)', () => {
  aggregate([
    entry({ oracleKey: 'nidoran-m', name: 'Nidoran' }),
    entry({ oracleKey: 'nidoran-f', name: 'Nidoran' }),
  ]);
  // espera 2 grupos
});
```

Con agrupación por nombre daría 1 y el test fallaría. **Pero el test está mal, no la corrección:** en
la realidad esas dos cartas **no se llaman igual**. P-013 registró que se llaman `Nidoran` seguido de
♂ y de ♀, y que colapsarlas fue precisamente el bug. La fixture usaba un nombre inventado que no
existe en ningún catálogo.

Se corrige la fixture a los nombres reales —construidos con `String.fromCharCode`, porque el fuente
se mantiene en ASCII— y el test vuelve a decir lo que decía, ahora con datos fieles. Es otra vez la
lección de P-022: **la fidelidad de la fixture determina lo que el test puede detectar.**

Se añade además el caso que hoy falla: mismo nombre, `oracle_key` distinto, 16 copias → inválido.

---

## 3. Códecs de formato

`packages/shared/src/deck-formats/`, puros y sin base de datos, por el mismo motivo que el motor de
reglas: el editor ya tiene el mazo entero en memoria, así que **exportar no debe generar ni una
petición**, y el backend reutiliza el mismo parser al importar.

```ts
export interface DeckLine {
  quantity: number;
  zone: DeckZone;
  /** Nombre tal como aparece en el texto. Ausente en .ydk, que solo lleva passcodes. */
  name?: string;
  /** Identificador del origen: passcode de YGO, `set-numero` de PTCG. */
  externalId?: string;
  setCode?: string;
  collectorNumber?: string;
}

export interface FormatWarning {
  line: number;
  text: string;
  reason: 'unparsable' | 'unknown_section' | 'zero_quantity';
}

export function parseDeck(game: GameCode, texto: string): {
  lines: DeckLine[];
  warnings: FormatWarning[];
};

export function serializeDeck(game: GameCode, entries: readonly DeckExportEntry[]): string;
```

`DeckExportEntry` es lo mínimo para escribir: `{ name, oracleKey, setCode, collectorNumber, zone,
quantity }`.

Un fichero por juego, porque los tres formatos no se parecen en nada.

### MTG — `mtg.ts`

Formato de texto plano, el que aceptan Arena y los constructores web:

```
4 Lightning Bolt
2 Snow-Covered Forest

Sideboard
2 Pyroblast
```

- Se acepta `Deck` y `Sideboard` como cabeceras, y también **una línea en blanco** como separador
  del sideboard, que es como lo escriben muchas listas.
- Se acepta el sufijo opcional `(M10) 146`, que fija la impresión exacta.
- Al escribir: `N Nombre`, y `Sideboard` sólo si hay sideboard.

### YGO — `ygo.ts`

El `.ydk`, que es el formato universal del juego:

```
#created by ProyectoTCG
#main
89631139
89631139
#extra
!side
```

- **Un passcode por línea y por copia**: tres copias son tres líneas. No hay cantidades.
- El passcode es exactamente nuestro `oracle_key` para Yu-Gi-Oh!, así que **el round-trip es exacto**
  y no hay ambigüedad posible.
- `#main`, `#extra` y `!side` marcan la zona. Ojo: el separador del side es `!`, no `#`.

### PTCG — `ptcg.ts`

El formato de PTCG Live:

```
Pokemon: 12
4 Pikachu SVI 47

Trainer: 30
4 Acerola's Mischief ME1 113

Energy: 18
Total Cards: 60
```

- Las cabeceras de sección son informativas: agrupan por supertipo, no por zona. Al leer se ignoran
  y todo va a `main`, que es la única zona que Pokémon usa.
- `SVI 47` es el set y el número: unidos en minúsculas dan `svi-47`, que es nuestro `oracle_key`.
- La cabecera lleva `Pokémon` **con acento**. El fuente se mantiene en ASCII puro, así que se
  construye con `String.fromCharCode`; al leer se aceptan las dos grafías.

---

## 4. Resolución — `POST /api/decks/resolve`

El cliente parsea con el códec compartido y manda las líneas. El servidor las resuelve contra el
catálogo y **no muta nada**.

```
POST /api/decks/resolve
  { game: 'YGO', lines: DeckLine[] }
->
  { resolved: Array<{ printId, name, typeLine, gameData, setCode, collectorNumber,
                      rarity, imagePath, zone, quantity }>,
    unresolved: Array<{ name?, externalId?, quantity, zone }> }
```

**No muta el mazo a propósito.** El cliente mete lo resuelto en el borrador, el usuario ve el informe
y guarda cuando quiere: D5 del spec de H7 sigue en pie. Un import que escribiera directo en la base
de datos se saltaría el editor entero.

La resolución, **una consulta por petición**, no una por línea:

| Juego | Criterio |
|---|---|
| YGO | Por `cards.oracle_key` = passcode |
| PTCG | Por `cards.oracle_key` = `set-numero` si viene; si no, por nombre |
| MTG | Por `cards.name`, comparación exacta con la intercalación de la base (`utf8mb4_0900_ai_ci`, que ya ignora mayúsculas y acentos) |

Si la línea trae set y número, se prefiere esa impresión exacta. Si no, **la de menor `printId`**,
que es determinista y reproducible.

La respuesta devuelve lo mismo que el buscador necesita para construir un `DraftCard`, para que el
cliente no tenga que pedir el detalle de cada carta importada.

Tope: `maxItems` en el esquema, igual que en `PUT /api/decks/:id/cards`, para que un pegado enorme se
rechace antes de tocar la base de datos.

---

## 5. Un hueco de identidad, el tercero seguido

Exportar un `.ydk` necesita el passcode, que es el `oracle_key` real. **`CARD_SUMMARY` no lo
declara**, así que una carta añadida desde el buscador no lo lleva y no se podría exportar.

Es la tercera vez en tres sesiones que al cliente le falta un campo de identidad que el servidor ya
tiene: **P-024** (`cardId` no salía), **T-052** (`oracleKey` y `gameData` no salían del mazo), y
ahora esto.

Se añade `oracleKey` a `CardSummary`, a `toSummary` y al esquema. El test de P-024 —que compara las
claves que produce `toSummary` con las que declara `CARD_SUMMARY`— **obliga a que los dos lados se
muevan juntos**, y es lo que evita que esto vuelva a pasar una cuarta vez.

`DraftCard` gana también `oracleKey`, y el buscador lo rellena desde el detalle.

---

## 6. Interfaz

Un componente en el editor, `DeckTransferencia`, con dos acciones.

**Exportar** vuelca el mazo a texto y lo muestra en un área de texto de sólo lectura, seleccionable.
**No genera ninguna petición**: el borrador ya tiene todo. No se ofrece descarga de fichero: en
bastantes contextos el navegador la bloquea, y un área de texto que se copia funciona siempre.

**Importar** acepta un pegado, parsea, llama a `resolve` y muestra el informe:

- cuántas cartas entraron;
- las que no están en nuestro catálogo, con nombre y cantidad, para que el usuario sepa exactamente
  qué falta;
- los avisos del parser, si alguna línea no se entendió.

Importar **reemplaza** el borrador, no lo mezcla: pegar una lista es traer un mazo, no añadirlo al que
ya hay. Se pide confirmación si el borrador tiene cartas.

---

## 7. Errores

| Situación | Qué pasa |
|---|---|
| Texto vacío o sin ninguna línea válida | Aviso "no se ha reconocido ninguna carta"; el borrador no se toca |
| Todas las cartas fuera del catálogo | El informe las lista todas y el borrador queda vacío |
| Fallo de red al resolver | Aviso y el borrador intacto; se puede reintentar |
| Línea con cantidad 0 o negativa | Se descarta con un aviso del parser |
| Formato equivocado para el juego | El parser devuelve avisos; no se lanza ninguna excepción |

Ningún códec lanza. Un texto pegado es entrada de usuario y llega sucio por definición.

---

## 8. Verificación

**Tests de tabla de los tres códecs**, incluyendo lo que trae cualquier lista real:

- Round-trip `serialize → parse → serialize` idéntico, en los tres juegos.
- `CRLF` y líneas en blanco.
- Comentarios (`#` en `.ydk`, y líneas que no encajan en MTG).
- MTG: sideboard por cabecera **y** por línea en blanco; sufijo `(SET) NUM` presente y ausente.
- YGO: tres copias son tres líneas; `!side` con `!` y no con `#`.
- PTCG: cabeceras con y sin acento; `Total Cards:` se ignora al leer.
- Cantidad 0, cantidad pegada al nombre, texto vacío: avisos, sin excepciones.

**Tests de P-027**: 16 copias de un mismo nombre en cuatro `oracle_key` distintos → inválido. Y los
tres casos de excepción —tierra básica, Energía Básica, banlist— siguen funcionando tras reindexar.

**En navegador real**, con Docker levantado:

1. Construir un mazo de 40 cartas de Yu-Gi-Oh! y exportarlo.
2. **Comprobar en el panel de red que exportar no genera ninguna petición.**
3. Vaciar el mazo, pegar el `.ydk` exportado e importarlo: reconstruye **el mismo mazo**.
4. Pegar una lista con una carta inventada: aparece en el informe de no resueltas y el resto entra.

**Criterios de aceptación:** `tsc --build` limpio, `vite build` limpio, toda la suite en verde,
`npm audit` limpio.

---

## 9. Tareas

| ID | Tarea | Agente |
|---|---|---|
| T-054 | **P-027**: contar copias por nombre y reindexar las excepciones de los tres validadores | Backend / QA |
| T-048a | Códecs de los tres formatos en `@tcg/shared` | Backend |
| T-048b | `oracleKey` en `CARD_SUMMARY` y `POST /api/decks/resolve` | Backend |
| T-048c | `DeckTransferencia`: exportar e importar desde el editor | Frontend |
| T-048v | Verificación en navegador real | QA |

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambiar la agrupación rompe en silencio las tres excepciones | Se cambia primero, se ven los tests en rojo y se arreglan. Sin ver el rojo no hay prueba de cobertura |
| Con pocos sets ingestados casi todo import quedará a medias | Es el comportamiento acordado: informe honesto en vez de fallo total. La verificación lo ejercita a propósito |
| El formato de PTCG Live cambia con el tiempo | El parser ignora lo que no entiende y avisa; no se rompe, informa |
| `Pokémon` con acento en el fuente | Se construye con `String.fromCharCode`, como el guion largo de `predicates.ts` |
