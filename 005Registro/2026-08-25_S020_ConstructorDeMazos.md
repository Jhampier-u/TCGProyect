# S020 — Constructor de mazos, 1.ª pasada: el backend (H7)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Arranca con H7."*

Se acordó el alcance antes de escribir código: **backend primero**, sólo RN-04 (sin Commander ni
legalidad por formato), y reemplazo completo del contenido en vez de operaciones carta a carta. El
spec quedó en [`04_Spec_H7_Deckbuilder.md`](../004Arquitectura/04_Spec_H7_Deckbuilder.md) y el plan
de diez tareas en [`05_Plan_H7_Deckbuilder.md`](../004Arquitectura/05_Plan_H7_Deckbuilder.md).

## Qué se ha construido

| Pieza | Dónde |
|---|---|
| Motor de reglas, puro y sin base de datos | `packages/shared/src/deck-rules/` (6 módulos) |
| `DeckRepository` | `apps/api/src/db/deck-repository.ts` |
| Seis rutas autenticadas | `apps/api/src/api/deck-routes.ts` + `deck-schemas.ts` |
| `requireUser` extraído y compartido | `apps/api/src/api/require-user.ts` |

**No hizo falta ninguna migración.** `decks` y `deck_cards` estaban en la `0001` desde S002, sin
usar. La primera vez que el esquema se adelanta al código y acierta.

Cuatro decisiones que conviene no reabrir, todas justificadas en el spec: el motor vive en
`@tcg/shared` para que el frontend lo reutilice sin ir al servidor (D1); guardar **nunca** se bloquea
por validación, porque un mazo de 60 cartas pasa por 59 estados inválidos (D2); las copias se cuentan
por `oracle_key`, no por impresión (D3); y un mazo ajeno responde **404, no 403** (D6).

## Las trampas del spec, medidas contra datos reales

El spec (§3.3) marcaba cuatro predicados que fallan en silencio. Dos estaban medidos antes de
empezar; los otros dos se confirmaron aquí, ingestando cartas de verdad.

| Predicado | Resultado |
|---|---|
| YGO Extra Deck | Los **10** `type_line` del catálogo clasificados uno a uno: los cuatro `Fusion/Synchro/Xyz/Link` al Extra y el resto —incluido `Toon Effect Monster`— al Main. La grafía real es **`Xyz`**, no `XYZ` |
| YGO banlist | `banlist_info` sólo aparece en cartas restringidas; su ausencia significa 3 copias |
| MTG tierra básica | **60** `type_line` distintos ingestados, **5** clasificados como básica (`Basic Land — Plains/Island/Swamp/Mountain/Forest`) y **ninguna** línea con "basic" quedó sin clasificar |
| PTCG Energía Básica | **13** cartas de Energía ingestadas, **las 13 Especiales**. La trampa queda confirmada: un `supertype === 'Energy'` a secas las habría dejado sin límite. **El caso positivo NO se ha podido confirmar** |

**Lo que falta por medir, dicho claramente.** Ninguno de los 8 sets de Pokémon ingestados contiene
una Energía Básica, así que el lado positivo del predicado sigue siendo deducido, no medido. Y las
tierras nevadas (`Basic Snow Land`) tampoco aparecen en los 2 sets de Magic ingestados. Queda como
**T-050**.

Y hay una causa concreta: la ingesta acotada procesa los sets por `released_at DESC`, y los sets
modernos no reimprimen Energías Básicas. Es **T-023**, que hasta hoy parecía una molestia de orden y
resulta ser también un sesgo de muestreo cuando se usa la ingesta para verificar.

## P-024 — La API no ha expuesto el id de la carta desde H3

Apareció montando la verificación extremo a extremo, que necesita el id de la carta para agrupar
impresiones. `GET /api/cards` no lo devolvía.

