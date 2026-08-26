# S021 — Interfaz del constructor de mazos (T-047, H7 2.ª pasada)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sigue con T-047."*

Spec en [`06_Spec_T047_Interfaz_Mazos.md`](../004Arquitectura/06_Spec_T047_Interfaz_Mazos.md), plan
de ocho tareas en [`07_Plan_T047_Interfaz_Mazos.md`](../004Arquitectura/07_Plan_T047_Interfaz_Mazos.md).

## Qué se ha construido

| Pieza | Dónde |
|---|---|
| Borrador del mazo, puro y sin React | `apps/web/src/lib/deck-draft.ts` (19 tests) |
| Enganche de React | `apps/web/src/lib/use-deck-editor.ts` |
| Lista y editor | `apps/web/src/pages/Mazos.tsx`, `MazoEditor.tsx` |
| Buscador, zonas y validación | `apps/web/src/components/Deck*.tsx` |
| Cliente de API | `apps/web/src/lib/api.ts`: seis métodos de mazos + `card(printId)` |

**T-052 primero**, porque sin él nada de lo demás tenía sentido: el esquema `DECK_CARD` escrito en
T-046 no declaraba `oracleKey` ni `gameData`, así que **D1 del spec de H7 —"el frontend revalida sin
ir al servidor"— era imposible de cumplir**. El repositorio ya los producía; sólo faltaba
declararlos. El test escrito antes falló con `expected undefined to be 'carta-10'`, y ese `undefined`
era exactamente el bug.

## La decisión que se paga sola

Toda la lógica del mazo vive en un módulo **sin React**. No es purismo: los tests de este frontend
son de lógica pura y **no hay entorno DOM configurado en Vitest**, así que lo que viva dentro de un
componente es lógica sin probar. `deck-draft.ts` tiene 19 tests; los componentes, ninguno, y no hace
falta que lo tengan.

El `oracleKey` del cliente sale de `String(cardId)` — sólo posible desde que se corrigió **P-024** en
S020. Sin aquel arreglo, esta pasada no se podía hacer.

## Verificación en navegador real

El panel del navegador no compone imágenes en este entorno, así que **no se verificó por vista**: se
verificó por DOM y por panel de red, que es donde están las afirmaciones comprobables. La apariencia
queda pendiente de una revisión visual.

| Comprobación | Resultado |
|---|---|
| Crear mazo desde `/mazos` | Aparece con `main 0` |
| Mazo recién creado | `Faltan cartas en el mazo principal: hay 0 y el minimo son 40` |
| Añadir un `Xyz Effect Monster` | **Cae solo en el Extra Deck**, sin elegir zona |
| Llenar hasta 40 cartas distintas | **"Mazo valido"**, 0 problemas |
| Guardar, recargar | Vuelve igual: `Mazo valido`, 40 en main, 35 líneas |
| Borrar desde la lista | Pregunta `Borrar "Mazo de prueba"? No se puede deshacer.` y desaparece |
| URLs externas en el HTML renderizado | **`null`** (P-001) |

**Lo que más vale de todo el recorrido** salió sin buscarlo. Al añadir cartas de dos búsquedas
distintas, el panel mostró:

```
"Ash Blossom & Joyous Spring" aparece 6 veces y el maximo son 3
"Astrograph Sorcerer" esta limitada a 1 y hay 2
```

La primera línea es RN-04 agrupando **impresiones distintas de la misma carta** por `cardId`, en el
navegador. La segunda es la **banlist del TCG aplicada en el cliente**, leída de `gameData`. Las dos
juntas prueban la cadena entera: T-052 → `deck-draft` → `validateDeck` → pantalla.

### La comprobación que decidía si la arquitectura valía la pena

Con el panel de red abierto:

- Tres cambios de cantidad con `+` y `-`: **cero peticiones**. ✅
- Volver a añadir una carta ya añadida: **una petición más**. ❌

## P-026 — La caché prometida no existía

El spec decía (E6) que React Query cachearía el detalle de la carta y que sólo se pagaría la primera
vez. El código llamaba a `api.card()` **directamente**, así que React Query nunca lo veía: no había
caché que valiera. La promesa estaba escrita y no implementada, y sólo el panel de red lo dijo.

**Solución:** `queryClient.fetchQuery` con `queryKey: ['card', printId]` y `staleTime: Infinity` —
una carta ya cosechada es inmutable. **Reverificado:** dos añadidos de la misma carta, **una sola**
petición.

## P-025 — La imagen web de Docker llevaba rota desde T-004

Al abrir la aplicación en el contenedor: pantalla en blanco y un 500.

```
[TSCONFIG_ERROR] Failed to load tsconfig '../api': Tsconfig not found
  File: /app/packages/shared/dist/index.js
```

**Causa.** La etapa `deps` del Dockerfile copia `apps/api/package.json`, así que `/app/apps/api`
existe en la imagen web **pero sin su `tsconfig.json`**. El `tsconfig.json` raíz —que sí viajaba—
referencia ese proyecto, y Vite lo sigue al transformar `@tcg/shared`.

**Por qué llevaba dos sesiones oculta.** Hasta hoy el frontend sólo importaba **tipos** de
`@tcg/shared`. Los tipos se borran al compilar, así que el módulo **nunca se cargaba en tiempo de
ejecución** y Vite nunca lo transformaba. La primera importación de un **valor** —`validateDeck`—
lo destapó.

**Solución.** El `tsconfig.json` raíz deja de viajar a la imagen web; sólo va `tsconfig.base.json`,
que es de la que hereda el paquete.

**Lección.** Un artefacto puede estar roto y parecer sano durante sesiones si nada ejercita el camino
que lo rompe. En S019 se cargó el catálogo desde el contenedor y funcionó — la verificación era
correcta y aun así no tocaba este camino.

## Un defecto de redacción, y un desliz de bookkeeping

- La barra decía **"1 cosas por resolver"**. Corregido para concordar en número.
- El arreglo de P-025 se coló en el commit de P-026 sin aparecer en el mensaje. Se reescribió **el
  mensaje** (mismo contenido, punta sin publicar) para que `git log` describa lo que el commit
  contiene. Un mensaje que miente es una avería del historial.

## Verificación final

| Comprobación | Resultado |
|---|---|
| `npm test` | **290/290** |
| `tsc --build` | limpio |
| `vite build` (el de verdad, no sólo el typecheck) | 494 módulos, 369 kB |
| `npm audit` | 0 vulnerabilidades |

`tsc` en el frontend usa `emitDeclarationOnly`: **comprueba tipos pero no empaqueta**. Se ejecutó el
build de Vite aparte a propósito, porque un fallo de resolución de imports no lo detecta el otro.

## Estado
- **H7 al 90 %.** Sólo falta **T-048**, el import/export, para cerrar la última épica de producto.
- Pendiente de revisión visual: el entorno no permitió ver la interfaz renderizada.
