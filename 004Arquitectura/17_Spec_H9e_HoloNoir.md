# Spec — H9e: Holo Noir y la apertura épica

> **Hito:** H9 — Identidad propia por juego · **Sub-proyecto:** H9e (rediseño visual), **adelantado**
> **Sesión:** S037 · **Fecha:** 2026-10-15 · **Estado:** aprobado por el usuario, pendiente de su revisión escrita
> **Plan:** pendiente; será el documento 18 de esta carpeta

---

## 1. Qué se está construyendo, y por qué ahora

El usuario pidió en S037 un rediseño *«moderno, profesional y aesthetic»*, una apertura de sobres con
motion graphics, sobres recreados por juego y estilos distintos para las cartas especiales. Se decidió
con maquetas en el navegador, pregunta a pregunta, y **todas las decisiones de la sección 3 son
suyas**.

**Por qué H9e y no un hito nuevo.** La regla de progresión de `03_Hitos.md` no deja abrir un hito con
el anterior sin cerrar, y H9 sigue abierto (faltan H9c y H9d). Pero el criterio de H9 ya incluye
*«rediseño completo de la interfaz»*, y su spec (`15_Spec_H9ab_Pokemon.md`) reservaba H9e para el
pulido. Esto **es** H9e; lo único que cambia es el orden: va antes que H9c y H9d por decisión del
usuario. En la conversación se llamó «H10» hasta que se vio la regla.

### Dentro

1. **Tokens Holo Noir** para toda la aplicación.
2. **Sobres híbridos**: arte por época, teñido y estampado por set.
3. **La escalera de rarezas**: cinco niveles de espectáculo, con el acabado aparte.
4. **El ritual de apertura**: rasgar, mazo, una a una, anticipación de la rara.

### Fuera, explícitamente

- Las once ideas de la lluvia de ideas (sección 8). Cada una tendrá su spec.
- Sonido. Es la idea 10 y va después.
- Las secciones de Magic y Yu-Gi-Oh!. Los tokens nuevos les llegan, pero su catálogo no.
- Cualquier cambio en el motor de sobres, en las plantillas o en `POST /api/packs/open`.

---

## 2. Lo que se midió antes de decidir

| Qué | Dato | Consecuencia |
|---|---|---|
| Plantillas de época y línea (sin las de set y sin retiradas) | **25**: 10 de Pokémon, 4 de Magic, 11 de Yu-Gi-Oh! | 25 ilustraciones cubren los 2.258 sets |
| Sets en el catálogo | 1.049 de Magic, 1.035 de Yu-Gi-Oh!, 174 de Pokémon | Un arte por set a mano es inviable |
| Rarezas de Pokémon con `tier` | 37, en los tiers 1 a 9 más `promo` (50) | El nivel sale del tier, no del nombre |
| Lo que devuelve la apertura | `rarity`, `finish`, `isNew` por carta | La API de apertura no cambia |
| «Iconos» de set de Yu-Gi-Oh! | Son la foto del sobre oficial (YGOPRODeck) | Los sobres de ProyectoTCG son diseño propio, nunca el embalaje oficial |

---

## 3. Decisiones tomadas

| # | Decisión | Quién |
|---|---|---|
| D-1 | Dirección de arte **Holo Noir**: negro profundo, luz violeta y cian, cristal, bordes holográficos | Usuario, entre tres maquetas (Holo Noir, Vitrina, Arcade Pop) |
| D-2 | Sobres **híbridos**: una ilustración por época (25), teñida con la paleta de cada set y con su icono y su nombre | Usuario, sobre recomendación, entre cuatro opciones |
| D-3 | Ritual **completo**: rasgar, mazo, una a una, anticipación antes de las raras | Usuario, entre tres guiones |
| D-4 | **Cinco niveles** de espectáculo por tier, con el acabado (foil, reverse) como capa aparte | Usuario, con la demo interactiva |
| D-5 | Motor **híbrido**: cartas y sobre en el DOM con Framer Motion; un `<canvas>` sólo para partículas y rayos. Sin WebGL | Usuario, entre tres enfoques |
| D-6 | Las ilustraciones son **arte original** sin logos ni marcas oficiales, generadas por el usuario con Nano Banana Pro a partir de prompts que se le entregan | Este spec |
| D-7 | **La animación nunca decide nada**: cartas, orden y rareza llegan del servidor antes de rasgar | Este spec — condición de H4 |

---

## 4. H9e-1 · Tokens Holo Noir

`tokens.css` cambia de paleta y conserva su estructura: oscuro primero, los tres estados del visor
(`:root`, `prefers-color-scheme` guardado con `:not([data-tema="oscuro"])`, y `[data-tema="claro"]`),
ningún color sólo dentro de un media query, y la capa por juego (`--juego-acento`, dorsos) encima.

**Tokens nuevos** que necesita lo demás: luz ambiental (`--luz-1`, `--luz-2`), superficie de cristal
(`--cristal`, `--cristal-borde`), el degradado holográfico (`--holo`) y un color por nivel de rareza
(`--nivel-2` a `--nivel-5`).

