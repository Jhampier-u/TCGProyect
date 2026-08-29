# Plan de implementación — H9a y H9b

> **Spec:** `15_Spec_H9ab_Pokemon.md` · **Sesión:** S033 · **Tareas:** T-088 a T-095
> Ocho tareas, en este orden. **Se puede parar limpio después de cualquiera de ellas.**

---

## Lo que se comprobó al escribir el plan, y cambia dos cosas

**1. La ficha de carta ya existe en la API.** `app.get('/api/cards/:printId')` está en
`apps/api/src/api/server.ts:128` con el esquema `GET_CARD` y `CARD_DETAIL`. T-094 no crea un endpoint:
consume el que hay.

**2. La trampa de ADR-007 está en el resumen, no en el detalle.** `CARD_DETAIL` ya declara
`gameData: { type: 'object', additionalProperties: true }`, así que **todo `game_data` ya llega** a la
ficha. Pero `CARD_SUMMARY` —el que usa la búsqueda del catálogo— no lleva ni un dato de juego: sin
tocarlo, la rejilla no puede enseñar PS, tipo ni marca. Ahí es donde hay que declarar, y donde el
campo desaparece sin error si se olvida.

El spec decía "la ficha necesita campos nuevos". Es al revés. Corregido aquí.

---

# H9a — Cimientos

## T-088 · Sistema de diseño y tokens

**Ficheros**
- Crear: `apps/web/src/styles/tokens.css`
- Modificar: `apps/web/src/styles.css` (pasa a consumir tokens), `apps/web/src/main.tsx` (importa tokens antes)

- [ ] **1. Escribir `tokens.css` con la paleta base y los dos temas.**

Los tres estados del visor, no dos. El bloque `:root` lleva la paleta clara **completa**; el media
query redefine **sólo tokens** y va guardado; el selector explícito los redefine otra vez.

```css
:root {
  --ground: #FBFAF8;  --surface: #F3F1EC;  --ink: #17191B;
  --muted: #6A6E72;   --line: #E1DED6;     --accent: #C0392B;
  --space-1: .25rem;  --space-2: .5rem;    --space-3: .75rem;  --space-4: 1rem;
  --step-0: 1rem;     --step-1: 1.25rem;   --step-2: 1.6rem;   --step-3: 2.1rem;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #121416; --surface: #1A1D20; --ink: #ECE9E3;
    --muted: #979CA1;  --line: #2A2E32;    --accent: #E05B4A;
  }
}
:root[data-theme="dark"] { /* los mismos valores que el bloque de arriba */ }
```

- [ ] **2. Añadir la capa por juego.** Sobrescribe **sólo** lo que cambia de personalidad.

```css
[data-juego="ptcg"] { --accent: #C0392B; --tipo-planta: #2F7A46; --tipo-fuego: #C4571F; }
```

- [ ] **3. Convertir `styles.css` a tokens.** Ningún color literal fuera de `tokens.css`.
- [ ] **4. Comprobar contraste AA en los dos temas.** A mano, con las parejas reales
      (`--ink` sobre `--ground`, `--muted` sobre `--surface`, `--accent` sobre ambos). Apuntar los
      ratios en el commit: un "cumple AA" sin número no vale.
- [ ] **5. Verificar:** `npm test` y la suite E2E siguen verdes — todavía no se ha movido markup.
- [ ] **6. Commit:** `feat(web): design tokens with both themes and per-game layer (T-088)`

**Riesgo a vigilar:** un color cuya única definición viva dentro del media query. La página se
renderiza entonces con el texto de un tema sobre el fondo del otro. Revisar la hoja entera antes de
cerrar.

---

## T-089 · Módulo de cadenas, y la regla de ASCII por fin comprobada

**Ficheros**
- Crear: `apps/web/src/i18n/es.ts`, `tools/ascii-fuente.test.ts`
- Modificar: las 6 páginas y los 7 componentes de `apps/web/src`, `Claude.md`

- [ ] **1. Escribir `es.ts`** como datos, con los acentos que la interfaz perdió.

