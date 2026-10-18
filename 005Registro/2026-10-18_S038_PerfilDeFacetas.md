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