**El claro existe y es digno**, pero Holo Noir es oscuro por naturaleza: en claro la luz ambiental se
apaga y el holográfico se modera. El contraste AA se exige en los dos, y lo vigila
`tools/contraste-tokens.test.ts`, al que se añaden los tokens nuevos que pinten texto.

Tipografía: **Space Grotesk** para títulos y cifras, la del sistema para el texto corrido. Se sirve
desde el propio proyecto, no desde Google Fonts: una fuente de un tercero es una petición del
navegador a un dominio externo, lo mismo que P-001 prohíbe para las imágenes.

---

## 5. H9e-2 · Sobres híbridos

### En el servidor

- **Migración 0028, `sets.palette`**: JSON con dos colores, `{ "primario": "#rrggbb", "secundario": "#rrggbb" }`, nulable.
- **`npm run sobres:paleta`**: calcula la paleta de cada set con `sharp` a partir de la imagen ya
  cosechada de su impresión de mayor tier. **Sin red**: sólo lee `storage/`. Se puede relanzar; sólo
  rellena las que faltan salvo que se le pida recalcular.
- **`SetSummary` gana `palette` y `artKey`.** `artKey` es el nombre normalizado de la plantilla de
  época o línea que el motor ya resuelve para ese set. Si el set tiene plantilla propia, se usa la de
  su época por fecha: el arte es de época, no de producto. Los dos campos se **declaran en el esquema**
  y se seleccionan en **todas** las consultas que construyen un `SetSummary` (lección de T-092).

### En la web

- **`Sobre`** compone el arte de `apps/web/public/sobres/{juego}/{artKey}.webp`, la paleta del set
  como tinte (`mix-blend-mode`), el icono local del set y su nombre. Bordes dentados, brillo
  holográfico que sigue al puntero.
- **Un manifiesto** (`public/sobres/manifiesto.json`) dice qué ilustraciones existen. Si falta la de una
  época, **degradado de reserva** con la paleta del set; si falta la paleta, los colores de dorso del
  juego. Nada se rompe sin las imágenes, y H9e-2 se puede cerrar antes de que lleguen.

### Las ilustraciones

Se entregan al usuario **25 prompts** en un fichero, uno por época, con un estilo común (Holo Noir,
envoltorio de sobre en vertical, sin texto, sin logos, espacio libre en el centro para el icono). El
usuario las genera y las deja en una carpeta; se convierten a WebP de menos de 150 KB cada una.

---

## 6. H9e-3 · La escalera de rarezas

`lib/rareza.ts`, puro y probado:

| Nivel | Nombre | Tier | Efecto |
|---|---|---|---|
| 1 | Base | 1-2 | Volteo rápido, sin brillo |
| 2 | Destello | 3-4 | Filo metálico y barrido de luz |
| 3 | Holo | 5-6 | Arcoíris que sigue al puntero, halo del color del tipo |
| 4 | Galería | 7 | Inclinación 3D, prisma suave, pausa antes de voltear |
| 5 | Leyenda | 8-9 | Pantalla apagada, rayos dorados, chispas |

`promo` (tier 50) es **nivel 2**: una promo no es una carta rara en el sentido del sobre, y no sale en
ellos. El reparto exacto de las rarezas de Magic y Yu-Gi-Oh! por tier se fija en el plan con la lista
real de la base; ninguna rareza puede quedar sin nivel, y una prueba lo comprueba.

**El acabado va aparte** (`normal`, `foil`, `reverse`): una textura propia que no sube el nivel. Así
«brilla» no se confunde con «es rara».

`CartaConBrillo` aplica nivel y acabado, expone ambos como `data-nivel` y `data-acabado`, y se usa en
la apertura, la ficha y la colección.

---

## 7. H9e-4 · El ritual

### La secuencia

1. **Pedir** — al pulsar «Abrir» se llama a la API. Si falla, el sobre **no aparece**: error y
   «Reintentar». No se ha registrado nada.
2. **Sellado** — el sobre flota. Se rasga arrastrando por el borde superior (ratón o dedo) o con
   `Enter`/`Espacio`. Soltar antes de la mitad lo cierra otra vez.
3. **Rasgando** (~0,6 s) — la tira se separa, las cartas suben en mazo boca abajo.
4. **Una a una** — clic, deslizar o `Enter`: la de arriba se voltea y vuela a la bandeja. Orden de
   menor a mayor tier, como ya hace `PackReveal`. Niveles 1-2: ~0,35 s.
5. **Anticipación** — sólo antes de los niveles 4 y 5: luz apagada, temblor, fuga de brillo (1,2 s).
6. **Revelado** — con el efecto de su nivel; el 5 activa el lienzo.
7. **Resumen** — la bandeja completa, las nuevas marcadas, «Abrir otro».

