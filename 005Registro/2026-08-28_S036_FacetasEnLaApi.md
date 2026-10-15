# S036 — Las facetas en la API, y ADR-007 mordiendo de verdad

**Fecha:** 2026-08-28 · **Tareas:** T-092 · **Sin migración**

> **Bitácora reconstruida en S037** a partir del commit `361c879` y de `facetas.test.ts`. Igual que
> S035, la sesión cerró la tarea y movió sus filas en `001Reportes`, pero no dejó registro propio.

---

## T-092 — Lo que la rejilla necesita, declarado

`hp`, `supertype`, `elemType` y `regMark` entran en `CARD_SUMMARY`. Es el paso que el plan señalaba
como trampa: sin declararlos, la consulta los devolvería y Fastify los tiraría **sin un solo error**
(ADR-007). Con ellos la rejilla pinta el chip de tipo y la barra de PS sin pedir la ficha de cada
carta.

### Filtros sobre las columnas de la 0027

`/api/cards` acepta `type`, `supertype` y `mark`, y todos van a las columnas generadas, así que usan
el índice en vez de recorrer JSON. **La paginación sigue siendo keyset** con desempate por
`card_prints.id`: no se tocó.

Pedir las cartas **sin** marca de regulación es un valor propio del filtro, no la ausencia del filtro.
Las 12.250 cartas anteriores a 2019 no tienen marca legítimamente —el concepto no existía— y omitir
el filtro devuelve todo, que es otra pregunta.

### `/api/games/:game/facets`

Devuelve los recuentos por tipo, categoría, rareza y marca que alimentan el raíl de T-093, **acotados
al set** cuando se pasa uno. Enseñar *«Agua 2436»* mientras se recorre un set que tiene cuatro sería
mentir con un número. Ese recuento es además lo que hace que el filtro se explique solo: una lista
que dice *«Planta 23, Fuego 10»* ha respondido antes de que nadie pulse. `withoutMark` va aparte de
`marks` por lo mismo que el filtro: no tener marca no es una marca más.

---

## El fallo que el plan no predijo

ADR-007 mordió, y por el lado contrario al previsto. Declarar los campos en el esquema compartido
**rompió `GET /api/cards/:id` con un 500**.

`searchCards` y `findCard` construyen el resultado con el mismo `toSummary`, pero cada una tiene su
propio `SELECT`, y sólo el primero recibió las columnas nuevas. La ficha devolvía
`Number(undefined) = NaN` y el serializador lo rechazaba.

**La salvaguarda de P-024 no lo vio**: compara `toSummary` contra el esquema, y `toSummary` estaba
bien. Lo que no casaba era la consulta que lo alimenta. **Lo cazó la suite E2E**, al fallar el
recorrido que añade una carta a un mazo.

Ahora las dos consultas tienen una prueba que las ata: si una gana una columna y la otra no, falla.
Es la familia de P-026 —un contrato que se cumple en un sitio y no en su gemelo— y la lección es la
de §4.8 de `05_Continuar_Aqui.md`: el test unitario veía la mitad del camino; el servidor de verdad,
entero.

---

## Estado al cerrar

- H9b: T-091 y T-092 cerradas. Abiertas: **3** (T-093, T-094, T-095).
- **Siguiente:** T-093, el catálogo «Consulta» con el raíl.
