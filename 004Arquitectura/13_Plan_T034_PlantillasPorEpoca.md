# 13 — Plan de implementación · T-034: plantillas de sobre por época

> **Spec:** `12_Spec_T034_PlantillasPorEpoca.md` · **Sesión:** S028 · **Fecha:** 2026-08-26

**Objetivo:** que todo Core Booster de Yu-Gi-Oh! sea completable al 100 %, y que exista una
comprobación que lo mida — hoy no hay ninguna.

**Arquitectura:** la época es una propiedad de la plantilla (`valid_from` / `valid_to`), no del set.
`findTemplate` resuelve por `sets.released_at`, así que no hace falta ningún paso de asignación
posterior a la ingesta. El motor de sobres no se toca: el problema siempre fue de datos (ADR-005).

**Stack:** MySQL 8 + `mysql2` con SQL plano · TypeScript estricto · Vitest.

---

## Ficheros

| Fichero | Qué hace |
|---|---|
| `db/migrations/0009_template_eras.{up,down}.sql` | **crear** — las dos columnas de ventana |
| `db/migrations/0010_ygo_era_templates.{up,down}.sql` | **crear** — las tres plantillas antiguas |
| `db/migrations/0011_ygo_modern_gaps.{up,down}.sql` | **crear** — starlight y grand master en la moderna, y sembrar bien `grand_master_rare` |
| `apps/api/src/db/pack-repository.ts` | **modificar** — precedencia en `findTemplate` |
| `apps/api/src/packs/coverage.ts` | **crear** — `rarezasInalcanzables`, función pura |
| `apps/api/src/packs/coverage.test.ts` | **crear** |
| `apps/api/src/packs/index.ts` | **modificar** — exportar |
| `apps/api/src/db/template-eras.test.ts` | **crear** — solapes y rarezas, leyendo los ficheros de migración |
| `apps/api/src/cli/coverage.ts` | **crear** — el informe contra la base real |
| `package.json` | **modificar** — script `packs:cobertura` |

**Orden:** 1 → 2 → 3 → 4 → 5 → 6 → 7. La 2 depende de la 1 (columnas). La 5 depende de la 4
(la función que el informe ejecuta). Las 3 y 6 son independientes entre sí.

---

## Tarea 1 — La migración de esquema

**Ficheros:** crear `db/migrations/0009_template_eras.up.sql` y `.down.sql`

- [ ] **Paso 1: escribir la migración**

`0009_template_eras.up.sql`:

```sql
-- =====================================================================
-- ProyectoTCG - Migracion 0009 - Ventana de vigencia de una plantilla
-- Agente: Base de Datos - Tarea: T-034 - Sesion: S028
-- =====================================================================
-- POR QUE
--
-- La estructura de un sobre de Yu-Gi-Oh! ha cambiado cuatro veces desde 2002.
-- Una sola plantilla por juego no puede describir 2002 y 2026 a la vez, y hoy
-- describe solo la ultima: los sets antiguos topan su completitud en el 70,7%
-- (P-021).
--
-- POR QUE UNA VENTANA Y NO UNA PLANTILLA POR SET
--
-- `pack_templates.set_id` ya existe y permite una plantilla propia por set. Esa
-- era la solucion apuntada en S015, y es la razon por la que T-034 lleva trece
-- sesiones parada: exige un paso de asignacion POSTERIOR a la ingesta -- miles
-- de filas, y hay que repetirlo cada vez que aparece un set.
--
-- La epoca no es una propiedad del set: es una propiedad de la PLANTILLA, que
-- vale para un rango de fechas. Poniendola aqui, la resolucion la hace la misma
-- consulta que ya elegia plantilla y el paso de asignacion desaparece.
--
-- NULL EN CUALQUIERA DE LAS DOS = SIN LIMITE POR ESE LADO
--
-- La epoca mas antigua lleva `valid_from` nulo para cubrir tambien los promos
-- anteriores a 2002. Una plantilla con las DOS a nulo no es de epoca: es la
-- generica del juego, que sigue siendo el ultimo respaldo.
--
-- NO LLEVA `USE`: ver la cabecera de la 0007 (P-032).
-- =====================================================================

ALTER TABLE pack_templates
  ADD COLUMN valid_from DATE NULL DEFAULT NULL AFTER set_id,
  ADD COLUMN valid_to   DATE NULL DEFAULT NULL AFTER valid_from;

-- No se anade indice. `pack_templates` tiene una decena de filas: cualquier
-- plan es un recorrido, y un indice sobre una tabla asi solo anade
-- mantenimiento. Se revisa si alguna vez crece.
```

`0009_template_eras.down.sql`:

```sql
-- =====================================================================
-- ProyectoTCG - Migracion 0009 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- La ventana de vigencia. Las plantillas de epoca que la 0010 inserta dejarian
-- de poder distinguirse de la generica, asi que esta migracion NO se puede
-- deshacer sin deshacer antes la 0010 y la 0011.
-- =====================================================================

ALTER TABLE pack_templates
  DROP COLUMN valid_to,
  DROP COLUMN valid_from;
```

- [ ] **Paso 2: aplicar y comprobar**

```bash
npm run db:migrate
```

Esperado: `Migraciones aplicadas: 0009_template_eras.up.sql`

```bash
docker compose exec -T mysql mysql -uroot -proot proyecto_tcg -e "SHOW COLUMNS FROM pack_templates LIKE 'valid%';"
```

