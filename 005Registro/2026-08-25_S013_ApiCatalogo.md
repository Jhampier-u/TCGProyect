# S013 — API HTTP del catálogo (H3)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sí, lanza H3"*.

## Agentes invocados
1. **Agente Arquitectura** — ADR-007 (framework HTTP).
2. **Agente Base de Datos** — `CatalogQueryRepository`.
3. **Agente Backend** — servidor y rutas.
4. **Agente Seguridad** — el invariante de P-001 en la frontera HTTP.
5. **Agente QA** — 18 tests + recorrido completo del catálogo real.

---

## ADR-007 — Fastify, y no por rendimiento

Se ofreció presentar las opciones antes de decidir; el usuario dijo "lanza H3", así que se tomó la
decisión con justificación explícita y queda anotada para poder revertirse.

**El motivo decisivo es la serialización por esquema.** Fastify no sólo valida la entrada: al
serializar la respuesta **elimina todo campo que no esté en el esquema declarado**.

Aplicado a este proyecto, eso convierte el invariante más caro que tenemos en una garantía
estructural:

> **`card_prints.image_source_url` no puede filtrarse al frontend.**

Ese campo apunta a `images.ygoprodeck.com`. Servirlo al navegador es exactamente el hotlinking que
castiga con lista negra de IP permanente (P-001). Con Express, evitarlo depende de que nadie escriba
nunca un `res.json(row)` de más. Con Fastify, un campo que no está en el esquema **no sale**, aunque
la consulta lo traiga.

Hay un test que lo comprueba adversarialmente: se hace que el repositorio devuelva la URL de origen a
propósito, y se verifica que el cuerpo de la respuesta no contiene `ygoprodeck.com`.

---

## Decisiones de diseño

**Paginación keyset, no offset.** Con `LIMIT/OFFSET`, pedir la página 500 obliga a MySQL a leer y
descartar 20.000 filas; sobre las 116.752 impresiones de Magic eso es inusable. Medido sobre datos
reales: **primera página 7 ms, última página 2 ms**. La última es más barata que la primera.

**El cursor es opaco** (base64) para que nadie lo trate como un número de página, y un cursor corrupto
sirve la primera página en vez de devolver un 500 — un enlace viejo o manipulado no debe romper nada.

**Búsqueda con dos caminos.** InnoDB ignora por defecto los tokens de menos de 3 caracteres, así que
un `MATCH` con "ex" no devolvería nada. Por debajo de ese umbral se cae a `LIKE` por prefijo, que es
además lo que el usuario espera mientras teclea. Los operadores de MySQL (`+ - * " ( )`) se
**eliminan** del texto: dejarlos pasar permite provocar errores de sintaxis o consultas absurdamente
caras.

**Se ordena por nombre, no por relevancia.** Es una renuncia consciente: ordenar por relevancia de
`MATCH` rompe la estabilidad que el keyset necesita. Para un navegador de catálogo, que la paginación
no salte ni repita pesa más que el orden de relevancia. Anotado como posible mejora.

---

## El endpoint que deliberadamente NO existe

`POST /api/packs/open` **no se ha expuesto**, y hay un test que lo comprueba.

El motor está construido y probado desde S012, pero abrir un sobre **muta la colección de un usuario
concreto**. Exponerlo antes de tener autenticación (H6) significaría aceptar el `user_id` que mande
el cliente: una vulnerabilidad de referencia directa a objetos de manual, con la que cualquiera
podría llenar —o vaciar el sentido de— la colección de otro.

Se prefiere no tener el endpoint a tenerlo inseguro. El hito H4 se ha reetiquetado: el endpoint
espera a **H6**, no a H3.

---

## Un bug que sólo aparece a escala (P-020)

El primer recorrido completo del catálogo devolvió **723 de 733 impresiones**. Diez filas
desaparecidas, en silencio.

El cursor usaba `(cards.name, cards.id)`. Pero cada fila es una **impresión**, y varias comparten
carta conceptual — en Yu-Gi-Oh! la misma carta sale en dos rarezas del mismo set (P-013). Con
`cards.id` como desempate, el cursor identifica un **grupo**, no una fila, y `c.id > ?` descartaba
las impresiones restantes de esa carta.

| | Antes | Después |
|---|---|---|
| Impresiones devueltas | **723** | **733** |
| Cobertura completa | ❌ | ✅ |

Corregido usando `card_prints.id`. **Los tests unitarios no podían verlo**: el catálogo falso
devolvía una página fija sin paginar de verdad. Mismo patrón que P-017 — el bug que sólo se
manifiesta recorriendo el conjunto entero.

---

## Verificación

### Tests — 18 nuevos (174 en total)

### Contra el catálogo real (4 sets de Yu-Gi-Oh!, 733 impresiones)

| Comprobación | Resultado |
|---|---|
| Recorrido completo | **733 de 733**, 15 páginas, sin duplicados ✅ |
| Coste primera vs última página | 7 ms vs **2 ms** ✅ |
| Búsqueda `"blue eyes"` | Devuelve *Blue-Eyes White Dragon* ✅ |
| Búsqueda `"ex"` (2 letras) | Cae a `LIKE`, devuelve *Exodia the Forbidden One* ✅ |
| **Ninguna respuesta contiene una URL externa** | ✅ — y eso que la BD guarda 733 `image_source_url` que empiezan por `http` |
| Validación de entrada | Juego inválido 400 · `limit=500` 400 · parámetro no declarado 400 |
| Cursor corrupto | 200, sirve la primera página |
| `POST /api/packs/open` | **404** — no existe, a propósito |

---

## Estado al cerrar
- **H1 ✅ · H2 ✅ · H3 ✅** · H4: el motor funciona, el endpoint espera a H6 · H0: sólo Docker.
- Tareas: **39 realizadas · 6 pendientes · 1 bloqueada**.
- Problemas: **5 abiertos · 14 cerrados**.
- Tests: **174/174** · `tsc --build` limpio · `npm audit` limpio.

## Siguiente acción esperada
Dos caminos con sentido:
- **H6 (auth)** desbloquea el endpoint de sobres y la colección — es lo que falta para que el
  producto haga algo por un usuario concreto.
- **H5 (frontend)** ya tiene una API real que consumir: es la primera vez que el producto se vería.