**Causa.** El esquema de respuesta declaraba `cardId` desde S013; el repositorio devolvía `id`.
Fastify elimina lo que el esquema no declara **y** omite lo que el objeto no lleva, así que los dos
desaparecían. Nadie se enteró porque ninguna pantalla lo usaba todavía — aunque el
`CardSummary` del frontend lleva `cardId` declarado y llevaba dos sesiones leyendo `undefined`.

Es la otra cara de **P-022**: allí el esquema declaró de más y filtró 1032 URLs; aquí declaró el
nombre equivocado y calló un campo. La serialización por esquema garantiza que no sale lo que no
declaras, no que salga lo que sí.

**Solución.** El repositorio pasa a emitir `cardId` — que es además el nombre correcto, porque
`printId` viaja al lado y un `id` a secas es ambiguo. `tsc` encontró el único consumidor
(`auth-routes.ts`) al renombrar.

### El test que escribí primero era vacuo, y lo fue dos veces

Vale la pena dejarlo escrito, porque es exactamente el error que P-022 dejó como lección.

1. **Primer intento:** comprobar la respuesta HTTP con un catálogo falso. Pasaba con el bug puesto —
   el doble devuelve la fixture ya construida y `toSummary` no se ejecuta nunca.
2. **Segundo intento:** un objeto anotado como `CardSummary` comparado con las claves del esquema.
   También pasaba con el bug puesto: Vitest borra los tipos, y **`tsc` excluye los ficheros de
   test**, así que la anotación no la comprobaba nadie.
3. **El que vale:** exportar `toSummary` y ejecutarla de verdad, comparando las claves que produce
   con las que declara el esquema. **Comprobado reintroduciendo el bug: falla.**

La lección no es "escribe tests". Es que **un test sólo vale si lo has visto fallar**.

## Verificación

**Automática:** 270 tests (202 previos + 56 del motor + 11 de rutas + 1 de P-024), `tsc --build`
limpio, `npm audit` limpio.

**`DeckRepository` contra MySQL real**, no con dobles: el duplicado `(impresión, zona)` se fusiona a
4 en vez de violar `uq_deck_card_zone`; `game_data` llega ya parseado como objeto; un mazo ajeno lee
`null`; `deck_cards` cae por cascada y el segundo `remove` devuelve `false`.

**Recorrido completo contra la API levantada en Docker**, con 489 impresiones de Yu-Gi-Oh! y 290
cartas distintas ingestadas:

| Paso | Resultado |
|---|---|
| Mazo recién creado | `main_too_small` |
| 40 cartas distintas | **válido**, `counts.main = 40` |
| Un `Link Effect Monster` en el Main | `wrong_zone` |
| Cuatro copias de la misma carta | `too_many_copies (5/3)` |
| La misma carta en **dos impresiones**, 2+2 | `too_many_copies (4/3)` — cuentan como una |
| Otro usuario pide el mazo | **404** |
| Borrar y volver a pedir | 200 y luego 404 |
| `http` en el cuerpo de la respuesta | **false** |

## Dos observaciones menores, anotadas para H8

- **El esquema del cuerpo se valida antes que el token.** Un `POST /api/decks` anónimo con cuerpo
  vacío responde 400, no 401: es el orden del ciclo de vida de Fastify y vale igual para las rutas
  de H6. Sólo revela la forma del cuerpo, que es superficie pública, pero conviene que esté escrito.
  Queda como **T-051**, con un test que lo deja registrado.
- **`DELETE` con `content-type: application/json` y sin cuerpo responde 400.** Descubierto porque el
  script de verificación ponía la cabecera siempre. Es comportamiento estándar de Fastify, no un
  fallo, pero cualquier cliente que fije la cabecera de forma global se lo va a encontrar.

## Estado
- **H7 al 50 %**: el backend está hecho y verificado. Faltan **T-047** (interfaz del constructor) y
  **T-048** (import/export).
- El motor ya sale de `@tcg/shared`, así que T-047 podrá revalidar en el cliente sin ir al servidor.