Esperado: dos filas, `valid_from` y `valid_to`, ambas `date` / `YES` / `NULL`.

- [ ] **Paso 3: commit**

```bash
git add db/migrations/0009_template_eras.up.sql db/migrations/0009_template_eras.down.sql
git commit -m "feat(db): add a validity window to pack templates (0009, T-034)"
```

---

## Tarea 2 — La precedencia en `findTemplate`

**Ficheros:** modificar `apps/api/src/db/pack-repository.ts`

- [ ] **Paso 1: sustituir la consulta**

El bloque actual, en `findTemplate`, es:

```ts
      `SELECT t.id, t.game_id, t.name, t.card_count
       FROM pack_templates t
       JOIN sets s ON s.game_id = t.game_id AND s.id = ?
       WHERE (t.set_id = s.id OR t.set_id IS NULL) AND t.is_default = 1
       ORDER BY (t.set_id IS NULL) ASC
       LIMIT 1`,
```

Se sustituye por:

```ts
      `SELECT t.id, t.game_id, t.name, t.card_count
       FROM pack_templates t
       JOIN sets s ON s.game_id = t.game_id AND s.id = ?
       WHERE
             (t.set_id = s.id AND t.is_default = 1)
          OR (t.set_id IS NULL
              AND (t.valid_from IS NOT NULL OR t.valid_to IS NOT NULL)
              AND s.released_at IS NOT NULL
              AND (t.valid_from IS NULL OR s.released_at >= t.valid_from)
              AND (t.valid_to   IS NULL OR s.released_at <= t.valid_to))
          OR (t.set_id IS NULL AND t.is_default = 1
              AND t.valid_from IS NULL AND t.valid_to IS NULL)
       ORDER BY CASE
                  WHEN t.set_id = s.id THEN 1
                  WHEN t.valid_from IS NOT NULL OR t.valid_to IS NOT NULL THEN 2
                  ELSE 3
                END
       LIMIT 1`,
```

Y el comentario de la función pasa a:

```ts
  /**
   * Plantilla del set, con dos respaldos.
   *
   * Precedencia, de mas especifica a menos:
   *   1. La propia del set (`set_id`)
   *   2. La de la EPOCA cuya ventana contiene `sets.released_at` (T-034)
   *   3. La generica del juego
   *
   * Un `CASE` explicito y no un `ORDER BY (x IS NULL)`: con tres niveles, el
   * truco de ordenar por un booleano deja de leerse solo.
   *
   * Un set sin `released_at` cae al nivel 3, que es lo correcto: sin fecha no
   * hay epoca. Y una plantilla de epoca lleva `is_default = 0` a proposito --
   * `uq_templates_one_default` solo admite una por (juego, set), asi que
   * marcarlas por defecto haria que la segunda no se pudiera insertar.
   */
```

- [ ] **Paso 2: compilar**

```bash
npm run build
```

Esperado: sin salida.

- [ ] **Paso 3: comprobar la precedencia contra la base real**

**A traves del repositorio, no reescribiendo su consulta.** Copiar el SQL a mano en el comando de
comprobacion probaria la copia, no el codigo: la copia puede quedar bien mientras el original se
rompe. Se llama a `findTemplate`, que es lo que corre en produccion.

Guardar en el scratchpad como `precedencia.mjs`:

```js
import { Database, PackRepositoryMysql } from 'file:///C:/TCGProyect/apps/api/dist/db/index.js';
const db = new Database({ url: process.env.DATABASE_URL });
const repo = new PackRepositoryMysql(db);
for (const code of ['LOB', 'TDGS', 'BOSH', 'ETCO', 'MAMO']) {
  const [row] = await db.select('SELECT id, released_at FROM sets WHERE game_id=2 AND code=? LIMIT 1', [code]);
  const t = await repo.findTemplate(Number(row.id));
  console.log(code.padEnd(6), String(row.released_at).slice(0, 10), '->', t?.name ?? 'SIN PLANTILLA');
}
await db.close();
```

```bash
node "$SCRATCHPAD/precedencia.mjs"
```

Esperado **en este punto**, antes de la 0010: los cinco con `Core Booster (Eternity Code en
adelante)`. Es la comprobacion de que el cambio de consulta no altera nada por si solo.

- [ ] **Paso 4: commit**

```bash
git add apps/api/src/db/pack-repository.ts
git commit -m "feat(packs): resolve the template by era before the game default (T-034)"
```

---

## Tarea 3 — Las tres plantillas antiguas

**Ficheros:** crear `db/migrations/0010_ygo_era_templates.{up,down}.sql`

- [ ] **Paso 1: escribir la migración**

`0010_ygo_era_templates.up.sql`:

