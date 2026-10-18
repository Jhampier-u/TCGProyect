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
