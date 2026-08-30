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
| `0007_image_failures` | `card_prints.image_failed_at`: una URL rota deja de reintentarse (T-019) | ✅ |
| `0008_set_icons` | `sets.icon_local_path` (T-035) | ✅ |
| `0009_template_eras` | `valid_from`/`valid_to`: la ventana de vigencia de una plantilla (T-034) | ✅ |
| `0010`–`0012` | Las épocas antiguas de Yu-Gi-Oh! y de Pokémon | ✅ |
| `0013_set_is_openable` | `sets.is_openable`: qué set es de verdad un producto de sobres (T-069) | ✅ |
| `0014_ptcg_swsh_y_huecos` | Era Sword & Shield y dos huecos de Scarlet & Violet (T-074) | ✅ |
| `0015_widen_cmc` | `cmc` → DECIMAL(9,1). Los Un-sets tienen coste 1.000.000 (P-039) | ✅ |
| `0016`–`0019` | Insertos de Magic, paralelas de YGO en las cuatro épocas, épocas históricas de Pokémon, densidad de Black Bolt / White Flare | ✅ |
| `0020`–`0023` | `product_line` y las seis líneas de Yu-Gi-Oh!, más su cola larga (T-080, T-082) | ✅ |
| `0024_impresiones_retiradas` | `card_prints.withdrawn_at`: retirar sin borrar lo que una apertura referencia (P-040) | ✅ verificada contra la base real |
| `0025_mtg_epocas_de_sobre` | Las cuatro épocas del sobre de Magic (T-084) | ✅ rollback probado con aperturas encima |
| `0026_the_list_y_slot_de_tierra` | `pack_slots.card_filter` y las entradas `{"set":...}` (T-085) | ✅ rollback probado |
| `0027_ptcg_facetas` | Columnas generadas e índices para tipo, categoría y marca de regulación de Pokémon (T-091) | ✅ rollback ejecutado y reaplicado |

> Esta tabla es un índice, no la fuente de verdad. **La cabecera de cada migración lleva su
> razonamiento completo** —qué se midió, de dónde sale cada peso, qué se descartó y por qué—, y es
> donde hay que mirar. La tabla se quedó parada en la `0006` durante veinte migraciones justamente
> porque duplicaba algo que ya estaba escrito en otro sitio.

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
