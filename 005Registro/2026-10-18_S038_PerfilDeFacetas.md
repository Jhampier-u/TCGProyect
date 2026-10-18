# S038 — Perfil de facetas por juego: el spec de H9f

**Fecha:** 2026-10-18 · **Hito:** H9 · **Sub-proyecto:** H9f

## Qué pidió el usuario

Tras cerrar H9e preguntó qué hacer ahora. Le propuse este orden:

1. el perfil de facetas;
2. H9c;
3. el pulido del ritual;
4. T-097.

Contestó «dale con todo». El pulido se hizo primero, en esta misma conversación, y quedó en la
bitácora de S037. Para el perfil pidió **también los catálogos de Magic y Yu-Gi-Oh! en el mismo
spec**: un perfil sin un segundo consumidor no demuestra nada.

## Decidido con el usuario

| Pregunta | Elegida |
|---|---|
| Alcance | Perfil y los dos catálogos, en un spec |
| Facetas de Magic | Color, tipo y coste |
| Facetas de Yu-Gi-Oh! | Clase, marco, atributo, nivel o rango, y link |
| Cómo se construye | **A**: perfil declarativo en `@tcg/shared`, con una vía de escape para filtros propios |
| Portadas | Por año de salida para Magic y Yu-Gi-Oh!; la de Pokémon no se toca |

La legalidad por formato y la lista de prohibidas quedan fuera: son del constructor de mazos.

## Lo que los datos obligaron a decidir

Antes de diseñar se midió la base de desarrollo. Cuatro hallazgos cambiaron el diseño:

- **2.274 cartas de Magic son reversos «Card // Card»** y otras 401 son «Card» a secas: sin tipos, sin
  colores y con coste 0. Van al tipo «otra», no cuentan como incoloras y la faceta de coste las
  excluye. Si no, habrían falseado dos facetas a la vez.
- **110 monstruos Link tienen `level`** además de `link_val`, y el rango de los Xyz va también en
  `level`. Los Link tienen su propia faceta.
- **Las mágicas y trampas guardan su subtipo en `race`**, y «Normal» lo comparten las dos clases.
  Por eso existe la vía de escape del perfil.
- **Contar una faceta de Magic sin set cuesta 0,2–0,4 s** sobre 117.000 impresiones. Cada faceta
  nueva tendrá columna generada e índice, medidos con `EXPLAIN`.

## Estado

Spec escrito: `20_Spec_H9f_FacetasPorJuego.md`. Tareas T-108 a T-115 abiertas en
`Tareas_Pendientes.md`. Falta la revisión escrita del usuario y, después, el plan.

## El plan

El usuario revisó el spec y pidió el plan: `21_Plan_H9f_FacetasPorJuego.md`, con ocho tareas (T-108 a
T-115) y el código completo. Escribirlo contra el código y los datos corrigió el spec en trece puntos,
apuntados al principio del plan. Los que cambian algo de fondo:

- **Una columna generada STORED no puede leer `game_id`.** La clave foránea con `ON UPDATE CASCADE`
  lo prohíbe. La guarda de cada juego es la clave JSON exclusiva de ese juego: `legalities` en Magic
  y `race` en Yu-Gi-Oh!, verificadas en las 38.606 y 14.104 cartas.
- **«Sin `filesort`» no se puede cumplir**, y Pokémon tampoco lo cumple hoy: la búsqueda ordena por
  `c.name, p.id` entre dos tablas. El criterio pasa a ser que cada filtro selectivo use su propio
  índice y que el raíl de Magic sin set responda en menos de 400 ms.
- **El marco de Yu-Gi-Oh! es una faceta simple**, gracias a su columna. La que necesita la vía de
  escape es el nivel, que debe excluir a los Link.
- **T-110 y T-111 van seguidas**: entre las dos, la forma de la respuesta cambia y el catálogo de
  Pokémon queda roto. No se despliega ni se sube nada entre ellas.

Una revisión del plan contra el repositorio no encontró errores de diseño, pero sí cuatro pasos que
habrían fallado tal como estaban escritos:
- la imagen web y la de la suite E2E llevan código dentro y hay que reconstruirlas;
- `127.0.0.1:3000` es otra aplicación en este equipo;
- un criterio de `EXPLAIN` no podía fallar.

Además cazó que la ficha de Pokémon cambiaba de orden. Todo se corrigió antes de entregar el plan.

## P-044: migraciones que no están en el repositorio

Al medir los índices apareció algo ajeno a H9f: la base de desarrollo tiene **cinco migraciones
aplicadas entre el 2026-08-30 y el 2026-09-01 que no existen en ningún sitio del repositorio**: la
colección real, los precios y las entidades HTML. Cae en el hueco sin bitácora entre S036 y S037, y
parece trabajo de H9c hecho en otra copia. Queda abierto como P-044 hasta que el usuario diga de
dónde sale.

## Ejecución

### T-108 — El perfil

Se hizo tal como estaba en el plan. La revisión probó las pruebas mutando el perfil, y **6 de 9
mutaciones pasaban**: valores reordenados, valores borrados, el `allowsNone` del nivel. Se añadió una
prueba que fija, con igualdad exacta, las facetas, los modos, los valores y las celdas de los tres
juegos. Las cinco mutaciones repetidas fallan ya.

### T-109 — La migración 0029, medida

Se aplicó a la base de desarrollo en unos 20 s y luego se probó la vuelta atrás y la reaplicación.
Todos los recuentos coinciden con los del plan:

- **Magic, por tipo**: criatura 20.002, otra 3.320 y el resto como en el spec.
- **Magic, por número de colores**: 0 → 7.769, 1 → 25.922, 2 → 4.053.
- **Yu-Gi-Oh!**: 9.098 monstruos repartidos en ocho marcos, y atributos y link como en el spec.
- **Pokémon**: todas sus filas nulas en las columnas nuevas.

`EXPLAIN`, sobre `cards`:

| Filtro | Índice | Filas estimadas |
|---|---|---|
| `'U' MEMBER OF colors` | `idx_cards_mtg_colors` | 7.302 |
| `color_count = 0 AND kind <> 'other'` | `idx_cards_color_count` | 14.796 |
| `color_count >= 2` | `idx_cards_color_count` (rango) | 8.962 |
| Yu-Gi-Oh! `kind = 'spell'` | `idx_cards_kind` | 2.812 |
| `frame = 'xyz'` | `idx_cards_frame` | 596 |
| `attribute = 'DARK'` | `idx_cards_attribute` | 2.601 |
| `link_val = 2` | `idx_cards_link_val` | 220 |
| `lvl = 4 AND NOT (frame <=> 'link')` | `idx_cards_lvl` (el de P-044) | 2.568 |
| Magic `kind = 'creature'`, tramos de coste | `uq_cards_game_oracle` | 36.337 |

Los dos filtros poco selectivos recorren Magic por `game_id`, como el plan aceptaba. Su garantía es
el cronometrado de T-110.

El de nivel elige `idx_cards_lvl`, el índice fantasma de P-044, en vez del nuevo `idx_cards_level`.
En una base limpia sólo existe el nuevo: otra razón para resolver P-044.