```sql
-- =====================================================================
-- ProyectoTCG - Migracion 0010 - Las tres epocas antiguas de Yu-Gi-Oh!
-- Agente: Base de Datos - Tarea: T-034 - Sesion: S028
-- CORRIGE P-021
-- =====================================================================
-- LA TABLA DE COMPOSICION POR EPOCA (Yugipedia)
--
-- Ya estaba capturada en la cabecera de la 0006. Los cortes se han verificado
-- contra las fechas del catalogo: LOB 2002-03-08, TDGS 2008-09-02,
-- BOSH 2016-01-14, ETCO 2020-04-30.
--
--   EPOCA 1  ... 2008-09-01   8 comunes + 1 (Secret 1/24, Ultra 1/12,
--                                            Super 1/4, resto RARE)
--   EPOCA 2  2008-09-02 .. 2016-01-13
--                             7 comunes + 1 RARE + 1 (Secret 1/24, Ultra 1/12,
--                                            Super 1/4, resto Common)
--   EPOCA 3  2016-01-14 .. 2020-04-29
--                             7 comunes + 1 RARE + 1 (Secret 1/12, Ultra 1/6,
--                                            resto Super)
--   EPOCA 4  2020-04-30 ..    es la generica del juego, no se toca aqui
--
-- La epoca 1 lleva `valid_from` nulo para cubrir tambien los promos anteriores
-- a 2002 (SDY 2001-01-01 en el catalogo).
--
-- LAS RAREZAS QUE LA TABLA OFICIAL NO MENCIONA
--
-- Yugipedia documenta los slots, no cada rareza que un set puede traer. Medido
-- sobre el catalogo, quedaban fuera: short_print y super_short_print (LOB, BOSH)
-- y las paralelas ultimate_rare y ghost_rare (TDGS). Una rareza que ninguna slot
-- nombra es INALCANZABLE: el respaldo del motor solo actua cuando la rareza
-- PEDIDA esta vacia, nunca anade una que no se haya pedido.
--
-- Entran en el slot que les toca por naturaleza. Los short prints son Comunes
-- impresas en menor cantidad, no un slot aparte, asi que van con las comunes;
-- las paralelas sustituyen ocasionalmente a la carta del slot superior, asi que
-- van en el hit.
--
-- SUS PESOS SON [ESTIMADO]. No hay tasa publicada para ninguna de las cuatro.
-- Se eligen para que la rareza sea alcanzable sin deformar el slot, y van
-- marcados uno a uno abajo. Es exactamente lo que se hizo con la QCSR en la
-- 0006 y por el mismo motivo: ADR-005 hizo esto configurable por datos para que
-- afinar la fidelidad sea un UPDATE, no un despliegue.
--
-- LAS APERTURAS YA REALIZADAS NO SE VEN AFECTADAS: `pack_openings` guarda
-- `template_snapshot` y la reproduccion lee `pack_opening_cards` (P-005).
--
-- NO LLEVA `USE`: ver la cabecera de la 0007 (P-032).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Las tres plantillas. `is_default = 0` a proposito: el indice
-- `uq_templates_one_default` solo admite una por (juego, set), y la generica ya
-- la ocupa. Se eligen por ventana, no por bandera.
-- ---------------------------------------------------------------------
INSERT INTO pack_templates (game_id, set_id, valid_from, valid_to, name, card_count, is_default) VALUES
  (2, NULL, NULL,         '2008-09-01', 'Core Booster (hasta Light of Destruction)', 9, 0),
  (2, NULL, '2008-09-02', '2016-01-13', 'Core Booster (Duelist Genesis - Dimension of Chaos)', 9, 0),
  (2, NULL, '2016-01-14', '2020-04-29', 'Core Booster (Breakers of Shadow - Ignition Assault)', 9, 0);

-- ---------------------------------------------------------------------
-- EPOCA 1: 8 comunes + 1 hit.
--
-- Comunes [ESTIMADO en la reparticion interna]:
--     common             900
--     short_print         90   (~1 de cada 11 comunes)
--     super_short_print   10   (~1 de cada 100)
--   El slot sigue siendo "una comun": lo estimado es COMO se reparte por dentro.
--   En un set sin short prints, el respaldo del motor entrega una common, que es
--   justo lo correcto.
--
-- Hit [OFICIAL, Yugipedia]:
--     Secret 1/24 =  42
--     Ultra  1/12 =  83
--     Super  1/4  = 250
--     resto Rare  = 625
--     -------------------
--                   1000
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"common","weight":900},{"rarity":"short_print","weight":90},{"rarity":"super_short_print","weight":10}]',
       0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_to = '2008-09-01') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 8,
       '[{"rarity":"rare","weight":625},{"rarity":"super_rare","weight":250},{"rarity":"ultra_rare","weight":83},{"rarity":"secret_rare","weight":42}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_to = '2008-09-01') AS t;

-- ---------------------------------------------------------------------
-- EPOCA 2: 7 comunes + 1 Rare + 1 hit.
--
-- Comunes [ESTIMADO en la reparticion interna]: common 950 / short_print 50.
--
-- Hit: base [OFICIAL] Secret 42, Ultra 83, Super 250, resto Common 625.
--   A eso se anaden [ESTIMADO] las paralelas de la epoca:
--     ultimate_rare  42   (~1 por caja de 24)
--     ghost_rare      3   (~1 por caja de 12 cajas)
--   Total estimado 45, y los oficiales se reescalan por (1000-45)/1000 = 0,955
--   para que el slot siga sumando 1000:
--     secret 42*0,955 =  40
--     ultra  83*0,955 =  79
--     super 250*0,955 = 239
--     common 625*0,955= 597
--     -----------------------
--     40+79+239+597+42+3 = 1000
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"common","weight":950},{"rarity":"short_print","weight":50}]',
       0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2008-09-02') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 7, '[{"rarity":"rare","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2008-09-02') AS t;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 8,
       '[{"rarity":"common","weight":597},{"rarity":"super_rare","weight":239},{"rarity":"ultra_rare","weight":79},{"rarity":"ultimate_rare","weight":42},{"rarity":"secret_rare","weight":40},{"rarity":"ghost_rare","weight":3}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2008-09-02') AS t;

-- ---------------------------------------------------------------------
-- EPOCA 3: 7 comunes + 1 Rare + 1 hit.
--
-- Comunes [ESTIMADO en la reparticion interna]: common 950 / short_print 50.
--
-- Hit: base [OFICIAL] Secret 1/12 = 83, Ultra 1/6 = 167, resto Super = 750.
--   La Starlight Rare aparecio con Ignition Assault (2020-01-30), que cae DENTRO
--   de esta epoca, asi que entra aqui tambien:
--     starlight_rare  3   [ESTIMADO] ~1 por caja de 12 cajas
--   Reescalado por (1000-3)/1000 = 0,997:
--     secret  83*0,997 =  83
--     ultra  167*0,997 = 166
--     super  750*0,997 = 748
--     -----------------------
--     83+166+748+3 = 1000
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"common","weight":950},{"rarity":"short_print","weight":50}]',
       0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2016-01-14') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 7, '[{"rarity":"rare","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2016-01-14') AS t;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 8,
       '[{"rarity":"super_rare","weight":748},{"rarity":"ultra_rare","weight":166},{"rarity":"secret_rare","weight":83},{"rarity":"starlight_rare","weight":3}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2016-01-14') AS t;
```

