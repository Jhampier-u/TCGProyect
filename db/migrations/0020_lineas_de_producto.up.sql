-- =====================================================================
-- ProyectoTCG - Migracion 0020 - Linea de producto
-- Agente: Base de Datos - Tarea: T-080 - Sesion: S028
-- =====================================================================
-- EL PROBLEMA QUE LAS EPOCAS NO PUEDEN RESOLVER
--
-- Quedaban 80 sets de Yu-Gi-Oh! con cartas inalcanzables, y todos pertenecen a
-- LINEAS DE PRODUCTO: Duel Terminal, Gold Series, Battle Pack, Mega Pack,
-- Rarity Collection y Legendary Duelists. Cada una tiene su propia escalera de
-- rarezas -- un Gold Series trae `gold_rare`, un Duel Terminal cuatro grados de
-- `duel_terminal_*_parallel_rare` -- y ninguna plantilla las nombraba.
--
-- El mecanismo de epocas (0009) NO SIRVE aqui, y no es un detalle:
--
--   Gold Series    2008-04-02 .. 2021-11-18
--   Battle Pack    2012-05-24 .. 2026-02-05
--   Mega Pack      2014-08-28 .. 2025-09-04
--
-- Se solapan entre si Y con los Core Booster de esos mismos anos. Una ventana
-- por fecha no puede decir "los sets de 2015 son Battle Pack", porque en 2015
-- tambien salieron Core Boosters y Mega Packs. El test de solapes lo rechazaria,
-- y tendria razon.
--
-- POR QUE UNA COLUMNA Y NO UNA PLANTILLA POR SET
--
-- `pack_templates.set_id` existe desde H4 y permitiria una plantilla por set:
-- serian 70 plantillas casi identicas -- las diez de Gold Series describen el
-- mismo producto -- y cada set nuevo de una linea exigiria anadir la suya A
-- MANO. Eso es el "paso de asignacion posterior a la ingesta" que mantuvo T-034
-- bloqueada trece sesiones. No se vuelve a construir.
--
-- Lo que es verdad del dominio es esto: un SET pertenece a una linea, y una
-- LINEA tiene una estructura de sobre. Modelado asi son seis plantillas, y los
-- sets se etiquetan solos en la ingesta -- igual que `is_openable` (T-069) y por
-- la misma razon: lo que se calcula solo no se olvida.
--
-- PRECEDENCIA RESULTANTE en `findTemplate`, de mas especifica a menos:
--   1. La plantilla propia del set        (`set_id`)
--   2. La de su LINEA DE PRODUCTO         (`product_line`)   <- nuevo
--   3. La de la EPOCA que cubre su fecha  (`valid_from`/`valid_to`)
--   4. La generica del juego
--
-- La linea va ANTES que la epoca porque es mas especifica: un Gold Series de
-- 2010 es antes un Gold Series que un sobre de 2010.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La columna, en los dos lados de la relacion.
-- ---------------------------------------------------------------------
ALTER TABLE sets
  ADD COLUMN product_line VARCHAR(32) NULL DEFAULT NULL AFTER is_openable;

ALTER TABLE pack_templates
  ADD COLUMN product_line VARCHAR(32) NULL DEFAULT NULL AFTER valid_to;

-- No se anaden indices: `sets` son millares, no millones, y `pack_templates` una
-- decena de filas. Un indice de mas encarece cada upsert de la ingesta -- que si
-- es caliente -- para no ganar nada aqui.

-- ---------------------------------------------------------------------
-- 2. Cuatro rarezas que estaban en la base POR DESCUBRIMIENTO.
--
--    `ensureRarity` inserta con tier 50 lo que la ingesta encuentra y el seed no
--    conocia. El tier ordena el respaldo del motor, asi que una rareza huerfana
--    en 50 se ordena por accidente, y una plantilla no debe depender de eso
--    (misma leccion que `grand_master_rare` en la 0011).
--
--    Los tres grados de Duel Terminal que faltaban se colocan siguiendo al que
--    SI estaba sembrado -- `duel_terminal_normal_parallel_rare`, tier 5 -- y en
--    el orden de escasez del propio producto.
--
--    `starfoil` es otra cosa: 49 impresiones frente a las 440 de
--    `starfoil_rare`. Todo apunta a que el origen escribe la MISMA rareza de dos
--    formas, y lo que corresponde es normalizarlo en la ingesta (P-007), no
--    bendecir el duplicado. Mientras tanto se le da el tier de su gemela para
--    que esas 49 cartas sean alcanzables, y queda dicho aqui.
-- ---------------------------------------------------------------------
INSERT INTO rarities (game_id, code, label, tier) VALUES
  (2, 'duel_terminal_rare_parallel_rare',  'Duel Terminal Rare Parallel Rare',  5),
  (2, 'duel_terminal_super_parallel_rare', 'Duel Terminal Super Parallel Rare', 6),
  (2, 'duel_terminal_ultra_parallel_rare', 'Duel Terminal Ultra Parallel Rare', 7),
  (2, 'starfoil',                          'Starfoil',                          5)
ON DUPLICATE KEY UPDATE label = VALUES(label), tier = VALUES(tier);
