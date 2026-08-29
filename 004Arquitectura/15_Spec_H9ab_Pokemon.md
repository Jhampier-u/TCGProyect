# Spec — H9a y H9b: cimientos de interfaz y la sección de Pokémon

> **Hito:** H9 — Identidad propia por juego · **Sub-proyectos:** H9a (cimientos) y H9b (catálogo y ficha)
> **Sesión:** S033 · **Fecha:** 2026-08-28 · **Estado:** aprobado · **Plan:** `16_Plan_H9ab_Pokemon.md`
> **Tareas:** T-088 a T-095

---

## 1. Qué se está construyendo, y qué no

H9 da a cada juego una sección propia con personalidad, catálogo, categorización, mazos y **dos
colecciones**. Es demasiado para una pasada, así que se hace **un juego entero primero** —Pokémon— y
ese juego sirve de plantilla probada para los otros dos.

**Este spec cubre H9a y H9b y nada más.** Las dos colecciones (H9c), los mazos por juego (H9d) y el
pulido (H9e) tendrán su propio spec cuando éstos estén cerrados. Se dice aquí para que nadie lea este
documento buscando el modelo de la colección real: no está, y es a propósito.

### Fuera de alcance, explícitamente

- Magic y Yu-Gi-Oh!. Su sección se construye **después**, reutilizando lo que H9a deje montado.
- La colección real y su importación masiva.
- Cualquier cambio en el motor de sobres, en las plantillas o en la ingesta.
- Precios, valoración de cartera y cualquier dato que hoy no ingestamos.

---

## 2. Lo que se midió antes de decidir

Todo lo que sigue está medido contra la base real el 2026-08-28, no supuesto.

### Las "marcas de regulación" son tres cosas distintas

| Juego | Señal | Cobertura | Qué es |
|---|---|---|---|
| Magic | `legalities` | **38.606 / 38.606 — 100 %** | 20+ formatos por carta. Filtro construible hoy |
| **Pokémon** | `regulation_mark` | **8.184 / 20.434 — 40 %** | Marcas **D a J**, desde 2019-11-15. No falta el dato: antes no existía |
| Yu-Gi-Oh! | `banlist_info` | **324 / 14.104 — 2,3 %** | `{ban_tcg, ban_ocg, ban_goat}` — una lista viva, no un atributo |

**Consecuencia para H9b:** en Pokémon la marca de regulación **es** un filtro legítimo, pero su
interfaz tiene que explicar su propia ausencia. Una carta de 2016 no tiene marca y eso no es un vacío
de datos: es que el concepto no existía. El filtro dirá *"sólo cartas con marca de regulación (desde
2019)"*, nunca *"sin marca"* como si fuera un defecto.

**Y una decisión que este spec deja anotada para más adelante:** la lista de prohibidas de Yu-Gi-Oh!
no se modelará como filtro de catálogo. Es un estado competitivo que cambia varias veces al año y
difiere entre TCG y OCG; su sitio es la ficha de carta, alimentado por una ingesta periódica.

### Las épocas que ya existen sirven para Pokémon, y sólo para Pokémon

Las ventanas de `pack_templates` se diseñaron para responder *qué trae un sobre*. En Pokémon coinciden
con los bloques reales —*Diamond & Pearl / Platinum*, *Black & White / XY*, *Sun & Moon*, *Sword &
Shield*, *Scarlet & Violet*— y son exactamente cómo un jugador piensa el catálogo, así que **se
reutilizan tal cual** como eje de navegación.

En Magic no sirven: sus cuatro épocas son *clásico / con foil sin mítica / Draft Booster / Play
Booster*, que describe el producto y no le dice nada a nadie. Magic necesitará otro eje —la legalidad
por formato, que está completa— y eso se resuelve en su propio spec.

### Cuánto queda fuera del alcance de los sobres