`0010_ygo_era_templates.down.sql`:

```sql
-- =====================================================================
-- ProyectoTCG - Migracion 0010 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- Las tres plantillas de epoca. Todos los sets de Yu-Gi-Oh! vuelven a resolver
-- a la generica, y con ella los sets anteriores a 2020 vuelven a topar su
-- completitud en el 70-76% (P-021).
--
-- No se pierde ninguna apertura: `pack_openings` guarda su propio
-- `template_snapshot` y no tiene clave foranea hacia `pack_slots` (P-005).
-- =====================================================================

DELETE FROM pack_slots
 WHERE pack_template_id IN (
   SELECT id FROM (
     SELECT id FROM pack_templates
      WHERE game_id = 2 AND (valid_from IS NOT NULL OR valid_to IS NOT NULL)
   ) AS t
 );

DELETE FROM pack_templates
 WHERE game_id = 2 AND (valid_from IS NOT NULL OR valid_to IS NOT NULL);
```

- [ ] **Paso 2: aplicar**

```bash
npm run db:migrate
```

Esperado: `Migraciones aplicadas: 0010_ygo_era_templates.up.sql`

- [ ] **Paso 3: comprobar que cada set resuelve a su época**

El mismo script de la tarea 2, sin tocar:

```bash
node "$SCRATCHPAD/precedencia.mjs"
```

Esperado **ahora**:

```
LOB    2002-03-08 -> Core Booster (hasta Light of Destruction)
TDGS   2008-09-02 -> Core Booster (Duelist Genesis - Dimension of Chaos)
BOSH   2016-01-14 -> Core Booster (Breakers of Shadow - Ignition Assault)
ETCO   2020-04-30 -> Core Booster (Eternity Code en adelante)
MAMO   2026-09-04 -> Core Booster (Eternity Code en adelante)
```

Las tres fechas de corte se comprueban **en su dia exacto**: TDGS y BOSH salen el primer dia de su
epoca y ETCO el primer dia de la generica. Un error de un dia en cualquier ventana se ve aqui.

- [ ] **Paso 4: commit**

```bash
git add db/migrations/0010_ygo_era_templates.up.sql db/migrations/0010_ygo_era_templates.down.sql
git commit -m "feat(packs): add the three pre-2020 YGO era templates (0010, T-034)"
```

---

## Tarea 4 — La función que mide el techo

**Ficheros:** crear `apps/api/src/packs/coverage.ts` y `coverage.test.ts`; modificar `index.ts`

- [ ] **Paso 1: escribir el test primero**

`apps/api/src/packs/coverage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rarezasInalcanzables } from './coverage.js';
import type { SlotConfig } from './types.js';

function slot(rarezas: string[]): SlotConfig {
  return {
    slotIndex: 0,
    distribution: rarezas.map((rarity) => ({ rarity, weight: 1 })),
    foilChance: 0,
  };
}

describe('rarezasInalcanzables (T-034)', () => {
  it('senala lo que el pool tiene y ninguna slot pide', () => {
    // El caso real de Legend of Blue Eyes bajo la plantilla moderna: el techo
    // medido era del 70,7% y estas son las tres rarezas que lo causaban.
    const plantillaModerna = [
      slot(['common']),
      slot(['super_rare', 'ultra_rare', 'secret_rare', 'quarter_century_secret_rare']),
    ];
    const pool = ['common', 'rare', 'short_print', 'super_short_print', 'ultra_rare',
                  'super_rare', 'secret_rare'];

    expect(rarezasInalcanzables(plantillaModerna, pool))
      .toEqual(['rare', 'short_print', 'super_short_print']);
  });

  it('devuelve vacio cuando la plantilla cubre el pool entero', () => {
    const plantilla = [slot(['common', 'short_print']), slot(['rare', 'secret_rare'])];
    expect(rarezasInalcanzables(plantilla, ['common', 'rare', 'short_print'])).toEqual([]);
  });

  it('una rareza que la plantilla pide y el set no tiene NO es un problema', () => {
    // Es el caso contrario y es normal: el respaldo del motor entrega otra.
    // Si esto se contara como fallo, el informe seria ruido en cada set.
    expect(rarezasInalcanzables([slot(['common', 'mythic'])], ['common'])).toEqual([]);
  });

  it('no cuenta dos veces una rareza repetida en el pool', () => {
    expect(rarezasInalcanzables([slot(['common'])], ['rare', 'rare'])).toEqual(['rare']);
  });
});
```

