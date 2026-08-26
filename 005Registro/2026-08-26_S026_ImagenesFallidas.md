# S026 — T-019: dejar de reintentar imágenes rotas para siempre
**Fecha:** 2026-08-26 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sigue."*

Sexta de las ocho de H8c. Quedan dos: T-035 y T-034.

## El problema

El job de imágenes busca las impresiones con `image_local_path IS NULL`. Una URL permanentemente
rota **nunca deja de cumplir esa condición**, así que se reintentaba en cada ejecución. Dos costes, y
el segundo es el peor:

1. Peticiones inútiles al origen, que en YGOPRODeck cuentan para el límite de tasa y en Pokémon para
   la cuota diaria.
2. El informe llevaba siempre las mismas fallidas, así que nadie distinguía "falló algo nuevo" de
   "siguen las de siempre". **Un aviso que sale siempre deja de leerse.**

## Un contador, no una marca de "rota"

Distinguir un fallo permanente de uno transitorio exigiría clasificar el error, y esa clasificación
es frágil: un 503 del origen, un DNS caído o un *timeout* se parecen mucho a un fallo definitivo
desde aquí. En vez de acertar con la causa **se cuentan los intentos**: lo transitorio se reintenta y
acaba pasando, lo permanente se agota y deja de molestar.

Tres intentos. No uno, porque un origen caído no debe condenar una imagen para siempre; no diez,
porque entonces una URL rota sigue costando peticiones durante diez ejecuciones.

Y `--retry-failed`, porque el contador no distingue causas: si el origen estuvo caído una tarde,
imágenes perfectamente buenas pueden haber agotado sus intentos, y sin esto no habría forma de
recuperarlas salvo SQL a mano.

## La migración 0007 no lleva `USE`

Todas las anteriores lo llevan. La `0001` fija con él el nombre de la base —eso es **P-032**— y no se
puede corregir allí porque las migraciones publicadas son inmutables. Lo que sí se puede es **dejar
de repetirlo**: al ejecutarse en la misma conexión que las anteriores, la 0007 aplica sobre la base
que ya estaba seleccionada.

## Verificación contra MySQL real

Ciclo `up → down → up`: las dos columnas desaparecen y vuelven, y el contador se pierde en el
`down` **exactamente como el fichero avisa**.

Y el comportamiento:

```
impresion 1 · en cola al empezar: 1
  tras el intento 1 -> en cola: 1     <- lo transitorio se reintenta
  tras el intento 2 -> en cola: 1
  tras el intento 3 -> en cola: 0     <- se agota y deja de pedirse
contador=3 · fecha=anotada
--retry-failed reactiva: 1 filas
en cola de nuevo: 1
```

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm test` | **341/341** en 26 ficheros |
| `tsc --build` · `npm audit` | limpios |
| Migración 0007 | aplicada, con ciclo up/down/up verificado |

## Estado
- **H8c a seis de ocho.** Quedan **T-035** (cosechar los iconos de set) y **T-034** (plantillas por
  época para Yu-Gi-Oh! pre-2020, la mayor de todas).