| Juego | Impresiones | En sobre | **Fuera** |
|---|---|---|---|
| Magic | 117.152 | 53.240 | **54,6 %** |
| Yu-Gi-Oh! | 44.365 | 38.155 | 14,0 % |
| **Pokémon** | 20.434 | 18.752 | **8,2 %** |

Es el número que justifica los dos denominadores de H9c. En Pokémon la diferencia es modesta, lo que
lo hace **buen terreno de pruebas**: el diseño se valida sin que la brecha entre las dos colecciones
domine la pantalla.

### Qué filtros son gratis y cuáles cuestan una migración

**Ya indexado:** texto (`ftx_cards_search` sobre nombre y reglas), nombre (`idx_cards_game_name`, que
sostiene la paginación keyset), **PS** (`idx_cards_game_hp`), set y rareza (`idx_prints_pool`), sets
por fecha.

**Sin índice, en `game_data`:** `types`, `subtypes`, `regulation_mark`. Son justamente las tres
facetas por las que alguien navega Pokémon.

**El patrón ya está establecido y se sigue, no se inventa:** `cmc`, `atk`, `def`, `lvl` y `hp` son
columnas generadas desde ese mismo JSON, indexadas. T-091 añade las que faltan por la misma vía.

### Qué se rompe de la suite E2E

De los 10 recorridos, **8 se rompen**: se agarran a clases CSS (`.selector-set-lista`, `.volteador`,
`.sobre`, `.zona`). **Dos sobreviven intactos** porque no prueban interfaz sino invariante — *"el HTML
no contiene ninguna URL externa (P-001)"* y *"carga y navega sin errores de consola"*.

**Cuatro guardan garantías que se portan, no se borran:** teclado completo en el selector (T-066),
movimiento reducido (T-040), iconos locales, y no desbordar la columna (P-030). T-095 las reescribe
contra la interfaz nueva. **Borrar una garantía porque su prueba estorba sería exactamente el fallo
que este proyecto lleva cinco sesiones persiguiendo.**

### El rediseño es viable

`apps/web/src` son **2.975 líneas**, 6 páginas, 7 componentes y **un único `styles.css`**. No hay
sistema de diseño que desmontar ni deuda visual acumulada.

---

## 3. Decisiones tomadas

| # | Decisión | Quién |
|---|---|---|
| D-1 | **Tokens y primitivas compartidas**, layouts propios donde el dominio manda | Usuario, sobre recomendación medida |
| D-2 | **Un juego entero primero**, y ése es **Pokémon** | Usuario |
| D-3 | **Dirección A (Carpeta) para la colección, dirección B (Consulta) para el catálogo** | Usuario, sobre las tres maquetas |
| D-4 | La colección real guarda **cantidad, acabado, estado e idioma** | Usuario — se ejecuta en H9c |
| D-5 | El raíl de estructura de la dirección C **se rescata dentro de B** | Este spec |
| D-6 | Los textos salen del código a un módulo de cadenas | Este spec |

### D-3, en detalle: dos layouts, un sistema

No son dos diseños: son **dos usos del mismo sistema de tokens**.

- **Carpeta** (colección, H9c): bolsillos de tres en tres, el cromo dentro de la funda, y **el hueco
  vacío con forma de carta**. La ausencia es información. Se especifica en H9c; aquí sólo se reserva
  que los tokens la soporten.
- **Consulta** (catálogo, H9b): filas densas, cifras alineadas, PS como barra comparable, el tipo como
  chip de color, y **los filtros como ciudadanos de primera**, no un desplegable arrinconado.

El acento es **el mismo** en las dos —el rojo de la carpeta y el marco del aparato— y los colores de
tipo son los mismos chips. Eso es lo que hace que D-1 se sostenga.

### D-5: el raíl

La dirección C se descartó, pero su idea central se queda: **la estructura del set siempre a la
vista** mientras lo recorres — cuántas de cada tipo, cuántas de cada rareza, cuánto llevas. Va en el
lateral del catálogo y **es también el sistema de filtros**: pulsar una fila del raíl filtra. Un
filtro que además informa es un filtro que no hay que explicar, que es el requisito de usabilidad.

