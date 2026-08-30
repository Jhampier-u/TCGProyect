# S034 — H9a completo: tokens, cadenas y la raíz que deja de ser un catálogo

**Fecha:** 2026-08-28 · **Tareas:** T-088, T-089, T-090 · **Sin migración**

---

## T-088 — El sistema de diseño

La aplicación era oscura y **sigue siendo oscura primero**, que es una decisión: la ilustración de la
carta es el contenido y se lee mejor sobre fondo oscuro. El claro se añade porque un catálogo también
se consulta de día.

Los tres estados del visor, no dos: `:root` con la paleta oscura completa, el bloque de
`prefers-color-scheme` guardado con `:not([data-tema="oscuro"])` para que la elección explícita gane
al sistema, y `[data-tema="claro"]` ganando en el otro sentido. **Ningún color se define sólo dentro
de un media query** — así es como una página acaba pintando el texto de un tema sobre el fondo del
otro.

**Cero literales de color fuera de `tokens.css`.** Los tres degradados de dorso resultaron ser
identidad de juego ya escrita a mano dentro de `.reverso-mtg/ygo/ptcg` desde H5: sólo salieron a la
superficie.

### El contraste se midió, no se afirmó

Peor caso **4,77:1 en oscuro y 4,80:1 en claro**, contra un mínimo de 4,5. El oro `#e0b450` no
sobrevive sobre blanco, así que en claro baja a `#8a6217` conservando el tono.

**Los once tonos de tipo van por tema, y eso lo decidió la medición.** La primera versión tenía un
tono canónico por tipo —el tono *es* el tipo— y tres fallaban sobre fondo oscuro: psíquico 2,63:1,
lucha 2,60:1, oscuro 1,71:1. Un tipo que **es** oscuro no puede leerse sobre fondo oscuro. Por tema,
el peor caso queda en 4,96:1.

### Dos errores míos que merecen quedar escritos

**El script de contraste se quedó viejo en diez minutos.** Tenía los colores copiados dentro; al
afinar los tonos seguía reportando los fallos de la versión anterior. Se convirtió en un test que
**lee `tokens.css`**: no puede desincronizarse.

**Y ese test encontró algo que el ojo no**: los bordes están a **1,25:1** contra el fondo, casi
invisibles. Pero el umbral de 1,4 que le había puesto era inventado, y la tentación fue bajarlo hasta
que pasara — que es ajustar la prueba al resultado. Lo correcto era separar el borde que **sí** tiene
norma (WCAG 1.4.11 pide 3:1 para el límite de un control) del separador decorativo que no la tiene.

---

## T-089 — Las cadenas, y la regla de ASCII por fin comprobada

La interfaz decía *«Catalogo»*, *«Mi coleccion»*, *«Contrasena»*. Los acentos se perdieron porque la
regla de ASCII —pensada para el código— se había colado en el texto que lee una persona.

### Escribir el test obligó a releer la regla

El plan decía "cualquier no-ASCII fuera de `i18n/`". Escrito así **marcó 19 ficheros**, y al mirarlos
uno a uno **exactamente uno era una infracción de verdad**:

```
let señuelo   <- un identificador con eñe, en password.ts
```

Los otros dieciocho eran datos de prueba que **son** lo que se prueba —`normalizeRarityCode` recibe un
apóstrofo tipográfico porque normalizarlo es su trabajo—, puntuación en texto de salida, y cadenas que
deben coincidir literalmente con un documento del Vault.

**Doblegar ese código habría empeorado el proyecto para servir a una lectura que la regla no pide.**
La regla dice qué protege: *«un combinante suelto se pega al carácter anterior y una herramienta puede
destruirlo sin que se note»*. El peligro son los caracteres **invisibles o frágiles**.

Así que el test comprueba tres cosas: **control** en cualquier sitio (el 0x08 de S032), **combinantes
sueltos** —lo que nombra literalmente— y no-ASCII **en el código propiamente dicho**, fuera de cadenas
y comentarios. El texto suelto de JSX cuenta como código, y eso **se quiere**: es lo que empujó seis
ficheros hacia `i18n`.

