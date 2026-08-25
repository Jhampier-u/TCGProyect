# S011 — ADR-006 resuelta y orquestador de ingesta
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"ADR-006 y luego el orquestador"*.

## Agentes invocados
1. **Agente Arquitectura** — cierre de ADR-006.
2. **Agente Base de Datos** — `Database`, `Migrator`, `CatalogRepository`.
3. **Agente Backend** — `IngestService`.
4. **Agente QA** — verificación extremo a extremo contra MySQL real.
5. **Agente Documentador** — Vault.

---

## ADR-006 — `mysql2` + SQL plano + migrador propio

**Sin ORM y sin *query builder*.** También se descartaron Kysely y Drizzle, que se habían barajado.

Tres razones, todas apoyadas en lo aprendido entre S002 y S010:

1. **Ningún ORM modela este esquema.** Columnas generadas (`STORED` y `VIRTUAL`), índice
   multivaluado sobre JSON, `FULLTEXT`, `CHECK`. Cualquiera acabaría tratando el DDL como SQL plano
   igualmente, así que sólo aportaría una capa que hay que puentear.
2. **Las consultas son pocas y muy específicas**, y varias dependen de que el plan use un índice
   concreto — algo que se verifica leyendo el `EXPLAIN` del SQL que uno escribe, no del que genera
   una librería.
3. **El migrador son ~100 líneas.** Menos que integrar y configurar `umzug` o `dbmate`, sin
   dependencia nueva, y entendible por completo el día que falle.

`mysql2`: **0 vulnerabilidades**.

---

## Lo construido

| Pieza | Qué hace |
|---|---|
| `Database` | Pool `mysql2` con `multipleStatements` acotado a migrador y repositorios |
| `Migrator` | Tabla `schema_migrations`, orden alfabético, nunca reaplica, ignora los `.down.sql` |
| `CatalogRepository` | Upserts **por lotes** de 500, mapa de rarezas cacheado, checkpoint y cola de imágenes |
| `IngestService` | Orquestador: sets → pendientes → volcado o incremental → marcar |

### Dos detalles de rendimiento que importan

**Lotes de 500.** Insertar 116.752 impresiones de una en una son 116.752 idas y vueltas; en lotes
son 234.

**El mapa de rarezas se precarga.** La primera versión resolvía la rareza con un `INSERT ... SELECT
FROM rarities` por fila, lo que anulaba el propósito del lote — volvía a ser una sentencia por
impresión. Las rarezas son 66 en total: caben en un `Map` y el lote vuelve a ser un solo `INSERT`.

### Y dos garantías que el orquestador hace cumplir

**Marcar al final, nunca antes.** `sets.ingested_at` se escribe cuando el set está entero. Al revés,
un fallo a mitad dejaría el set como completo con la mitad de las cartas, y nadie volvería a mirarlo.

**Un set que falla no aborta la ejecución.** Queda sin marcar, se registra el motivo y se sigue. Con
la API de Pokémon fallando el ~70 % de las veces (P-016), lo contrario significaría que un solo set
promocional roto impide ingestar el catálogo entero.

---

## El bug que sólo aparece a escala (P-017)

La **primera ejecución del orquestador real** falló así:

```
Data too long for column 'external_id' at row 253
```

`sets.external_id` era `VARCHAR(64)`. Para Yu-Gi-Oh! la clave natural de un set es su **nombre**
(decisión de T-012, P-013), y **16 de los 1032 sets** lo superan. El más largo, 85 caracteres:

> *"Trials of the Pharaoh - Match of the Millennium & Twisted Nightmares promotional card"*

**No se perdían 16 sets: no entraba ninguno.** El upsert por lotes es una sola sentencia, así que
el error abortaba el `INSERT` completo y con él la ingesta del juego entero.

**Por qué no apareció antes.** Las verificaciones de S006 a S010 insertaban **un set cada vez**,
elegido a mano. Ninguna ejercitó el upsert del catálogo completo. Es el quinto problema de
longitud/unicidad de clave del proyecto (P-009, P-010, P-013, P-015 y éste) y **el primero que sólo
se manifiesta a escala**.

Corregido con la migración `0005` (`VARCHAR(255)`; el máximo real es 85). `sets.name` se deja en
160 porque su margen ya bastaba: se amplía sólo lo que rompió.

---

## Verificación extremo a extremo

Migrador propio → orquestador → 3 adaptadores reales → cosecha de imágenes, todo contra un MySQL
8.0.42 real:

| Fase | Resultado |
|---|---|
| **Migrador** | 5 migraciones aplicadas · segunda ejecución: 0 aplicadas, 5 ya estaban ✅ |
| **MTG** (volcado) | 1048 sets descubiertos · 2 procesados · 22 impresiones · 13,7 s |
| **YGO** (incremental) | 1032 sets · 2 procesados · 272 impresiones · 1,7 s |
| **PTCG** (incremental) | 174 sets · 1 procesado · 120 impresiones · **92,4 s** (P-016) |
| **Reanudabilidad** | Segunda pasada de YGO: **2 sets nuevos**, no repitió los anteriores ✅ |
| **Imágenes** | 591 pendientes detectadas · 6 cosechadas · 78,1 % de reducción |

Estado final de la base de datos:

| Juego | Sets ingestados | Cartas | Impresiones |
|---|---|---|---|
| MTG | 2 / 1048 | 8 | 22 |
| YGO | 4 / 1032 | 261 | 449 |
| PTCG | 1 / 174 | 120 | 120 |

Columnas generadas, otra vez la diagonal: MTG `cmc=8`, YGO `atk=187`, PTCG `hp=97`.

### Un resultado que parecía un bug y no lo era
El pool de sobres de MTG salía **0** pese a tener 22 impresiones. Investigado: los dos sets que el
orquestador eligió son *The Zeta Set* y *Stardates*, productos donde el **100 %** de las cartas tiene
`booster: false`. El pool vacío es la respuesta correcta — es **P-014 funcionando**.

---

## Observaciones registradas como tareas

- **T-022.** La base de datos tiene que existir antes de migrar (la `0001` la crea, pero el driver
  necesita conectarse a algo). Hoy ese paso previo es manual; hace falta un guion `db:migrate`.
- **T-023.** `findPendingSets` ordena por `released_at DESC`, así que una ejecución acotada procesa
  primero sets **futuros** y promocionales en vez de los jugables. Correcto para sincronización
  incremental, discutible para la carga inicial.

---

## Estado al cerrar
- **H1 ✅ · H2 ✅** · H0 sólo necesita Docker (T-004). **Los seis ADR están cerrados.**
- Tareas: **32 realizadas · 5 pendientes · 1 bloqueada**.
- Problemas: **4 abiertos · 12 cerrados**.
- Tests: **134/134** · `tsc --build` limpio · `npm audit` limpio.

## Siguiente acción esperada
La maquinaria de ingesta está completa y probada. El camino natural es **H4 (motor de sobres)**, que
ya tiene todo lo que necesita, o **T-004 (Docker)** para cerrar H0 y poder levantar el entorno de una
sola orden.