### D-6: el módulo de cadenas

Hoy la interfaz dice *«Catalogo»*, *«Mi coleccion»*, *«Contrasena»*. Los acentos se perdieron porque
el proyecto exige **código fuente en ASCII puro**, y esa regla —buena, y la que destapó el byte 0x08
de S032— se coló en el texto que lee el usuario.

**La regla no se toca.** Los textos salen a `apps/web/src/i18n/es.ts`, un módulo de datos, no de
código. Es además el primer paso si algún día se quiere el catálogo en inglés.

---

## 4. H9a — Cimientos

### T-088 · Sistema de diseño y tokens

Un `tokens.css` con la escala completa —color, tipografía, espaciado, radios, sombras— definida como
propiedades personalizadas, y un bloque de sobrescritura **por juego** (`[data-juego="ptcg"]`).

**Requisitos:**
- **Los dos temas, completos.** Paleta clara en `:root`, oscura en
  `@media (prefers-color-scheme: dark)` guardada con `:root:not([data-theme="light"])`, y otra vez en
  `:root[data-theme="dark"]`. Ningún color definido *sólo* dentro de un media query.
- Escala tipográfica declarada y respetada; texto corrido cerca de 65 caracteres.
- Contraste AA como mínimo en ambos temas, comprobado, no supuesto.
- `prefers-reduced-motion` respetado en todo lo que se mueva.

### T-089 · Módulo de cadenas

Todo el texto visible sale de los `.tsx` a `apps/web/src/i18n/es.ts`. El código sigue en ASCII; el
módulo de cadenas lleva acentos con normalidad y es la única excepción, documentada en `Claude.md`.

### T-090 · Navegación por juego y portada de Pokémon

La raíz deja de ser un catálogo con filtro de juego y pasa a ser una elección de juego. Cada sección
vive bajo su propia ruta (`/ptcg/...`) y aplica su `data-juego`.

---

## 5. H9b — Catálogo de Pokémon y ficha de carta

### T-091 · Migración: columnas generadas e índices

Añade a `cards`, siguiendo el patrón de `cmc`/`atk`/`hp`:

| Columna | Origen | Para qué |
|---|---|---|
| `ptcg_supertype` | `$.supertype` | Separar Pokémon / Entrenador / Energía |
| `ptcg_type` | `$.types[0]` | El filtro principal: tipo elemental |
| `ptcg_reg_mark` | `$.regulation_mark` | Marca de regulación, con `NULL` legítimo |

Con sus índices `(game_id, columna)`. **`subtypes` no se materializa en esta pasada**: es un array y
un filtro por subtipo exige índice multivaluado; se difiere hasta ver si alguien lo pide.

La migración es **inmutable una vez publicada** y lleva su rollback. Y como toda migración de este
proyecto, su cabecera explica el porqué, no sólo el qué.

### T-092 · API: facetas, y el campo que desaparece sin avisar

Extiende `/api/cards` con los filtros nuevos y añade el endpoint de ficha.

> **Trampa declarada: ADR-007.** Fastify **descarta los campos no declarados** en el esquema de
> respuesta, y es la primera causa de "el dato está en la base y no llega al front".
>
> **Corregido al escribir el plan:** el peligro está en `CARD_SUMMARY`, no en `CARD_DETAIL`. El de
> detalle ya declara `gameData` con `additionalProperties: true`, así que la ficha ya recibe todo. El
> de resumen —el que usa la búsqueda— no lleva ni un dato de juego, así que la rejilla no puede
> enseñar PS, tipo ni marca hasta que se declaren ahí.

**Se mantiene la paginación keyset** con desempate por `card_prints.id`. No se convierte en `OFFSET`:
hay un motivo escrito y es que con `cards.id` desaparecían cartas del catálogo en silencio.