- [ ] **Paso 2: verlo fallar**

```bash
npx vitest run apps/api/src/packs/coverage.test.ts
```

Esperado: FAIL — `Failed to resolve import "./coverage.js"`.

- [ ] **Paso 3: escribir la función**

`apps/api/src/packs/coverage.ts`:

```ts
import type { SlotConfig } from './types.js';

/**
 * Rarezas presentes en el pool que NINGUNA slot de la plantilla pide (T-034).
 *
 * Cada una es un trozo del set que el usuario no puede obtener jamas, por
 * mucho que abra. `01_Producto.md` define al coleccionista como uno de los tres
 * usuarios objetivo, asi que una lista no vacia aqui es una promesa incumplida,
 * no una imprecision de fidelidad.
 *
 * POR QUE NO SE LE ACREDITA NADA AL RESPALDO DEL MOTOR. `#poolFor` actua cuando
 * la rareza PEDIDA esta vacia en el set: entonces entrega otra. Nunca anade una
 * rareza que ninguna slot nombra. Contar aqui lo que el respaldo podria llegar a
 * entregar haria el informe optimista justo donde tiene que ser pesimista.
 *
 * El caso contrario -- la plantilla pide algo que el set no tiene -- NO se
 * reporta: es normal y el respaldo lo resuelve. Reportarlo llenaria de ruido
 * cada set y el informe dejaria de leerse, que es como se pierden los avisos
 * (T-019).
 */
export function rarezasInalcanzables(
  slots: ReadonlyArray<SlotConfig>,
  rarezasDelPool: Iterable<string>,
): string[] {
  const pedidas = new Set<string>();
  for (const slot of slots) {
    for (const d of slot.distribution) pedidas.add(d.rarity);
  }

  const fuera = new Set<string>();
  for (const rareza of rarezasDelPool) {
    if (!pedidas.has(rareza)) fuera.add(rareza);
  }
  return [...fuera].sort();
}
```

- [ ] **Paso 4: exportarla**

En `apps/api/src/packs/index.ts`, añadir:

```ts
export { rarezasInalcanzables } from './coverage.js';
```

- [ ] **Paso 5: verlo en verde**

```bash
npx vitest run apps/api/src/packs/coverage.test.ts
```

Esperado: `Tests  4 passed (4)`

- [ ] **Paso 6: commit**

```bash
git add apps/api/src/packs/coverage.ts apps/api/src/packs/coverage.test.ts apps/api/src/packs/index.ts
git commit -m "feat(packs): measure which rarities a template can never deliver (T-034)"
```

---

## Tarea 5 — El informe contra la base real

**Ficheros:** crear `apps/api/src/cli/coverage.ts`; modificar `package.json`

- [ ] **Paso 1: escribir el CLI**

`apps/api/src/cli/coverage.ts`:

```ts
import { loadConfig } from '../config.js';
import { Database, PackRepositoryMysql } from '../db/index.js';
import { rarezasInalcanzables } from '../packs/index.js';
import { GAME_IDS, type GameCode } from '@tcg/shared';