```ts
export const ES = {
  nav: { catalogo: 'Catálogo', sobres: 'Abrir sobres', coleccion: 'Mi colección', mazos: 'Mis mazos' },
  acceso: { titulo: 'Acceder', correo: 'Correo', contrasena: 'Contraseña' },
} as const;
```

- [ ] **2. Escribir primero la prueba que hace cumplir la regla.** Es la parte que da valor: el
      proyecto exige fuente en ASCII puro desde S008 y **nadie lo comprobaba**.

```ts
// tools/ascii-fuente.test.ts
it('el codigo fuente es ASCII puro, salvo el modulo de cadenas', () => {
  const infractores = ficherosDeFuente()
    .filter((f) => !f.includes('/i18n/'))
    .filter((f) => /[^\x09\x0a\x20-\x7e]/.test(leer(f)));
  expect(infractores).toEqual([]);
});
```

- [ ] **3. Ejecutarla y ver qué caza hoy.** Ya se sabe de un caso: `pack-service.ts:158` lleva un
      "rompería" acentuado en un comentario. Si sale mucho más, decidir si se limpia o si la regla
      necesita matices — pero decidirlo **con la lista delante**.
- [ ] **4. Mover el texto** página a página, sin cambiar markup.
- [ ] **5. Documentar la excepción en `Claude.md`**, junto a la regla de ASCII: `apps/web/src/i18n/`
      es el único sitio con acentos, y por qué.
- [ ] **6. Verificar:** `npm test` verde con la prueba nueva dentro. E2E verde — los textos cambian de
      *«Catalogo»* a *«Catálogo»*, así que **los recorridos que buscan por texto se rompen aquí**.
      Actualizarlos ahora, no en T-095.
- [ ] **7. Commit:** `refactor(web): user-facing strings out of the source, accents back (T-089)`

---

## T-090 · Navegación por juego y portada de Pokémon

**Ficheros**
- Modificar: `apps/web/src/App.tsx` (rutas planas hoy: `/`, `/acceso`, `/sobres`, `/coleccion`, `/mazos`)
- Crear: `apps/web/src/pages/Inicio.tsx`, `apps/web/src/pages/ptcg/Portada.tsx`, `apps/web/src/layouts/JuegoLayout.tsx`

- [ ] **1. `JuegoLayout`** pone `data-juego` en su contenedor y renderiza un `<Outlet />`.
- [ ] **2. Reestructurar las rutas.** `/` pasa a ser elección de juego; lo de cada juego cuelga de
      `/:juego`. **Redirecciones desde las rutas viejas**, que están en marcadores y en el E2E.

```tsx
<Route path="/" element={<Inicio />} />
<Route path="/ptcg" element={<JuegoLayout juego="ptcg" />}>
  <Route index element={<Portada />} />
  <Route path="catalogo" element={<Catalogo juego="PTCG" />} />
</Route>
<Route path="/catalogo" element={<Navigate to="/ptcg/catalogo" replace />} />
```

- [ ] **3. Portada de Pokémon** con los ejes que ya están medidos: por época (las seis ventanas reales
      de `pack_templates`, que en Pokémon **son** los bloques) y los sets recientes.
- [ ] **4. Verificar:** navegación completa con teclado; foco visible; E2E de navegación actualizado.
- [ ] **5. Commit:** `feat(web): per-game sections and a Pokemon landing (T-090)`

**Punto de parada natural.** Aquí ya se ve la dirección visual en pantalla y se puede juzgar antes de
invertir en catálogo y ficha.

---

# H9b — Catálogo y ficha

## T-091 · Migración 0027: columnas generadas e índices

**Ficheros**
- Crear: `db/migrations/0027_ptcg_facetas.up.sql` y `.down.sql`
- Modificar: `00Master/04_Diccionario_Datos.md`, `db/README.md`, `Claude.md`

- [ ] **1. Escribir la migración**, siguiendo el patrón de `cmc`/`atk`/`hp` — no inventar otro.