> **Enmienda (S038, 2026-10-18), a petición del usuario.** El paso 4 se implementó en H9e volteando
> la carta directamente en la bandeja, a unos 140 px, y nunca había un momento en que se viera en
> grande. El usuario lo encontró «muy simple». Ahora **cada carta pasa por un foco**:
> - vuela del mazo al centro de la escena, a unos 340 px, y se voltea allí con el efecto de su nivel;
> - la anticipación de los niveles 4 y 5 ocurre también en el foco;
> - se queda hasta que el usuario avanza (clic, deslizar o `Enter`), y entonces vuela a su hueco de
>   la bandeja;
> - **la última carta también espera**: es la más rara del sobre, y un temporizador le quitaría su
>   momento.
>
> En el modo rápido sólo pasan por el foco los niveles 4 y 5. Los dorsos tienen diseño propio por
> juego, todo en CSS.

`lib/ritual.ts` es la máquina de estados pura de esa secuencia: sin React, probada transición a
transición, incluido «Saltar» y el modo reducido.

### Atajos

- **«Saltar»** siempre visible: todo revelado, directo al resumen.
- **Varios sobres**: ritual completo en el primero; en los demás, modo rápido que sólo se detiene en
  niveles 4 y 5.
- **Movimiento reducido**: todo revelado de golpe, sin lienzo (es lo que ya comprueba T-040).

### Fallos

| Si… | Entonces… |
|---|---|
| La API falla al abrir | El sobre no aparece; error y «Reintentar» |
| La apertura se registró y la animación se corta (recarga, otra pestaña) | Las cartas ya están en la colección; la apertura se podrá repetir desde su semilla (idea 2) |
| Falta la ilustración de la época | Degradado de reserva con la paleta del set |
| El set no tiene paleta | Colores de dorso del juego |
| El dispositivo va lento | El lienzo baja partículas por debajo de 45 fps; las cartas no se ven afectadas |

### La semántica se conserva

Cada carta sigue siendo un `button` con `aria-pressed` dentro de la región «Sobre #N». Las pruebas E2E
de T-040 y T-095 no se tocan para que pasen: **tienen que pasar como están**.

---

## 8. Hoja de ruta que deja la lluvia de ideas

El usuario eligió **once de doce** ideas; la PWA (11) quedó fuera. Cada una tendrá su spec, en este
orden sugerido, y ninguna entra en H9e:

| # | Idea | Por qué en este orden |
|---|---|---|
| 1 | Tu suerte frente a la real | Barata; sólo este proyecto tiene las probabilidades reales |
| 2 | Repetir y compartir una apertura | Barata; la semilla ya existe y H9e deja el ritual reutilizable |
| 6 | Logros | Barata; se apoya en el ritual |
| 4 | Lista de deseos | Un efecto propio en la apertura |
| 10 | Sonido, desactivable | Encima del ritual ya hecho |
| 3 | Abrir una caja entera | Usa el modo rápido de H9e |
| 8 | Probar la mano inicial | Pequeña, sobre los mazos existentes |
| 7 | Modo sellado | Une sobres y mazos |
| 9 | Buscador global | Transversal |
| 5 | La carpeta (H9c) | Grande; ya prevista |
| 12 | Magic y Yu-Gi-Oh! | Grande; necesita el perfil de facetas por juego (revisión de D-1 en S037) |

---

## 9. Criterios de aceptación

- `npm test` verde, con las comprobaciones del Vault y el type-check de los tests.
- Suite E2E verde **sin cambiar** las pruebas de T-040 y T-095, más las nuevas: ritual completo con
  teclado, «Saltar», movimiento reducido sin lienzo, ninguna URL externa en el sobre, el sobre de
  *151* con el arte de Scarlet & Violet, una carta de nivel 5 que pasa por la anticipación.
- Cada garantía nueva **rota a propósito y vista fallar**.
- Migración 0028 aplicada y **su rollback ejecutado a mano**.
- `npm audit` limpio.
- Contraste AA de los tokens Holo Noir en los dos temas, por test.
- **Presupuestos**: 60 fps en escritorio durante un revelado de nivel 5; el código de efectos añade
  menos de 30 KB comprimidos; cada ilustración, menos de 150 KB.
- **Accesibilidad del movimiento**: inclinación máxima de 16°, nada parpadea más de 3 veces por
  segundo (WCAG 2.3.1), movimiento reducido lo apaga todo.
- **Cierre de verdad**: abrir un sobre de *151* y vivir el ritual entero con su SIR al final, mirado en
  el navegador, no sólo por DOM (§4.4 de `05_Continuar_Aqui.md`).

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Holo Noir rompe el contraste en una pantalla vieja | Los tokens cambian en un solo sitio y el test de contraste falla antes del commit |
| Rehacer Sobres pierde semántica | La suite E2E busca por rol desde T-095: si se pierde, falla |
| Las 25 imágenes tardan | El degradado de reserva cierra H9e-2 sin ellas |
| Los brillos marean | Movimiento reducido, inclinación acotada, sin parpadeos rápidos |
| El lienzo consume batería en móvil | Se detiene con la pestaña oculta y baja partículas con fps bajos |
| La paleta automática sale fea en algún set | Se calcula una vez y se guarda: se puede corregir a mano en la base sin tocar código |
