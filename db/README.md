# Base de datos — ProyectoTCG

**Requisito duro:** MySQL **>= 8.0.17**. No es una preferencia: el esquema usa índices
multivaluados sobre JSON (8.0.17+), `CHECK` constraints (8.0.16+) y `DEFAULT` con expresión
(8.0.13+). En versiones anteriores la migración falla.

Verificado contra **MySQL 8.0.42** el 2026-08-25.

## Aplicar

Ejecutar **en orden**:

```bash
mysql -u root -p < db/migrations/0001_initial_schema.up.sql && mysql -u root -p < db/migrations/0002_seed_games_rarities.sql && mysql -u root -p < db/migrations/0003_seed_pack_templates.sql && mysql -u root -p < db/migrations/0004_add_in_boosters.up.sql
```

Los seeds (0002 y 0003) son **idempotentes**: re-ejecutarlos no duplica nada.

## Revertir

```bash
mysql -u root -p < db/migrations/0001_initial_schema.down.sql
```

## Convenciones del esquema

- **Motor:** InnoDB · **Charset:** `utf8mb4` · **Collation:** `utf8mb4_0900_ai_ci`
  (accent-insensitive: buscar `pokemon` encuentra `Pokémon`).
- **Nomenclatura:** `uq_` unique · `idx_` índice · `fk_` clave foránea · `ck_` check ·
  `ftx_` fulltext.
- **`games.id` no es AUTO_INCREMENT**: 1=MTG, 2=YGO, 3=PTCG son constantes del dominio
  referenciadas desde el código.
- **Nada de `ORDER BY RAND()`** en el motor de sobres: el pool `(set_id, rarity_id)` se precarga
  en Redis y se indexa con el PRNG. El índice `idx_prints_pool` es covering para esa consulta.

## Dos trampas de MySQL 8 que este esquema ya sortea

1. **Columnas generadas desde JSON con valores no numéricos.** Yu-Gi-Oh! trae `"atk": "?"` en
   cartas de ATK variable. Un `CAST` directo aborta el INSERT en modo estricto. Todas las
   generadas numéricas llevan una guarda `JSON_TYPE(...) IN ('INTEGER','DOUBLE','DECIMAL')`.

2. **FK `ON DELETE CASCADE` sobre columna base de una generada `STORED`.** MySQL la rechaza con
   error 1215. Por eso `pack_templates.set_key` y `default_guard` son **VIRTUAL** y no STORED.

## Migraciones

| Fichero | Contenido | Estado |
|---|---|---|
| `0001_initial_schema.up.sql` | 13 tablas, 20 FK, 8 CHECK | ✅ verificada |
| `0001_initial_schema.down.sql` | rollback | ✅ verificada |
| `0002_seed_games_rarities.sql` | 3 juegos, 66 rarezas | ✅ verificada, idempotente |
| `0003_seed_pack_templates.sql` | 3 plantillas, 33 slots | ✅ verificada, idempotente |
| `0004_add_in_boosters.{up,down}.sql` | `in_boosters` + índice del pool rehecho | ✅ verificada (ciclo up/down/up) |
| `0005_widen_set_external_id.{up,down}.sql` | `sets.external_id` → VARCHAR(255) (P-017) | ✅ verificada |
| `0006_ygo_modern_booster.{up,down}.sql` | Plantilla de sobre YGO vigente desde 2020 + QCSR (P-019) | ✅ verificada con 2.000 sobres |

## Cómo se aplican (desde S011)

Existe un migrador propio en `apps/api/src/db/migrator.ts` (ADR-006). Lleva el registro en la tabla
`schema_migrations`, aplica en orden alfabético y **nunca reaplica** lo ya hecho. Los `.down.sql`
son manuales a propósito: deshacer en producción debe ser una decisión consciente.

**Requisito previo:** la base de datos debe existir antes de migrar (la `0001` la crea, pero el
driver necesita conectarse a algo). Hoy ese paso es manual → **T-022**.

> **Las migraciones publicadas son inmutables.** Todo cambio de esquema es una migración nueva.
> El rollback de la 0004 **pierde el valor de `in_boosters`**: tras deshacerla y rehacerla hay que
> re-ingestar MTG. Está avisado en su `.down.sql`.

## Tercera trampa: longitud de `rarities.code`

`code` es **VARCHAR(48)**, no 32. Yu-Gi-Oh! tiene rarezas como
`duel_terminal_normal_parallel_rare` (34 caracteres) que desbordaban la columna con error 1406.

## Ajustar la fidelidad de un sobre

No requiere desplegar. Es un `UPDATE` sobre `pack_slots.distribution`:

```sql
UPDATE pack_slots SET distribution = '[{"rarity":"rare","weight":800},{"rarity":"mythic","weight":200}]'
WHERE pack_template_id = 1 AND slot_index = 10;
```

Los pesos son enteros por mil. No hace falta que sumen 1000 (el motor normaliza), pero se
mantienen así por legibilidad. Cada valor sembrado lleva anotado en el SQL si es `[OFICIAL]`,
`[DERIVADO]` (con el cálculo) o `[ESTIMADO]`.
