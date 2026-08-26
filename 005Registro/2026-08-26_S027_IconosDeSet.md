# S027 — Los iconos de set, cosechados y expuestos (T-035)
**Fecha:** 2026-08-26 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Dale."* — séptima de las ocho tareas de deuda técnica de H8c.

**T-035 cerrada.** Con ella se cierra también la mitad que quedaba abierta de **P-022**: en S016 se
dejó de exponer `sets.icon_url` para no filtrar 1.032 URLs al navegador, pero eso resolvía la fuga
dejando el producto sin iconos. Ahora hay iconos propios y la API los sirve.

## Lo primero fue no escribir un segundo cosechador

Un icono de set es *"una imagen para un (juego, set, id)"*, que es literalmente lo que
`ImageHarvester` ya sabía traer. Duplicarlo habría duplicado también sus **tres salvaguardas** contra
pedir dos veces la misma imagen al origen — el motivo por el que ese fichero existe.

Se reutiliza entero. `CatalogRepository.iconos` expone los sets con la forma que el job ya pedía:

```ts
get iconos(): ImageRepository {
  return {
    findPending: (limit) => this.findPendingIcons(limit),
    markStored: (rowId, localPath) => this.markIconStored(rowId, localPath),
    markImageFailed: (rowId) => this.markIconFailed(rowId),
  };
}
```

Antes de eso hubo un renombrado: `PendingImage.printId` pasó a **`rowId`**. El campo iba a significar
dos cosas —`card_prints.id` para cartas, `sets.id` para iconos— y **un nombre que miente es justo lo
que muerde después**. 24 usos, `tsc --build` limpio.

## La medición que cambió el diseño

Con el código listo, contar antes de lanzar 2.129 descargas:

```
juego  filas con icono   URLs distintas
MTG        1.048             365
YGO          907             562
PTCG         174             174
           -----           -----
           2.129           1.101
```

**Casi la mitad de las peticiones habrían sido duplicados.** En Magic, `trk` y `ttrk` son sets
distintos que apuntan al mismo SVG; en Yu-Gi-Oh! hay 127 URLs repetidas. Nombrar el fichero por el
código del set —lo natural— habría pedido al origen la misma imagen dos veces, que es exactamente lo
que este job existe para no hacer (P-001).

El nombre sale ahora de la URL, no del set:

```
https://svgs.scryfall.io/sets/trk.svg?1787544000   -> mtg/iconos/sets-trk.64.webp
https://images.ygoprodeck.com/images/sets/SDZW.jpg -> ygo/iconos/sets-sdzw.64.webp
https://images.pokemontcg.io/base1/symbol.png      -> ptcg/iconos/base1-symbol.64.webp
```

Se toman los **dos** últimos segmentos, no el último: en Pokémon toda ruta acaba en `symbol.png` y
quedarse con el final juntaría los 174 iconos en uno solo. Con eso, el segundo set que comparte icono
encuentra el fichero en disco y se marca sin una sola petición: es la salvaguarda 1 del cosechador
haciendo su trabajo, **sin código nuevo que la duplique**.

## La cosecha real

```json
{ "intentadas": 2123, "descargados": 1096, "omitidos": 1027, "fallidos": 0,
  "bytesOrigen": 12595134, "bytesGuardados": 2265650 }
```

**2.129 de 2.129 sets con icono, cero fallos.** 1.101 ficheros, **4,7 MB** en disco. Los 1.027
omitidos son la deduplicación: ~1.000 peticiones que no se hicieron. (125 sets de Yu-Gi-Oh! no tienen
icono en el origen; ahí no hay nada que traer.)

Ancho **64 px**, no 245: un icono se pinta junto al nombre de un set. A 245 pesaría ~15 veces más
para verse igual de pequeño.

## Dos cosas que sólo aparecieron al ejecutar

**Los iconos de Magic son SVG.** `icon_svg_uri`, no un JPG. Antes de lanzar 365 descargas contra
Scryfall convenía saber si sharp los convierte: sí, 844 B de SVG → 548 B de WebP a 64 px.

**Y un 404 que era mío.** Al probar ese SVG a mano recorté la query string y Scryfall devolvió
`404 text/html`; sharp se quejó de que el XML no tenía raíz `<svg>`. El mensaje apuntaba al
codificador y el fallo estaba en la URL que yo había escrito. Con la URL entera, 200 y `image/svg+xml`.

## Verificación

La migración `0008`, contra MySQL de verdad, ciclo **up → down → up** — el último a través del
migrador real, no aplicando el `.sql` a mano, para comprobar que también queda registrada.

El endpoint, contra la base con los 1.048 sets de Magic dentro:

```json
{"id":2068,"code":"trk","name":"Star Trek","cardCount":135,
 "iconPath":"mtg/iconos/sets-trk.64.webp","poolSize":0}

con iconPath: 1048 de 1048 · alguna url externa en la respuesta: false
GET /images/mtg/iconos/sets-trk.64.webp -> 200 image/webp 548 bytes
```

**El test nuevo comprueba las dos mitades de P-022 a la vez:** que `iconPath` sale y que `iconUrl` no.
Verificado **en rojo** quitando `iconPath` del esquema — sin eso, Fastify lo eliminaría en silencio,
que es exactamente como se perdió `cardId` durante tres hitos (P-024).

| Comprobación | Resultado |
|---|---|
| `npm test` | **346/346** en 26 ficheros |
| `tsc --build` · `vite build` · `npm audit` | limpios |
| Migración 0008 up → down → up | correcta |
| Cosecha real | 2.129/2.129 · 0 fallos |

## Lo que NO se ha hecho, y por qué

**Los iconos no se ven todavía en la interfaz.** El selector de sets es un `<select>` nativo y un
`<option>` no puede contener una imagen: enseñarlos exige cambiar el control, que es una decisión de
diseño y no un retoque. Se deja registrada como **T-066** en vez de colarla aquí.

## Estado
- **H8c a siete de ocho.** Sólo queda **T-034** (plantillas por época de Yu-Gi-Oh!, ⚪).
- Abiertas además: T-065 (P-032), T-066 (iconos en la interfaz) y T-005, que depende del usuario.