### Un límite del lexer, asumido

Las expresiones regulares también caen como código: distinguir `/` de división de `/` de regex
necesita un analizador de verdad. Ha saltado dos veces, y **las dos el arreglo mejoró el código** —un
escape Unicode en el comprobador del Vault, un `{ exact: false }` en vez de una regex en el E2E—, así
que el falso positivo se deja a propósito.

---

## T-090 — La raíz deja de ser un catálogo

Es el cambio que hace posible el resto de H9: mientras la raíz fuera un catálogo común con un
desplegable de juego, **ninguna sección podía tener personalidad porque no había sección**.

Ahora `/` es una elección de juego, y lo de cada juego cuelga de su ruta con su `data-juego`. El
atributo es todo lo que hace falta: `tokens.css` cuelga de él el acento y los dorsos, y el resto de la
interfaz no se entera de en qué juego está. Eso es lo que hace que las primitivas se compartan.

### La portada, con las épocas reales

Nuevo `/api/games/:game/eras`, que las lee de `pack_templates` — donde ya estaban. **Las ventanas no se
copian al frontend**: lo único que vive en el navegador es "esta fecha cae en esta ventana", con su
prueba, incluida una que verifica que **agrupar no pierde ningún set**.

Los 174 sets de Pokémon repartidos en sus 10 épocas, de *Scarlet & Violet* a *Clásico (hasta la era
EX)*.

### Dos fallos que sólo se vieron en pantalla

**El orden estaba mal.** `NULL` en `valid_from` significa dos cosas opuestas según la fila: en la época
clásica es *"desde siempre"* —la más antigua— y en la por defecto es *"sin ventana"* —la vigente—.
Ordenando por la columna cruda las dos caían juntas y la portada pintaba el Base Set justo detrás de
Scarlet & Violet.

**Y «clasico» salía sin acento y en minúscula**, porque los nombres de plantilla viven en migraciones,
que son ASCII puro. Se presenta desde `i18n` en vez de renombrarse en la base: el nombre de la
plantilla es un dato del motor y hay pruebas que lo usan para identificarla.

### Un anillo de foco para todo

Al revisar el teclado descubrí que sólo tres componentes tenían foco propio y el resto se quedaba con
el del navegador —1px, distinto en cada uno, sin responder al tema—. Una regla global lo arregla para
todo lo que venga en H9b, y **hereda `--juego-acento`**: dentro de Pokémon, el foco es rojo Pokémon.

Merece decirse que **casi me lo invento**: medí el foco con `element.focus()` desde JavaScript, que no
dispara `:focus-visible`, y leí `outline: none`. Estuve a punto de reportar una regresión de
accesibilidad que no existía. Con tabulador de verdad el anillo estaba ahí. La lección es la de
siempre en este proyecto: **el instrumento también se mide**.

---

## Verificación

| Qué | Resultado |
|---|---|
| `npm test` | **469/469** en 36 ficheros (+42 sobre S033) |
| Suite E2E | **11 passed** — uno más: la ruta vieja del catálogo sigue llevando a alguna parte |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| Contraste | medido y vigilado por test que lee `tokens.css` |
| Comprobado en el navegador | los dos temas, y el foco de teclado con tabulador real |

Las tres comprobaciones del Vault **me pararon a mí** antes de dejarme cerrar: el recuento de
recorridos E2E seguía diciendo 10, y el test de ASCII cazó el `é` de una expresión regular que yo
mismo acababa de escribir.

---

## Estado

- **H9a completo.** Abiertas: **5**, todas de H9b.
- Problemas: **1 abierto** (P-016) · 39 cerrados.
- Migraciones: hasta la **0026**. H9b traerá la 0027.
- **Siguiente:** T-091, la migración de columnas generadas e índices para los filtros.
