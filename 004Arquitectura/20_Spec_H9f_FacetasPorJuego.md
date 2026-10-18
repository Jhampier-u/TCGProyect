# Spec — H9f: perfil de facetas por juego, y los catálogos de Magic y Yu-Gi-Oh!

> **Hito:** H9 — Identidad propia por juego · **Sub-proyecto:** H9f
> **Sesión:** S038 · **Fecha:** 2026-10-18 · **Estado:** aprobado por el usuario sección a sección,
> pendiente de su revisión escrita
> **Plan:** pendiente; será el documento 21 de esta carpeta

---

## 1. Qué se está construyendo, y por qué ahora

H9b dejó a Pokémon con su catálogo «Consulta»: raíl de estructura, fila densa, «me faltan» y ficha.
Al cerrarlo, la revisión de D-1 (bitácora de S037) contestó a la pregunta *«¿puede Magic reutilizar
esto?»* con un **sí al armazón y un no a su contenido**. El estado en la URL, la sesión opcional, el
diálogo de la ficha y el raíl *como mecanismo* sirven tal cual. Pero **qué facetas existen** y **qué
celdas tiene la fila** estaban escritas para Pokémon en tres sitios: la API, el raíl y la fila. Hacer
Magic así habría sido copiar tres ficheros, que es justo lo que D-1 quería evitar.

El usuario pidió el perfil **y además los dos catálogos que lo justifican, en el mismo spec**: un
perfil sin un segundo consumidor no demuestra nada. El nombre es **H9f** porque H9c (colecciones),
H9d (mazos por juego) y H9e (Holo Noir) ya tienen letra. El orden lo decide el usuario: H9f va antes
que H9c.

### Dentro

1. **El perfil de facetas por juego**, declarativo, y Pokémon migrado a él sin cambiar su
   comportamiento.
2. **El catálogo de Magic** y **el de Yu-Gi-Oh!**: raíl, fila, ficha y portada.
3. **Las rutas** `/mtg` y `/ygo`, y las tarjetas de inicio de los dos juegos activadas.

### Fuera, explícitamente

- **La legalidad por formato (Magic) y la lista de prohibidas (Yu-Gi-Oh!).** Son del constructor de
  mazos (H9d), no del catálogo.
- **Las caras traseras completas de Magic.** La ficha muestra la primera cara y avisa de que hay otra.
- **Recuentos por carta única.** Se cuenta por impresión, como hoy en Pokémon.
- **H9c, las dos colecciones.** Viene después, con su spec.

---

## 2. Lo que dicen los datos, y lo que obligan a decidir

Medido en la base de desarrollo el 2026-10-18:

| Juego | Cartas | Impresiones activas |
|---|---|---|
| Magic | 38.606 | 117.152 |
| Yu-Gi-Oh! | 14.104 | 44.365 |
| Pokémon | 20.434 | 20.433 |

**Magic**

- El tipo principal sale de `type_line`, mirando la primera cara (lo que va antes de ` // `):
  criatura 20.002 · instantáneo 3.872 · conjuro 3.645 · encantamiento 3.583 · artefacto 2.623 ·
  tierra 1.190 · planeswalker 332 · batalla 39 · otras 3.320.
- **2.274 cartas son reversos «Card // Card»** de Scryfall, y otras 401 son «Card» a secas. No traen
  tipos ni colores, y su coste es 0. Si no se apartan, inflan el tramo de coste 0 y el filtro de
  incoloras.
- Colores: la clave falta en las incoloras (7.769); el adaptador nunca guarda listas vacías. Mono
  25.922 · bicolor 4.053 · tres o más 862. Ya existe un índice multivaluado sobre `colors`.
- Coste (`cmc`, ya indexado): 0 a 7 cubren casi todo; hay 535 de 8 o más, y **una de 1.000.000**
  (una carta de broma).
- Fuerza y resistencia son siempre texto: `*`, `1+*`, `?`, `∞`.

**Yu-Gi-Oh!**

- `type_line` separa sin restos monstruos (9.098), mágicas (2.812), trampas (2.052), habilidades (123)
  y fichas (19).
- El marco sale también de `type_line`, con combinaciones: «Xyz Pendulum Effect Monster»,
  «Synchro Tuner Effect Monster»…
- Atributo, sólo en monstruos: OSCURIDAD 2.601 · TIERRA 2.013 · LUZ 1.924 · AGUA 895 · VIENTO 845 ·
  FUEGO 811 · DIVINIDAD 9.
- **El rango de los Xyz va en `level`**, y **110 monstruos Link tienen también `level`**, además de
  su `link_val`.
- **Las mágicas y trampas guardan su subtipo en `race`** (Normal, Rápida, Continua, Campo, Equipo,
  Ritual, Contraefecto). «Normal» lo comparten las dos clases.
- ATK vale -1 en 85 cartas: es el «?».

**Coste de contar.** Una faceta de Magic sin set, sobre las 117.000 impresiones, tarda entre 0,2 y
0,4 s, según use índice o una expresión `LIKE`. Cuatro en paralelo, sin índice, rondarían el segundo.

