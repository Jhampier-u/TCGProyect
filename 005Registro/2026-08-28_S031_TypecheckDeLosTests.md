# S031 — Los ficheros de prueba no se comprobaban de tipos (T-086)

**Fecha:** 2026-08-28 · **Origen:** hallazgo de S030 · **Sin migración**

---

## Requerimiento del usuario

> "Arregla lo del tsconfig de los tests"

Lo que había salido al añadir `loadPoolByCode` a `PackRepository` en S030: un doble de prueba declaraba
`implements PackRepository` sin implementar la interfaz, y **nada falló**.

---

## Qué estaba mal

`apps/api/tsconfig.json` y `packages/shared/tsconfig.json` llevan `"exclude": ["src/**/*.test.ts"]`.
Es correcto —los tests no deben acabar en `dist`— y tenía una consecuencia que nadie había escrito:
**`tsc` no los miraba nunca**. Vitest los ejecuta quitando los tipos con esbuild, sin comprobarlos.

Resultado: en un fichero de prueba, `implements` no significaba nada, un `as never` tapaba cualquier
hueco, y una firma podía divergir del contrato real durante meses.

`apps/web` sí los incluía. El E2E era el tercer caso, y peor: **no tenía `tsconfig.json` en absoluto**,
porque Playwright también transpila con esbuild y la suite no es un workspace de npm (ADR-009).

---

## Lo que se encontró al encender la luz

25 errores en `apps/api`, cero en `packages/shared`, uno en el E2E. **No eran ruido: tres familias, y
dos son exactamente el fallo que este agujero permite.**

### 1. Un doble que mentía sobre su interfaz — 14 errores

`FakeRepo implements IngestRepository` en `ingest-service.test.ts` **no implementaba
`findSetsByExternalId`**, que es la que resuelve la bandera `--set` de la CLI. No es una función
decorativa: en S029 sirvió para recuperar una impresión que una comprobación mal escrita había
borrado.

De paso quedó a la vista que **esa ruta no tenía ni una prueba** —no podía tenerla, el doble no sabía
responderla—. Se han añadido dos: que `--set` pide los sets nombrados y **no** toca la cola de
pendientes, y el contraste de que sin la bandera sí la toca.

### 2. Una dependencia entera ausente — 3 errores

`auth-routes.test.ts` montaba el servidor sin repositorio de mazos, con `as never` tapando el hueco.
Se le ha dado un doble que **estalla si alguien lo usa**:

```
Una prueba de autenticacion ha llamado a decks.listar().
Estas pruebas no deben tocar rutas de mazos.
```

Un `{}` habría bastado para compilar y habría sido peor: el día que una prueba de autenticación llegue
a una ruta de mazos, fallará diciendo qué pasa en vez de con un `undefined is not a function` a diez
marcos de distancia.

### 3. `undefined` no es lo mismo que ausente — 7 errores

Las pruebas de adaptador simulaban un campo que el origen no envía escribiendo `{ ...CARTA, campo:
undefined }`. Con `exactOptionalPropertyTypes: true` eso **no** es un objeto sin el campo, y la
diferencia es justo lo que la prueba quería ejercitar. Se ha añadido un ayudante de cinco líneas que
borra la clave de verdad:

```ts
function sin<T extends object, K extends keyof T>(obj: T, ...claves: K[]): Omit<T, K>
```

Es la única de las tres familias que era cosmética, y aun así estaba probando un caso que el tipo dice
que no puede darse.

### 4. Y el del E2E, que era real

`base.extend<Record<string, never>, { usuario: Usuario }>`. El primer parámetro son las fixtures de
ámbito **test** —aquí ninguna— y `Record<string, never>` dice "cualquier clave vale y su valor es
`never`", lo que envenena la firma: el `use` de la fixture de worker acababa recibiendo `never`.
Corregido a `object`. Playwright nunca se quejó porque nunca lo miró.

---

## Cómo queda, y por qué así

Dos ficheros nuevos, `apps/api/tsconfig.test.json` y `packages/shared/tsconfig.test.json`, más
`e2e/tsconfig.json`. Los tres con `noEmit`: **sólo comprueban**, lo que se compila sigue saliendo de
`tsconfig.json`.

```json
"typecheck": "npm run typecheck:tests",
"typecheck:tests": "tsc --build && tsc -p packages/shared/tsconfig.test.json && tsc -p apps/api/tsconfig.test.json && tsc -p e2e/tsconfig.json",
"test": "npm run typecheck:tests && vitest run",
```

**Va en `npm test`, no sólo en `npm run typecheck`.** Una comprobación que hay que acordarse de lanzar
no comprueba nada; ésta existe precisamente porque algo llevaba meses sin comprobarse. Cuesta **5,6 s**
en total y `npm run test:watch` sigue intacto para el bucle rápido.