/**
 * `npm run packs:cobertura` — cuanto de cada set puede llegar a obtenerse.
 *
 * T-034. NADA medía esto. Ni P-019 ni P-021 los detecto una prueba: los destapo
 * mirar aperturas reales, dos veces, con siete sesiones de diferencia. Un set
 * cuya plantilla no nombra una de sus rarezas deja al coleccionista con un
 * porcentaje que no puede subir, y el motor no tiene forma de saberlo: hace
 * exactamente lo que la plantilla dice.
 *
 *   npm run packs:cobertura
 *   npm run packs:cobertura -- --game YGO
 *
 * Sale con codigo 1 si algun set tiene rarezas inalcanzables, para que valga
 * como comprobacion y no solo como informe.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--game');
  const filtro = i >= 0 ? argv[i + 1]?.toUpperCase() : undefined;

  const config = loadConfig();
  const db = new Database({ url: config.databaseUrl });
  const repo = new PackRepositoryMysql(db);
  let conHuecos = 0;

  try {
    for (const game of ['MTG', 'YGO', 'PTCG'] as GameCode[]) {
      if (filtro && filtro !== game) continue;

      // Solo los sets con pool: un set sin impresiones abribles no es un sobre.
      const sets = await db.select<{ id: number; code: string; released_at: string | null }>(
        `SELECT DISTINCT s.id, s.code, s.released_at
           FROM sets s JOIN card_prints p ON p.set_id = s.id AND p.in_boosters = 1
          WHERE s.game_id = ? ORDER BY s.released_at`,
        [GAME_IDS[game]],
      );

      console.log(`\n[${game}] ${sets.length} sets con pool`);
      for (const set of sets) {
        const plantilla = await repo.findTemplate(Number(set.id));
        if (!plantilla) {
          console.log(`  ${set.code.padEnd(6)} SIN PLANTILLA`);
          conHuecos += 1;
          continue;
        }

        const pool = await repo.loadPool(Number(set.id));
        const total = [...pool.values()].reduce((n, e) => n + e.length, 0);
        const fuera = rarezasInalcanzables(plantilla.slots, pool.keys());
        const perdidas = fuera.reduce((n, r) => n + (pool.get(r)?.length ?? 0), 0);
        const techo = total > 0 ? (100 * (total - perdidas)) / total : 100;

        if (fuera.length > 0) {
          conHuecos += 1;
          console.log(
            `  ${set.code.padEnd(6)} ${String(total).padStart(5)} impresiones · ` +
              `techo ${techo.toFixed(1)}% · inalcanzables: ${fuera.join(', ')}`,
          );
        }
      }

      console.log('  reparto por plantilla:');
      for (const [nombre, n] of [...reparto].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(n).padStart(5)}  ${nombre}`);
      }
    }
  } finally {
    await db.close();
  }

  if (conHuecos > 0) {
    console.log(`\n${conHuecos} sets con rarezas inalcanzables.`);
    process.exitCode = 1;
  } else {
    console.log('\nTodos los sets son completables.');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Paso 2: añadir el script**

En `package.json`, junto a `db:migrate`:

```json
    "packs:cobertura": "node apps/api/dist/cli/coverage.js",
```

- [ ] **Paso 3: compilar y ejecutar**

```bash
npm run build && npm run packs:cobertura -- --game YGO
```

Esperado en este punto: LOB, TDGS y BOSH **ya no aparecen** (la 0010 los cubre), y **sí** aparecen
ETCO (`starlight_rare`), MAMO y MAMS (`starlight_rare`, `grand_master_rare`) y LAVD
(`starlight_rare`, `new`). Es el hueco moderno que cierra la tarea 6.

- [ ] **Paso 4: commit**

```bash
git add apps/api/src/cli/coverage.ts package.json
git commit -m "feat(cli): report which sets cannot be completed (T-034)"
```

---

## Tarea 6 — El hueco de la época moderna

**Ficheros:** crear `db/migrations/0011_ygo_modern_gaps.{up,down}.sql`

- [ ] **Paso 1: escribir la migración**

`0011_ygo_modern_gaps.up.sql`:

```sql
-- =====================================================================
-- ProyectoTCG - Migracion 0011 - El hueco de la epoca moderna
-- Agente: Base de Datos - Tarea: T-034 - Sesion: S028
-- =====================================================================
-- LO QUE LA MEDICION DESTAPO
--
-- T-034 estaba fichada como un problema de los sets anteriores a 2020. Medido,
-- los MODERNOS estaban peor:
--
--   ETCO Eternity Code       2020-04-30   105 impresiones   techo  95,2%
--   MAMO Magnificent Monsters 2026-09-04  206 impresiones   techo  68,9%
--   MAMS Magnificent Maestros 2026-11-12   66 impresiones   techo  36,4%
--
-- La plantilla que la 0006 dejo pide `quarter_century_secret_rare`, y estos sets
-- traen `starlight_rare` y `grand_master_rare`. P-019 se dio por cerrado y el
-- techo seguia ahi, por debajo del set de 2002.
--
-- LO QUE SE HACE
--
--   1. Sembrar `grand_master_rare` con un tier de verdad. Hoy esta en la base
--      con tier 50 porque la puso `ensureRarity` al ingestar, no el seed. El
--      tier ordena el respaldo del motor ("de menos a mas escasa"), asi que una
--      rareza huerfana en 50 se ordena por accidente. Una plantilla no debe
--      depender de algo que llego por descubrimiento.
--   2. Anadir starlight y grand master al slot del hit.
--
-- ARITMETICA DEL SLOT 8
--
--   base [OFICIAL, Yugipedia]:  Secret 1/12 = 83, Ultra 1/6 = 167, Super = 750
--   [ESTIMADO]:  qcsr 42 (0006, ~1 por caja) + starlight 3 + grand_master 3 = 48
--   reescalado de los oficiales por (1000-48)/1000 = 0,952:
--       super  750*0,952 = 714
--       ultra  167*0,952 = 159
--       secret  83*0,952 =  79
--   -----------------------------------------------------------------
--       714+159+79+42+3+3 = 1000
--
-- ALCANZABLE NO ES REALISTA, Y CONVIENE DECIRLO. MAMO y MAMS no tienen ni una
-- carta comun y esta plantilla pide ocho: sus ocho slots caen al respaldo en
-- cada sobre. Con esto sus rarezas pasan a ser alcanzables y el techo llega al
-- 100%, pero un sobre de MAMO seguira sin parecerse al producto real.
-- Describirlos bien exige una plantilla propia con `set_id`, que es un INSERT
-- cuando se decida hacerlo. Registrado aparte, no tapado aqui.
--
-- NO LLEVA `USE`: ver la cabecera de la 0007 (P-032).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La rareza, sembrada de verdad.
--
--    Tier 15, por encima de ghost_rare (14), que era el mas escaso sembrado.
--    Es un JUICIO, no un dato publicado: coloca a la Grand Master Rare como la
--    mas escasa conocida. Si aparece mejor informacion, es un UPDATE.
-- ---------------------------------------------------------------------
INSERT INTO rarities (game_id, code, label, tier) VALUES
  (2, 'grand_master_rare', 'Grand Master Rare', 15)
ON DUPLICATE KEY UPDATE label = VALUES(label), tier = VALUES(tier);

-- ---------------------------------------------------------------------
-- 2. El slot del hit de la plantilla generica de Yu-Gi-Oh!.
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":714},{"rarity":"ultra_rare","weight":159},{"rarity":"secret_rare","weight":79},{"rarity":"quarter_century_secret_rare","weight":42},{"rarity":"starlight_rare","weight":3},{"rarity":"grand_master_rare","weight":3}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 2 AND set_id IS NULL AND is_default = 1
          AND valid_from IS NULL AND valid_to IS NULL
     ) AS t
   );
```

`0011_ygo_modern_gaps.down.sql`:

```sql
-- =====================================================================
-- ProyectoTCG - Migracion 0011 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- El slot 8 vuelve a los pesos que dejo la 0006, y con ellos vuelve el techo:
-- 95,2% en Eternity Code, 68,9% en Magnificent Monsters, 36,4% en Magnificent
-- Maestros.
--
-- El tier de `grand_master_rare` vuelve a 50, que es donde lo dejo
-- `ensureRarity`. La fila NO se borra: la pusieron los datos ingestados, no
-- esta migracion, y borrarla dejaria impresiones apuntando a una rareza
-- inexistente.
-- =====================================================================

UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":718},{"rarity":"ultra_rare","weight":160},{"rarity":"secret_rare","weight":80},{"rarity":"quarter_century_secret_rare","weight":42}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 2 AND set_id IS NULL AND is_default = 1
          AND valid_from IS NULL AND valid_to IS NULL
     ) AS t
   );

UPDATE rarities SET tier = 50 WHERE game_id = 2 AND code = 'grand_master_rare';
```

- [ ] **Paso 2: aplicar y volver a pasar el informe**

```bash
npm run db:migrate && npm run packs:cobertura -- --game YGO
```

Esperado: sólo queda **LAVD** con `new` — que es el producto de mazos, fuera de alcance por diseño
(spec §5). LOB, TDGS, BOSH, ETCO, MAMO y MAMS ya no aparecen.

- [ ] **Paso 3: commit**

```bash
git add db/migrations/0011_ygo_modern_gaps.up.sql db/migrations/0011_ygo_modern_gaps.down.sql
git commit -m "feat(packs): make starlight and grand master reachable (0011, T-034)"
```

---

## Tarea 7 — Los dos tests que vigilan las migraciones

**Ficheros:** crear `apps/api/src/db/template-eras.test.ts`

Mismo patrón que `seed-drift.test.ts` (T-016): leer el fichero de migración, que es **inmutable una
vez publicado**, y comprobarlo. No hace falta base de datos.

- [ ] **Paso 1: escribir el test**

`apps/api/src/db/template-eras.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * T-034 — dos formas de romper las plantillas de epoca sin que falle nada.
 *
 * 1. VENTANAS SOLAPADAS. Si dos epocas cubren la misma fecha, la plantilla que
 *    se elige depende del orden en que MySQL devuelva las filas. Funcionaria, y
 *    un dia dejaria de funcionar sin que nadie hubiera tocado nada.
 *
 * 2. UNA RAREZA QUE NO EXISTE. `pack_slots.distribution` es JSON libre: un
 *    `super_rar` en vez de `super_rare` deja esa entrada MUERTA -- el pool nunca
 *    tendra esa clave -- y el motor se limita a repartir el peso entre las
 *    demas. Sin error, sin aviso, con la fidelidad del sobre alterada.
 *
 * Los dos se comprueban leyendo los ficheros de migracion.
 */