### T-093 · Catálogo «Consulta» con el raíl

Filas densas, el raíl de estructura a la izquierda filtrando al pulsar, chips de filtro activos
siempre visibles y **borrables de uno en uno**.

**Criterio de usabilidad, y es de aceptación:** una persona que no conoce el proyecto tiene que poder
responder *"enséñame las cartas de Planta de este set que me faltan"* sin instrucciones. Si hace falta
explicárselo, el diseño está mal y se rehace.

El estado de los filtros va **en la URL**, para que se pueda compartir y para que volver atrás
funcione.

### T-094 · Ficha de carta

Se abre al pulsar una carta. Muestra todo lo que la base sabe de ella, y ofrece **añadir a una
colección o a un mazo**.

En H9b los botones existen y **llevan a donde toca**, pero la colección real todavía no existe: se
implementan contra la colección de simulación y contra los mazos, y el segundo destino se conecta en
H9c. No se pinta un botón muerto.

### T-095 · Reescritura de la suite E2E

Los 8 recorridos rotos se rehacen contra la interfaz nueva; los 2 de invariante se **amplían** a las
rutas nuevas. Las cuatro garantías portadas —teclado, movimiento reducido, iconos locales, no
desbordar— vuelven a tener prueba.

**Los selectores dejan de ser clases CSS.** Se usan roles y nombres accesibles, que es lo que
sobrevive a un rediseño y además obliga a que la interfaz tenga semántica.

---

## 6. Criterios de aceptación

- `npm test` verde, incluida la comprobación de coherencia del Vault (T-087) y el type-check de los
  ficheros de prueba (T-086). **No se desactiva ninguno para ir más rápido.**
- Suite E2E verde, con los 10 recorridos reescritos o ampliados y **ninguna garantía perdida**.
- `npm audit --omit=dev` limpio.
- Contraste AA comprobado en los dos temas.
- El catálogo de Pokémon navegable entero con teclado.
- Ningún `img` ni `a` apuntando fuera del dominio propio: la prueba de P-001 pasa en las rutas nuevas.
- La migración de T-091 aplicada **y su rollback ejecutado a mano al menos una vez**, como se hizo con
  la 0025 y la 0026.

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| **La densidad de imágenes tumba el navegador.** 20.434 impresiones de Pokémon, 182.939 WebP en total | `loading="lazy"`, tamaños responsivos y ventana de filas. Medir con el set más grande, no con uno cómodo |
| **El límite de peticiones de `/images/`** (P-037: 300 por ventana) se agota en una vista densa | Medir cuántas imágenes pide una pantalla llena antes de dar por bueno el diseño |
| **Tres secciones acaban siendo tres proyectos.** Es el riesgo que D-1 intenta evitar | Al cerrar H9b, revisar qué se ha duplicado. Si Magic no puede reutilizar lo de Pokémon, D-1 falló y hay que decirlo |
| **El rediseño tapa una garantía sin que nadie lo note** | T-095 no es opcional ni se pospone al final: cada recorrido se reescribe con la pantalla que lo rompe |

---

## 8. Lo que este spec deja abierto

- El modelo de datos de las dos colecciones (H9c) y el denominador doble.
- El eje de navegación de Magic, que no puede ser el de sus épocas de sobre.
- La ingesta periódica de la lista de prohibidas de Yu-Gi-Oh!.
- Si `subtypes` merece índice multivaluado.
- Importación masiva de la colección real. **Corrección a la propuesta inicial:** los códecs de
  `packages/shared/src/deck-formats` son formatos de **mazo** y no encajan con una colección, que
  necesita cantidad, set y estado por línea. Lo reutilizable es la **resolución de nombre a
  impresión** del repositorio de mazos, que en T-085 aprendió a mandar las retiradas al final del
  desempate. Eso es el 80 % de lo difícil de un importador.