**`typecheck:tests` empieza por `tsc --build`**, y eso no es redundancia. `tsc -p` —a diferencia de
`tsc --build`— **no construye las referencias**, así que en un árbol recién clonado fallaba con
`Cannot find module '@tcg/shared'`, que no dice nada de lo que pasa. Comprobado: tras `npm run clean`,
`npm test` funciona (7,3 s en frío, 5,0 s en caliente).

**El E2E se comprueba desde la raíz, no dentro de su contenedor.** La imagen de Playwright no lleva
`tsc` y no debe llevarlo —es la misma razón por la que la suite no es un workspace (ADR-009)—. El
`tsconfig.json` no se copia a la imagen; el `CMD` sigue siendo `npx playwright test`.

---

## La comprobación no es vacua, y está demostrado

Quitando a mano `loadPoolByCode` del doble de `pack-service.test.ts` —el fallo original de S030:

```
$ npm run typecheck
apps/api/src/packs/pack-service.test.ts(63,7): error TS2420:
  Class 'FakeRepo' incorrectly implements interface 'PackRepository'.
  ... y 17 errores mas

$ npx vitest run apps/api/src/packs/pack-service.test.ts
  Tests  22 passed (22)
```

**Dieciocho errores contra veintidós pruebas en verde.** Ése era exactamente el hueco, y ahora se ve
por los dos lados.

---

## Verificación

| Qué | Resultado |
|---|---|
| `npm run build` | limpio |
| `npm test` (con el type-check dentro) | **411/411** en 32 ficheros |
| `npm run typecheck` en árbol limpio | limpio, 7,3 s |
| Suite E2E | **10 passed** |
| `npm audit --omit=dev` | 0 vulnerabilidades |

Las dos pruebas nuevas son de `--set`; las otras 409 ya estaban.

---

## Lo que deja escrito

Un `implements` en un fichero que nadie comprueba es **decoración**, y da la falsa tranquilidad de
parecer una garantía. El proyecto lleva varias sesiones persiguiendo la misma forma de fallo —una
comprobación que existe pero no comprueba: el rollback nunca ejecutado de P-035, el rate limit que no
cubría el catálogo (P-038), el test de iconos que ganaba la carrera por casualidad, el de épocas cuyo
modelo se había quedado corto— y ésta es la misma familia, un nivel más abajo: **la comprobación de la
comprobación**.


---

## Y un barrido del Vault, al preguntar "entonces ya está todo"

Comprobado documento a documento en vez de contestar de memoria. Salieron **siete** afirmaciones
falsas, ninguna en el código:

| Dónde | Qué decía | Qué es verdad |
|---|---|---|
| `05_Continuar_Aqui.md` | P-008 abierto, "sólo quedan dos" problemas, "39 problemas, 37 cerrados" | P-008 cerrado en S030; queda uno; son 40 y 39 |
| `Tareas_Pendientes.md` | "Hito H8 🟡 EN CURSO" | Cerrado en S028, tres sesiones antes |
| `00_Contexto_Global.md` | "Quedan 3 limitaciones acotadas en P-008" | Cero |
| `Registro_Problemas.md` (P-003) | "quedan 3 limitaciones estructurales" | Cerradas |
| `README.md` | "341 tests + 6 recorridos E2E" | 411 y 10 |
| `04_Diccionario_Datos.md` | `idx_prints_pool (set_id, rarity_id, in_boosters, id)`, y sin `withdrawn_at` | La 0024 rehízo el índice con `withdrawn_at` dentro, y la columna no estaba documentada |
| `02_Flujo_Datos.md` | "rng = mulberry32", "pool precargado en **Redis**" | `xoshiro128**`, y el pool se lee de MySQL. Redis sólo guarda la cuota de las APIs (T-017) |

Las dos últimas son las que más incomodan. El índice llevaba **mal desde S028**, y se detectó
comparándolo con `information_schema` en vez de creerse el documento. Y las del diagrama de flujo son
peores que estar desactualizadas: **son afirmaciones de diseño que el código nunca cumplió**. `prng.ts`
explica desde H4 por qué se eligió xoshiro128** *frente a* mulberry32, y el documento seguía nombrando
al perdedor.

Las bitácoras de sesión **no se tocan**: son registro histórico y eran ciertas cuando se escribieron.
La distinción importa — corregir una bitácora sería falsificarla.

---

## Estado

- Tareas abiertas: **0**. Bloqueadas: **0**. Problemas: **1 abierto** (P-016 🟠, riesgo operativo
  permanente, no trabajo) · 39 cerrados.
- Migraciones publicadas: hasta la **0026**. Esta sesión no toca la base.