const dir = (n: string) => fileURLToPath(new URL(`../../../../db/migrations/${n}`, import.meta.url));

const ERAS = readFileSync(dir('0010_ygo_era_templates.up.sql'), 'utf8');
const MODERNA = readFileSync(dir('0011_ygo_modern_gaps.up.sql'), 'utf8');
const SEED = readFileSync(dir('0002_seed_games_rarities.sql'), 'utf8');

interface Ventana { desde: string | null; hasta: string | null; nombre: string }

/** Filas del INSERT INTO pack_templates de la 0010. */
function ventanas(): Ventana[] {
  const bloque = /INSERT INTO pack_templates \([^)]*\) VALUES([\s\S]*?);/.exec(ERAS);
  if (!bloque?.[1]) throw new Error('No se encontro el INSERT INTO pack_templates en la 0010');

  const fila = /\(\s*2,\s*NULL,\s*(NULL|'[\d-]+'),\s*(NULL|'[\d-]+'),\s*'([^']+)'/g;
  const salida: Ventana[] = [];
  for (const m of bloque[1].matchAll(fila)) {
    const val = (s: string) => (s === 'NULL' ? null : s.slice(1, -1));
    salida.push({ desde: val(m[1]!), hasta: val(m[2]!), nombre: m[3]! });
  }
  return salida;
}