```sql
ALTER TABLE cards
  ADD COLUMN ptcg_supertype VARCHAR(24) GENERATED ALWAYS AS (
    CASE WHEN game_id = 3 THEN JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.supertype')) END) STORED,
  ADD COLUMN ptcg_type VARCHAR(24) GENERATED ALWAYS AS (
    CASE WHEN game_id = 3 THEN JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.types[0]')) END) STORED,
  ADD COLUMN ptcg_reg_mark CHAR(1) GENERATED ALWAYS AS (
    CASE WHEN game_id = 3 THEN JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.regulation_mark')) END) STORED;

CREATE INDEX idx_cards_ptcg_type ON cards (game_id, ptcg_type, name, id);
CREATE INDEX idx_cards_ptcg_mark ON cards (game_id, ptcg_reg_mark, name, id);
```

Los índices llevan `name, id` al final **a propósito**: son las columnas del desempate keyset, y sin
ellas filtrar por tipo obligaría a ordenar en memoria.

**La cabecera explica el porqué**, como toda migración de este proyecto: que `regulation_mark` es
`NULL` legítimo antes de 2019 y no un dato que falte, y que `subtypes` se queda fuera por ser un array
que exigiría índice multivaluado.

- [ ] **2. Escribir el `.down.sql`.** Quita índices y columnas, en ese orden.
- [ ] **3. Aplicar y medir** que los filtros usan el índice: `EXPLAIN` sobre la consulta real,
      comprobando que no hay `Using filesort`.
- [ ] **4. Ejecutar el rollback a mano y reaplicar**, como con la 0025 y la 0026. Un `.down.sql` que
      nadie ha ejecutado es un script roto: eso es P-035.
- [ ] **5. Actualizar el diccionario** con las tres columnas. **La comprobación del Vault (T-087)
      exige** que `db/README.md` mencione la 0027 y que `Claude.md` la liste; fallará si no.
- [ ] **6. Commit:** `feat(db): generated columns and indexes for Pokemon facets (0027, T-091)`

---

## T-092 · API: las facetas en el resumen

**Ficheros**
- Modificar: `apps/api/src/api/schemas.ts`, `apps/api/src/api/server.ts`,
  `apps/api/src/db/catalog-query-repository.ts`

- [ ] **1. Escribir primero la prueba que falla**: pedir el catálogo de Pokémon filtrando por tipo y
      esperar que cada elemento traiga `hp`, `ptcgType` y `regMark`.
- [ ] **2. Declararlos en `CARD_SUMMARY`.** Es el paso que ADR-007 castiga si se olvida: la consulta
      los devolvería y Fastify los tiraría **sin un solo error**.

```ts
export const CARD_SUMMARY = {
  type: 'object',
  properties: {
    /* ... lo que ya hay ... */
    hp: { type: ['integer', 'null'] },
    ptcgType: { type: ['string', 'null'] },
    regMark: { type: ['string', 'null'] },
  },
} as const;
```

- [ ] **3. Añadir los filtros a la consulta**, con `WHERE` sobre las columnas generadas.
      **La paginación sigue siendo keyset con desempate por `card_prints.id`.** No se toca: con
      `cards.id` desaparecían cartas del catálogo en silencio, y está escrito por qué.
- [ ] **4. Añadir el endpoint de facetas** que alimenta el raíl: cuántas cartas hay por tipo y por
      rareza en el set actual. Un `GROUP BY` sobre el índice nuevo.
- [ ] **5. Verificar:** pruebas verdes; `npm test` incluye ahora el type-check de los tests (T-086),
      así que un doble que no implemente el contrato nuevo **falla al compilar**.
- [ ] **6. Commit:** `feat(api): Pokemon facets in the card summary and a facet endpoint (T-092)`

---

## T-093 · Catálogo «Consulta» con el raíl

**Ficheros**
- Modificar: `apps/web/src/pages/Catalogo.tsx`
- Crear: `apps/web/src/components/RailDeSet.tsx`, `apps/web/src/components/FilaDeCarta.tsx`,
  `apps/web/src/lib/filtros-url.ts`

- [ ] **1. `filtros-url.ts`**: leer y escribir el estado de filtros en la query string. Es lo que hace
      que un filtro se pueda compartir y que el botón de atrás funcione.