---

## 3. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| F-1 | **Perfil declarativo** en `@tcg/shared`: datos, ni SQL ni JSX | Una sola lista que la API y la web recorren; un juego nuevo es una entrada, no tres ficheros |
| F-2 | La API asocia cada clave con su SQL, y la web con su etiqueta y su forma de pintarse. **Un test por lado exige cobertura exacta** en los dos sentidos | Una faceta que falta en un lado rompe `npm test`, no la pantalla |
| F-3 | Una **vía de escape**: una faceta puede declarar que su filtro es un fragmento propio | El marco de Yu-Gi-Oh! y el «Normal» de mágicas y trampas no caben en los tres modos simples |
| F-4 | Columnas generadas e indexadas para cada faceta nueva, en una migración nueva (la 0029) | El patrón de la 0027: medido con `EXPLAIN`, sin `filesort` |
| F-5 | **Los reversos «Card // Card» son tipo «otra»** y no cuentan como incoloros | Si no, falsean dos facetas a la vez |
| F-6 | Los Link tienen su propia faceta y **no** entran en la de nivel | Los 110 con `level` aparecerían como monstruos de nivel |
| F-7 | La forma de la respuesta cambia para todos: `facetas: {…}` en la fila y en los recuentos | La forma plana (`hp`, `supertype`…) es la de Pokémon; mantenerla obligaría a un `if (juego)` |
| F-8 | Una portada genérica **por año de salida** para Magic y Yu-Gi-Oh!. La de Pokémon no se toca | En Magic las épocas describen el producto, no el set |
| F-9 | Símbolos de maná y colores de atributo **propios**, en CSS y con tokens | Nada de imágenes de terceros: P-001 sigue intacto |

---

## 4. El perfil (F-1 a F-3)

Cada juego declara **sus facetas** y **las celdas de su fila**. Una faceta tiene:

- **clave**: la que viaja en la URL y en la API (`color`, `kind`, `attribute`…);
- **modo de filtro**, uno de:
  - **valor**: igualdad sobre una columna;
  - **contiene**: pertenencia a una lista JSON, por el índice multivaluado (colores de Magic);
  - **tramo**: valores numéricos agrupados en tramos, con un tramo final abierto («7+»);
  - **propio**: la vía de escape;
- **valores conocidos, en orden**: el orden del raíl sale de aquí, no del recuento;
- si admite **«sin valor»**, como el «Sin marca» de Pokémon.

Las celdas de la fila son una lista de claves de celda. La web sabe pintar cada una; el perfil sólo
dice cuáles y en qué orden.

**Los perfiles**

| Juego | Facetas del raíl, en orden | Celdas de la fila |
|---|---|---|
| Pokémon | categoría · tipo · marca de regulación (con «sin marca») | número · carta · tipo · PS · rareza · marca · tienes |
| Magic | color (W, U, B, R, G, incolora, multicolor) · tipo · coste (0–7+) | coste en maná · carta · tipo · F/R · rareza · tienes |
| Yu-Gi-Oh! | clase (monstruo, mágica, trampa, habilidad, ficha) · marco · atributo · nivel o rango · link | atributo · nivel/rango/link · carta · tipo · ATK/DEF · rareza · tienes |

La tenencia («me faltan» / «las tengo») y la rareza son de todos y no van en el perfil. Siguen como
hoy.

**El subtipo de mágicas y trampas** (Normal, Rápida, Continua…) se muestra en la fila y en la ficha,
pero no es faceta en esta pasada. Si se añade, irá con su clase, por F-3.

---

## 5. Datos y API

**Migración 0029**, con columnas generadas STORED e índice `(game_id, columna, name, id)`:

| Columna | Magic | Yu-Gi-Oh! |
|---|---|---|
| `kind` | tipo principal de la primera cara, por prioridad: criatura > planeswalker > tierra > artefacto > encantamiento > instantáneo > conjuro > batalla > otra | monstruo · mágica · trampa · habilidad · ficha |
| `frame` | — | link > xyz > sincronía > fusión > ritual > péndulo > efecto > normal (y ficha) |
| `color_count` | número de colores, 0 si falta la clave | — |
| `attribute` | — | el atributo, sólo en monstruos |
| `link_val` | — | el valor de link |

El coste usa `cmc`, que ya tiene índice. El color concreto usa el índice multivaluado que existe desde
la 0001.

**Pokémon conserva** sus columnas de la 0027. El perfil apunta a ellas.

**API**

- Las filas llevan `facetas: { clave: valor }` en lugar de campos sueltos. El esquema de respuesta
  declara la unión de las claves de los tres perfiles: Fastify descarta lo no declarado (ADR-007), y
  la prueba de P-024 pasa a compararlo con los perfiles.
- `/api/games/:game/facets` devuelve `{ facetas: { clave: [{ value, count, owned }] }, rarities,
  total, ownedTotal }`, con «sin valor» como un grupo más.
