-- =====================================================================
-- ProyectoTCG - Migracion 0017 - Las paralelas estan en las CUATRO epocas
-- Agente: Base de Datos - Tarea: T-078 - Sesion: S028
-- =====================================================================
-- UN ERROR DE LA 0010, QUE EL CATALOGO COMPLETO DESTAPO
--
-- La 0010 puso `ultimate_rare` y `ghost_rare` solo en la epoca 2 (2008-2016).
-- Con nueve sets de Yu-Gi-Oh! ingestados no habia forma de ver que estaba mal.
-- Con los 1032, si: 143 sets con cartas inalcanzables, y los primeros de la
-- lista eran de 2004-2007 -- `Soul of the Duelist`, `Rise of Destiny`,
-- `Flaming Eternity` -- topados en el 70-74% por `ultimate_rare`.
--
-- Contado por epoca sobre los sets ofrecidos:
--
--   epoca                 ultimate_rare   ghost_rare   sets
--   1 hasta 2008-09-01         348             4        16
--   2 hasta 2016-01-13         290            30        48
--   3 hasta 2020-04-29          54             0        18
--   4 generica                 479            22        37
--
-- Las dos rarezas van de 2004 a 2026. No son de una epoca: son las paralelas
-- del Core Booster, y llevan ahi toda la vida. La 0010 acerto en que existen y
-- fallo en donde.
--
-- POR QUE NO SE VIO ANTES. Los sets que las traen estaban sin ingestar. Una
-- muestra de nueve sets no ejercita el mismo camino que el catalogo entero, y
-- esta es la tercera vez que este proyecto lo aprende (P-017, P-020, y ahora).
--
-- LOS PESOS son los mismos que la 0010 estimo para la epoca 2 -- ultimate 42
-- (~1 por caja), ghost 3 (~1 cada doce cajas) -- porque no hay motivo para que
-- cambien de epoca y usar dos escalas distintas para lo mismo seria peor.
-- Siguen siendo [ESTIMADO]: no hay tasa publicada.
--
-- Cada slot se reescala por (1000-45)/1000 = 0,955 para seguir sumando 1000.
-- La aritmetica va en cada bloque.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

-- ---------------------------------------------------------------------
-- EPOCA 1 (hasta 2008-09-01). Base [OFICIAL]: rare 625, super 250, ultra 83,
-- secret 42.  Reescalado: 597 · 239 · 79 · 40  +  ultimate 42 + ghost 3 = 1000
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"rare","weight":597},{"rarity":"super_rare","weight":239},{"rarity":"ultra_rare","weight":79},{"rarity":"ultimate_rare","weight":42},{"rarity":"secret_rare","weight":40},{"rarity":"ghost_rare","weight":3}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_to = '2008-09-01') AS t
   );

-- ---------------------------------------------------------------------
-- EPOCA 3 (2016-01-14 .. 2020-04-29). Base: super 748, ultra 166, secret 83,
-- starlight 3.  Reescalado: 714 · 159 · 79 · 3  +  ultimate 42 + ghost 3 = 1000
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":714},{"rarity":"ultra_rare","weight":159},{"rarity":"secret_rare","weight":79},{"rarity":"ultimate_rare","weight":42},{"rarity":"starlight_rare","weight":3},{"rarity":"ghost_rare","weight":3}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2016-01-14') AS t
   );

-- ---------------------------------------------------------------------
-- EPOCA 4, la generica. Base: super 714, ultra 159, secret 79, qcsr 42,
-- starlight 3, grand_master 3.
-- Reescalado: 682 · 152 · 75 · 40 · 3 · 3  +  ultimate 42 + ghost 3 = 1000
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":682},{"rarity":"ultra_rare","weight":152},{"rarity":"secret_rare","weight":75},{"rarity":"ultimate_rare","weight":42},{"rarity":"quarter_century_secret_rare","weight":40},{"rarity":"starlight_rare","weight":3},{"rarity":"grand_master_rare","weight":3},{"rarity":"ghost_rare","weight":3}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 2 AND set_id IS NULL AND is_default = 1
          AND valid_from IS NULL AND valid_to IS NULL
     ) AS t
   );