- [ ] **2. `RailDeSet`**: la estructura del set siempre visible —por tipo, por rareza, con sus
      recuentos— y **filtrando al pulsar**. Es a la vez navegación, información y filtro; por eso no
      hay que explicarlo.
- [ ] **3. `FilaDeCarta`**: fila densa con número, nombre, PS como barra comparable y chip de tipo.
- [ ] **4. Chips de filtro activos**, borrables de uno en uno.
- [ ] **5. Imágenes con `loading="lazy"`** y tamaños declarados. **Medir cuántas peticiones hace una
      pantalla llena**: `/images/` tiene un tope de 300 por ventana (P-037) y una vista densa lo roza.
- [ ] **6. La prueba de aceptación es de usabilidad**, y se hace mirando: alguien que no conoce el
      proyecto tiene que poder pedir *"las de Planta de este set que me faltan"* sin instrucciones. Si
      hay que explicárselo, se rehace. No es una metáfora: es criterio de cierre.
- [ ] **7. Commit:** `feat(web): dense Pokemon catalogue with a structural rail (T-093)`

---

## T-094 · Ficha de carta

**Ficheros**
- Crear: `apps/web/src/components/FichaDeCarta.tsx`
- Modificar: `apps/web/src/pages/Catalogo.tsx`

- [ ] **1. Consumir `/api/cards/:printId`**, que ya existe y ya devuelve `gameData` entero.
- [ ] **2. Pintar lo específico de Pokémon**: PS, tipo, subtipos, ataques, debilidades, resistencias,
      coste de retirada, marca de regulación.
- [ ] **3. La marca de regulación explica su propia ausencia.** Una carta de 2016 no tiene marca y eso
      **no es un hueco**: el concepto no existía. El texto lo dice; no se pinta un guion.
- [ ] **4. Acciones**: añadir a un mazo (funciona ya) y añadir a la colección (**se conecta en H9c**).
      El segundo botón sólo se pinta cuando haga algo. **No se pinta un botón muerto.**
- [ ] **5. Accesible como diálogo**: foco atrapado, `Escape` cierra, foco devuelto al cerrar. Es la
      misma disciplina que `SelectorDeSet` ganó en T-066.
- [ ] **6. Commit:** `feat(web): card detail with per-game data and actions (T-094)`

---

## T-095 · Reescritura de la suite E2E

**Ficheros**
- Modificar: los cuatro `e2e/src/*.spec.ts`

- [ ] **1. Ampliar los dos que sobreviven** —el de URL externa (P-001) y el de errores de consola— a
      las rutas nuevas. **Son los más valiosos y no cuestan nada.**
- [ ] **2. Reescribir los ocho rotos con selectores por rol y nombre accesible**, no por clase CSS.
      Lo que sobrevive a un rediseño, y además obliga a que la interfaz tenga semántica.
- [ ] **3. Volver a probar las cuatro garantías, una por una:** teclado completo (T-066), movimiento
      reducido (T-040), iconos locales, no desbordar la columna (P-030).
- [ ] **4. Comprobar que no son vacuas.** Romper a mano lo que cada una vigila y ver que falla —la
      lección de T-083, T-087 y del byte 0x08 de S032. Una prueba que nunca ha visto un fallo no ha
      demostrado nada.
- [ ] **5. Commit:** `test(e2e): rewrite against the new interface, no guarantee lost (T-095)`

---

## Cierre del hito

- [ ] `npm test`, suite E2E y `npm audit --omit=dev` verdes.
- [ ] `npm run vault:mutar` sigue detectando las once derivas.
- [ ] Mover T-088 a T-095 de `Tareas_Pendientes.md` a `Tareas_Realizadas.md` **cuadrando la cabecera**
      — la comprobación del Vault lo exige y fallará si no.
- [ ] Bitácora de sesión en `005Registro`, y `Claude.md` al día.
- [ ] Revisar el riesgo que D-1 quería evitar: **¿puede Magic reutilizar lo que Pokémon deja montado?**
      Si no, D-1 falló y hay que decirlo antes de construir la segunda sección.