- Los filtros siguen en parámetros planos de la URL (`?color=U&kind=creature`). El esquema admite la
  unión de claves, y **el servidor responde 400 a una clave que no es del juego**, con un mensaje que
  la nombra.
- **Incolora** es `color_count = 0 AND kind <> 'otra'` (F-5).

---

## 6. Interfaz

- **Rutas.** `/mtg` y `/ygo`, cada una con su portada (índice) y su `catalogo`, dentro de
  `JuegoLayout`. Las tarjetas de inicio de los dos juegos dejan de decir «En camino». El
  «Catálogo» del menú lleva al catálogo del juego actual; fuera de un juego, a la elección de juego.
- **Un solo `Catalogo`, un `RailDeSet` y una `FilaDeCarta`.** Recorren el perfil. La cabecera de
  la tabla, las chips y el estado en la URL salen de la misma lista.
- **Nombres accesibles conservados**: «Estructura», «Filtros activos», el nombre de cada sección. La
  suite E2E de Pokémon depende de ellos.
- **Tokens nuevos**, medidos por el test de contraste en los dos temas:
  - los cinco colores de maná más el incoloro;
  - los siete atributos de Yu-Gi-Oh!.
- **Símbolos de maná**: círculos con su letra, pintados en CSS a partir de `{2}{B}`. En las cartas de
  dos caras se muestran los dos costes, separados.
- **Nivel, rango y link**: estrellas para el nivel, una marca distinta para el rango, y el número con
  sus flechas para el link.
- **La ficha.** El armazón es compartido: diálogo, URL, foco y «añadir a un mazo». El cuerpo es de
  cada juego:
  - **Magic**: coste, tipo, texto de reglas, F/R o lealtad, y una nota si la carta tiene otra cara.
  - **Yu-Gi-Oh!**: atributo, nivel/rango/link (con las flechas del link), tipo y efecto, ATK/DEF
    (el «?» para -1) y la escala del péndulo.
- **La portada por año**: los sets del juego agrupados por año de salida, del más reciente al más
  antiguo. Cada set enlaza a su catálogo filtrado, como en Pokémon.

---

## 7. Errores y casos raros

| Caso | Comportamiento |
|---|---|
| Clave de faceta de otro juego | 400 con mensaje que la nombra |
| Valor desconocido de una faceta conocida | Resultado vacío, no error: el valor puede ser legítimo y no estar aún en la lista |
| Reverso «Card // Card» | Tipo «otra». No cuenta como incoloro, y **la faceta de coste lo excluye**: su 0 no es un coste real. Por eso la suma de los tramos de coste es menor que el total, y el raíl no lo esconde: muestra «N de M» igual que las demás |
| Coste 1.000.000 | Tramo «7+» |
| Link con `level` | Sólo en la faceta link |
| ATK -1 | Se pinta «?» |
| Sin sesión | Como en Pokémon: catálogo público, «me faltan» invita a iniciar sesión |

---

## 8. Pruebas y criterios de aceptación

1. **Pokémon intacto.** Los recorridos E2E del catálogo, de la ficha y de la prueba de humo pasan sin
   cambiar ninguna aserción de comportamiento. `facetas.test.ts` cambia la forma, no lo que comprueba.
2. **Cobertura del perfil** (F-2): un test en la API y otro en la web, que fallan si sobra o falta una
   clave en cualquiera de los dos lados.
3. **Rendimiento, medido.** `EXPLAIN` de cada faceta de Magic y Yu-Gi-Oh!: con índice y sin
   `filesort`. El raíl de Magic sin set, por debajo de 400 ms en la máquina de desarrollo.
4. **Contraste**: los tokens de maná y de atributo pasan AA en los dos temas.
5. **E2E nuevos**, cada uno roto a mano y visto fallar:
   - Magic: color + tipo + «me faltan», con el recuento del raíl igual a las filas;
   - Yu-Gi-Oh!: atributo + marco;
   - una ficha de cada juego, por rol y nombre accesible;
   - la portada por año enlazando al catálogo filtrado;
   - la clave de faceta de otro juego responde 400.
6. `npm test`, `npm audit` y `npm run vault:mutar` limpios, como siempre.

---

## 9. Orden de tareas

Cada una deja el proyecto en verde; se puede parar después de cualquiera.

1. **T-108** · El perfil en `@tcg/shared`, con sus tipos y los tres perfiles.
2. **T-109** · La migración 0029, con `EXPLAIN` medido.
3. **T-110** · La API al perfil, con Pokémon migrado, el test de cobertura y el 400.
4. **T-111** · La web al perfil, con Pokémon migrado y la suite E2E intacta.
5. **T-112** · Magic: tokens de maná, celdas y ficha.
6. **T-113** · Yu-Gi-Oh!: tokens de atributo, nivel/rango/link, celdas y ficha.
7. **T-114** · La portada por año, las rutas y el inicio.
8. **T-115** · Los E2E nuevos, cada garantía vista fallar, y el cierre del Vault.
