
# S016 — Interfaz sobria (H5, primera pasada)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Empieza sobrio y luego la animación"*.

## Agentes invocados
1. **Agente Backend** — arranque real del servidor y servido de imágenes.
2. **Agente Frontend** — cliente de API, sesión y cuatro pantallas.
3. **Agente Seguridad** — revisión de lo que la API deja salir al navegador.
4. **Agente QA** — verificación en un navegador real.

---

## Faltaba algo básico: el servidor no arrancaba

`apps/api/src/index.ts` era, desde S004, un esqueleto que imprimía los tres juegos por consola.
**Quince sesiones de backend y no había forma de levantarlo.** Se añadió:

- `config.ts`, que **falla al arrancar** si falta `DATABASE_URL`, `JWT_SECRET` o
  `EXTERNAL_USER_AGENT`. Un valor por defecto para el secreto es una cuenta de administrador
  regalada (ADR-008); uno para la base de datos apuntaría a la base equivocada.
- `index.ts`, que aplica migraciones **antes** de aceptar peticiones. Arrancar contra un esquema
  desactualizado produce errores confusos horas después, en consultas que no tienen nada que ver.
- Servido de `/images/` con caché inmutable de un año: las imágenes de carta, una vez cosechadas,
  no cambian nunca.

---

## Dependencias: tres, y por qué no más

| Añadida | Motivo |
|---|---|
| `react-router-dom` | Cuatro pantallas necesitan navegación |
| `@tanstack/react-query` | Paginación, caché y estados de carga que habría que reescribir a mano |
| `@fastify/static` | Sin él, el navegador no puede ver ni una carta |

**Descartadas conscientemente:**
- **Zustand** — un contexto de React basta para un token. Se revisará si el estado crece.
- **TailwindCSS** — `02_Stack` lo proponía, pero como `PROPUESTO`, no `CONFIRMADO`. Para una pasada
  sobria, un CSS con variables produce menos configuración, menos dependencias y un diff más legible.
  Sigue siendo opción si la interfaz crece.

`npm audit`: **0 vulnerabilidades**.

---

## Construir la interfaz destapó un hueco de la API

El selector de sets tenía el `externalId`, pero `POST /api/packs/open` pide el **id numérico**, y
`GET /api/games/:game/sets` **no lo devolvía**. La interfaz no podía conectar las dos cosas.

Corregido en las cinco capas (consulta, esquema, tipo del cliente, componente y fixture del test).
Se expone el `id` porque es lo único que identifica un set globalmente: `externalId` sólo es único
**dentro** de un juego.

Es la clase de hueco que ninguna cantidad de tests de backend revela — hace falta que alguien intente
usar la API para algo.

---

## Y una fuga real de P-001 (P-022)

Al arrancar el servidor y mirar la respuesta de verdad:

```json
"iconUrl": "https://images.ygoprodeck.com/images/sets/SUDA.jpg"
```

Con 1032 sets, un frontend que pintara iconos haría **1032 peticiones a YGOPRODeck por cada usuario
que abriera el selector**. Es exactamente el hotlinking que P-001 llevaba quince sesiones conteniendo.

**Por qué ADR-007 no lo impidió:** la serialización por esquema elimina lo **no declarado**, y
`iconUrl` sí estaba declarado. La garantía estructural protege de los descuidos, no de haber
declarado el campo equivocado.

**Por qué el test de S013 no lo detectó:** comprobaba *"ninguna respuesta contiene http"*… pero la
fixture devolvía `iconUrl: null`. **El test pasaba sin ejercitar nada.** Un test verde que no toca el
caso da confianza falsa.

Se dejó de exponer el campo, y la fixture ahora devuelve una URL real de `images.ygoprodeck.com`: si
alguien vuelve a exponerla, el test falla. Los iconos propios llegan en **T-035**.

---

## Verificación en un navegador real

No basta con que compile. Se levantó MySQL, se ingestó *Supreme Darkness*, se **cosecharon las 125
imágenes reales** (38 s, 86,6 % de reducción) y se recorrió el producto:

| Paso | Resultado |
|---|---|
| Catálogo | 125 cartas con arte real, filtros por set y rareza, búsqueda |
| Registro y acceso | Redirige a `/sobres` con la sesión activa |
| **Abrir sobre** | 9 cartas: **8 comunes + 1 super rare foil** — la estructura de T-024 |
| Marca de "nueva" | 8 de 9; la repetida sin marcar |
| Colección | 16 cartas · 18 copias · 2 sobres · barra al 12,8 % |
| **URLs externas en el HTML renderizado** | **0** |

Esa última fila es la que importa: el invariante de P-001 no se comprueba sólo en un test, sino en la
página que un usuario vería.

Dos observaciones sobre el método: la captura de pantalla sólo salió una vez (el panel del navegador
dejó de componer fotogramas), así que el resto se verificó leyendo el DOM. Y los `<input>` de React
son controlados, de modo que rellenarlos por automatización exige el *setter* nativo más un evento
`input` — escribir en `.value` no lo ve React. Ninguna de las dos cosas es un defecto del producto,
pero conviene anotarlas para cuando se escriban los Cypress de H8.

---

## Estado al cerrar
- H1 ✅ · H2 ✅ · H3 ✅ · H4 ✅ · H6 ✅ · **H5 sobrio ✅** · H0: falta Docker.
- Tareas: **50 realizadas · 8 pendientes · 1 bloqueada**.
- Problemas: **5 abiertos · 16 cerrados**.
- Tests: **196/196** · `tsc --build` limpio · `npm audit` limpio.

Se conservan las 125 imágenes en `storage/cards` (3,4 MB, fuera de git). No es descuido: la política
de P-001 es descargar **una vez**, y la salvaguarda del job detecta el fichero en disco y no vuelve a
pedirlo al origen.

## Siguiente acción esperada
**T-039: la animación de apertura** con Framer Motion. El circuito está verificado de punta a punta;
ahora toca la experiencia que `01_Producto.md` describe como el núcleo del producto.
