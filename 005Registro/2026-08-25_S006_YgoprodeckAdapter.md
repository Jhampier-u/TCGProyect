# S006 — T-012 (`YgoprodeckAdapter`)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sí, lanza T-012"*.

## Agentes invocados
1. **Agente Backend** — inspección de la API real y adaptador.
2. **Agente QA** — tests con fixtures reales + ingesta extremo a extremo contra MySQL.
3. **Agente Documentador** — sincronización del Vault, incluida una corrección de S003.

---

## Inspección previa: cuatro cosas que la API hace y no esperábamos

Antes de escribir una línea se muestreó `cardsets.php` y `cardinfo.php` reales. Cuatro hallazgos,
tres de ellos con capacidad de destruir datos:

**1. `card_sets` no está filtrado por el set consultado.** Al pedir `?cardset=Supreme Darkness`, cada
carta llega con **todas** sus impresiones en **todos** los sets. Sin filtrar por `set_name`, ingestar
un set contaminaría a los demás con impresiones que no le pertenecen.

**2. `set_code` se repite dentro del mismo set.** 24 duplicados en *Supreme Darkness*: la misma carta,
el mismo `SUDA-EN049`, dos rarezas.

**3. `set_code` se repite entre sets.** 1032 sets pero sólo 644 códigos únicos. `JUMP` lo comparten
**70 sets**.

**4. `def` es `null` en monstruos Link**, no `0` ni `"?"`. Un tercer caso distinto de los ya conocidos.

Los puntos 2 y 3 quedaron registrados como **P-013**; el 1 explica además un error que arrastrábamos
en la documentación (ver abajo).

---

## Corrección de un dato mal registrado en S003

En S003 se escribió que las rarezas corruptas (`"2"`, `"3"`, `"PLatinum Secret Rare"`) procedían del
set *Supreme Darkness*. **Es inexacto.** Aquel muestreo contó rarezas sobre todo el `card_sets` sin
filtrar por set, precisamente por desconocer el hallazgo 1.

Procedencia real:

| Valor | Set real |
|---|---|
| `"2"`, `"3"` | *Legendary Modern Decks 2026*, *Legendary Arc-V Decks* |
| `"PLatinum Secret Rare"` | *Rarity Collection 5* |

*Supreme Darkness*, filtrado correctamente, está limpio: 5 rarezas, todas válidas. **La basura es
real y P-007 seguía siendo válido**; sólo estaba mal atribuida. Corregido en el registro de problemas.

---

## Decisiones de diseño

| Decisión | Motivo |
|---|---|
| `sets.externalId` = `set_name` | `set_code` colapsaría 70 sets en uno |
| `card_prints.externalId` = `{set_code}::{rarityCode}` | `set_code` solo pierde 24 impresiones por set |
| `cards.oracleKey` = `id` numérico | YGOPRODeck sí expone identidad conceptual; no hay que derivarla del nombre |
| Acabado derivado de la rareza | En Yu-Gi-Oh! el foil **es** la rareza; no existe la versión no-foil de una Secret Rare |
| HTTP 400 → aviso, no error | La API responde 400 (no 404 ni 200 vacío) para sets sin cartas. Es legítimo en sets promocionales |

---

## Verificación

### Tests — 18 nuevos (56 en total, todos verdes)
Fixtures copiadas de respuestas reales, defectos incluidos: el `A Bao A Qu` con doble rareza, el
Slifer con `atk: "?"`, el monstruo Link con `def: null`, la errata `PLatinum` y el literal `"2"`.

Un test comprueba explícitamente que **ninguna impresión expone conceptos crudos** de YGOPRODeck:
la frontera de ADR-003 se verifica, no se confía.

### Contra la API real
| Medición | Resultado |
|---|---|
| Sets ingestables | **1032**, con 1032 `externalId` únicos (y sólo 644 códigos) |
| Impresiones de *Supreme Darkness* | **125**, de **101** cartas conceptuales |
| Colisiones de `externalId` | **0** |
| Avisos emitidos | **0** |

### Ingesta real contra MySQL 8.0.42
Las 125 impresiones se insertaron en una instancia temporal con las tres migraciones aplicadas.
**Cero errores.**

| Comprobación | Resultado |
|---|---|
| `SUDA-EN049` | 2 filas, mismo `oracle_key`, rarezas distintas — la colisión no ocurre |
| Columnas generadas | 64 cartas con `atk`, 61 con `def` |
| Monstruos Link | 3, los **3** con `def IS NULL` — y 64 − 61 = 3 cuadra exactamente |
| Pool del motor de sobres | 50 common / 26 super / 25 QCSR / 14 ultra / 10 secret |
| `EXPLAIN` del pool | **`idx_prints_pool`, `Using index`** — covering, con datos reales |
| FULLTEXT sobre texto real | Devuelve resultados correctos |

Ese `EXPLAIN` cierra un cabo suelto de S002: allí el optimizador ignoró el índice porque la tabla
tenía **una sola fila**, y quedó demostrado sólo con `FORCE INDEX`. Con 125 filas reales lo elige solo.

---

## Un fallo de tipos que los tests no vieron

`tsc --build` rechazó `stripUndefined` con dos errores que **la suite en verde no detectó**, porque
vitest no hace typecheck. El segundo fue instructivo: `exactOptionalPropertyTypes: true` distingue
"clave ausente" de "clave presente con valor `undefined`", así que un objeto construido con
`toJsonNumber(...)` no era asignable a un tipo con propiedades opcionales.

La firma pasó a usar un tipo mapeado homomórfico que admite `undefined` en la entrada — que es justo
lo que la función elimina. Es la distinción que el proyecto necesita: la diferencia entre *no tener
ATK* y *tener ATK indefinido* es exactamente la que rompía el INSERT.

---

## Problemas
- **P-007 CERRADO** (rarezas corruptas), con la procedencia corregida.
- **P-013 abierto y cerrado**: las dos colisiones de `set_code`. Tercer caso de la misma familia
  que P-010: una clave natural que *parece* única, un `ON DUPLICATE KEY UPDATE`, y datos que
  desaparecen sin un error en los logs. **Antes de elegir una clave natural, contarla.**

---

## Estado al cerrar
- H0: falta Docker · H1 ✅ · **H2: 1 de 3 conectores en pie y probado extremo a extremo.**
- Tareas: 18 realizadas · 8 pendientes · 1 bloqueada.
- Tests: **56/56** · `tsc --build` limpio · `npm audit` limpio.

## Siguiente acción esperada
T-011 (Scryfall, streaming del bulk) y T-013 (Pokémon, cuota diaria) siguen desbloqueadas e
independientes entre sí.