/** Codigos de rareza de Yu-Gi-Oh! sembrados, mas los que siembre la 0011. */
function rarezasSembradas(): Set<string> {
  const codigos = new Set<string>();
  for (const sql of [SEED, MODERNA]) {
    for (const m of sql.matchAll(/\(\s*2,\s*'([a-z_]+)',\s*'[^']*',\s*\d+\s*\)/g)) {
      codigos.add(m[1]!);
    }
  }
  return codigos;
}

/** Rarezas nombradas en cualquier `distribution` de las dos migraciones. */
function rarezasDeLasPlantillas(): Set<string> {
  const codigos = new Set<string>();
  for (const sql of [ERAS, MODERNA]) {
    for (const m of sql.matchAll(/"rarity":"([a-z_]+)"/g)) codigos.add(m[1]!);
  }
  return codigos;
}

describe('las ventanas de epoca', () => {
  it('son las tres esperadas', () => {
    expect(ventanas()).toHaveLength(3);
  });

  it('no se solapan entre si', () => {
    const dia = (s: string | null, porDefecto: string) => Date.parse(s ?? porDefecto);
    const rangos = ventanas()
      .map((v) => ({ ...v, d: dia(v.desde, '1900-01-01'), h: dia(v.hasta, '2999-12-31') }))
      .sort((a, b) => a.d - b.d);

    for (let i = 1; i < rangos.length; i += 1) {
      const previa = rangos[i - 1]!;
      const actual = rangos[i]!;
      expect(
        actual.d > previa.h,
        `"${actual.nombre}" empieza antes de que acabe "${previa.nombre}"`,
      ).toBe(true);
    }
  });

  it('ninguna deja la fecha de fin por delante de la de inicio', () => {
    for (const v of ventanas()) {
      if (v.desde && v.hasta) expect(Date.parse(v.desde) <= Date.parse(v.hasta)).toBe(true);
    }
  });
});

describe('las rarezas que las plantillas nombran', () => {
  it('existen todas en el seed', () => {
    const sembradas = rarezasSembradas();
    const huerfanas = [...rarezasDeLasPlantillas()].filter((r) => !sembradas.has(r)).sort();
    expect(huerfanas).toEqual([]);
  });
});
```

- [ ] **Paso 2: verlo en verde**

```bash
npx vitest run apps/api/src/db/template-eras.test.ts
```

Esperado: `Tests  4 passed (4)`

- [ ] **Paso 3: VERLO EN ROJO — los dos, uno por uno**

Esto no es opcional. P-029 fue una salvaguarda inerte que pasaba porque el valor por defecto
coincidía, y P-022 un test que pasaba en vacío porque la fixture devolvía `null`. Un test que no se
ha visto fallar no es una comprobación.

1. En la `0010`, cambiar `'2016-01-13'` por `'2016-06-13'` (solapa con la época 3).
   Esperado: FAIL con *"Core Booster (Breakers of Shadow…)" empieza antes de que acabe…*
   Deshacer.
2. En la `0010`, cambiar un `"rarity":"ghost_rare"` por `"rarity":"ghost_rar"`.
   Esperado: FAIL — `expected [ 'ghost_rar' ] to deeply equal []`.
   Deshacer.

- [ ] **Paso 4: commit**

```bash
git add apps/api/src/db/template-eras.test.ts
git commit -m "test(packs): guard era windows against overlap and typos (T-034)"
```

---

## Verificación final

- [ ] **Paso 1: la suite entera**

```bash
npm run build && npm test && npm audit
```

Esperado: `tsc` sin salida · **354 passed** (346 + 4 de cobertura + 4 de épocas) · `found 0
vulnerabilities`.

- [ ] **Paso 2: el ciclo de migraciones contra MySQL real**

Deshacer en orden inverso y volver a aplicar. Comprueba que los `down` son correctos, que es lo que
nunca se prueba hasta que hace falta:

```bash
docker compose exec -T mysql mysql -uroot -proot proyecto_tcg < db/migrations/0011_ygo_modern_gaps.down.sql
docker compose exec -T mysql mysql -uroot -proot proyecto_tcg < db/migrations/0010_ygo_era_templates.down.sql
docker compose exec -T mysql mysql -uroot -proot proyecto_tcg < db/migrations/0009_template_eras.down.sql
docker compose exec -T mysql mysql -uroot -proot proyecto_tcg -e "DELETE FROM schema_migrations WHERE name LIKE '00(09|10|11)%';"
npm run db:migrate
```

Esperado: las tres vuelven a aplicarse y el informe da el mismo resultado que antes de deshacer.

- [ ] **Paso 3: el historial no se ha tocado (RN-01, P-005)**

Es la comprobación que más importa: cambiar plantillas **no** puede reescribir aperturas pasadas.

```bash
docker compose exec -T mysql mysql -uroot -proot proyecto_tcg -e "
SELECT o.id, o.set_id, COUNT(c.id) cartas,
       JSON_EXTRACT(o.template_snapshot,'\$.name') plantilla_congelada
  FROM pack_openings o JOIN pack_opening_cards c ON c.pack_opening_id = o.id
 GROUP BY o.id ORDER BY o.id DESC LIMIT 5;"
```

Esperado: las aperturas anteriores siguen con su `template_snapshot` original y su número de cartas
intacto.

- [ ] **Paso 4: abrir un sobre de un set antiguo, de verdad**

Con la API levantada, abrir un sobre de LOB y comprobar que entrega 9 cartas y que el slot 8 trae
una `rare` la mayoría de las veces — que es lo que la época 1 describe y lo que la plantilla moderna
no hacía.

- [ ] **Paso 5: el informe, limpio**

```bash
npm run packs:cobertura
```

Esperado: sólo LAVD, con `new`. Es el producto de mazos, fuera de alcance por diseño (spec §5).

---

## Documentación del Vault (agente Documentador)

- `005Registro/2026-08-26_S028_PlantillasPorEpoca.md` — bitácora
- `003Problemas/Registro_Problemas.md` — **escribir P-021, que se cita en cinco documentos y nunca se
  redactó**; cerrarlo; abrir el problema de los productos que no son sobres
- `001Reportes/Tareas_Realizadas.md` — T-034
- `001Reportes/Tareas_Pendientes.md` — T-034 fuera; alta de las dos tareas de §5 del spec
- `00Master/03_Hitos.md` y `05_Continuar_Aqui.md` — **H8c completo**
- `00Master/04_Diccionario_Datos.md` — `valid_from` / `valid_to`
- `Claude.md` — mapa: migraciones 0009-0011, S028
