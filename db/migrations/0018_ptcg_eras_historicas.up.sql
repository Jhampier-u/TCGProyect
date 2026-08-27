-- =====================================================================
-- ProyectoTCG - Migracion 0018 - Las cinco epocas historicas de Pokemon
-- Agente: Base de Datos - Tarea: T-079 - Sesion: S028
-- =====================================================================
-- COMO SALIO
--
-- Con los 174 sets de Pokemon ingestados, el informe de cobertura senalo un
-- centenar de sets con cartas inalcanzables. La causa es la de siempre y ya
-- conocida: cada bloque de la historia del juego tiene su rareza estrella, y
-- solo estaban descritas las tres ultimas eras.
--
-- Medido sobre los sets ofrecidos -- fechas reales, no de memoria:
--
--   rare_holo_ex      37 sets   2003-07-01 .. 2016-11-02
--   rare_holo_gx      15        2017-02-03 .. 2019-11-01
--   rare_holo_lv_x    11        2007-05-01 .. 2009-11-04
--   rare_holo_star     9        2004-11-01 .. 2007-02-02
--   rare_prism_star    6        2018-02-02 .. 2019-02-01
--   rare_break         5        2015-11-04 .. 2016-11-02
--   rare_prime         4        2010-02-10 .. 2010-11-03
--   legend             4        2010-02-10 .. 2010-11-03
--   rare_ace           4        2012-11-07 .. 2013-08-14
--   rare_shining       3        2001-09-21 .. 2017-10-06
--
-- Y tres que NO son de una epoca, sino de fondo: `rare_holo` (1999-2023),
-- `rare_secret` (2000-2023) y `rare_ultra` (2011-2023). Van en todas las epocas
-- donde existen.
--
-- UN FALLO QUE ESTO CORRIGE DE PASO
--
-- `Booster Sword & Shield` (0014) se creo con `valid_from` NULL, asi que se
-- tragaba TODA la historia anterior a 2023: los sets de 1999 resolvian a la
-- plantilla de 2020. Con nueve sets ingestados no habia forma de verlo. Ahora
-- se le pone su inicio real.
--
-- LAS SEIS VENTANAS, contiguas y sin solape:
--
--   ..2007-04-30              clasico: Base, Jungle, Neo, e-Card, EX
--   2007-05-01..2010-02-09    Diamond & Pearl / Platinum
--   2010-02-10..2011-04-24    HeartGold SoulSilver
--   2011-04-25..2016-12-31    Black & White / XY
--   2017-01-01..2019-12-31    Sun & Moon
--   2020-01-01..2023-03-30    Sword & Shield   (ya existia, se le fija el inicio)
--
-- LOS NUEVE PRIMEROS SLOTS son los mismos en todas: 4 comunes, 3 infrecuentes y
-- 2 reversos. Un sobre de Pokemon ha llevado esa estructura toda su historia
-- moderna; lo que cambia de epoca es el hit.
--
-- LOS PESOS DEL HIT SON [ESTIMADO] en su reparto interno. No hay tasa publicada
-- para la mayoria de estas rarezas, y las que la tienen la publican por set, no
-- por epoca. Lo que SI queda garantizado -- y es lo que P-021 enseno a mirar --
-- es que todas son alcanzables. Si aparecen datos mejores es un UPDATE
-- (ADR-005).
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Sword & Shield deja de tragarse la prehistoria.
-- ---------------------------------------------------------------------
UPDATE pack_templates
   SET valid_from = '2020-01-01'
 WHERE game_id = 3 AND valid_to = '2023-03-30';

-- ---------------------------------------------------------------------
-- 1. Las cinco plantillas nuevas.
-- ---------------------------------------------------------------------
INSERT INTO pack_templates (game_id, set_id, valid_from, valid_to, name, card_count, is_default) VALUES
  (3, NULL, NULL,         '2007-04-30', 'Booster clasico (hasta la era EX)', 10, 0),
  (3, NULL, '2007-05-01', '2010-02-09', 'Booster Diamond & Pearl / Platinum', 10, 0),
  (3, NULL, '2010-02-10', '2011-04-24', 'Booster HeartGold SoulSilver',       10, 0),
  (3, NULL, '2011-04-25', '2016-12-31', 'Booster Black & White / XY',         10, 0),
  (3, NULL, '2017-01-01', '2019-12-31', 'Booster Sun & Moon',                 10, 0);

-- ---------------------------------------------------------------------
-- 2. Los nueve slots comunes a las cinco.
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"common","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3
         AND valid_to IN ('2007-04-30','2010-02-09','2011-04-24','2016-12-31','2019-12-31')) AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"uncommon","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3
         AND valid_to IN ('2007-04-30','2010-02-09','2011-04-24','2016-12-31','2019-12-31')) AS t
  JOIN (SELECT 4 AS idx UNION SELECT 5 UNION SELECT 6) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"common","weight":600},{"rarity":"uncommon","weight":300},{"rarity":"rare","weight":100}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3
         AND valid_to IN ('2007-04-30','2010-02-09','2011-04-24','2016-12-31','2019-12-31')) AS t
  JOIN (SELECT 7 AS idx UNION SELECT 8) AS s;

-- ---------------------------------------------------------------------
-- 3. El hit de cada epoca. Cada uno suma 1000.
-- ---------------------------------------------------------------------

-- Clasico (Base .. EX):   400+400+150+25+15+10
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 9,
       '[{"rarity":"rare","weight":400},{"rarity":"rare_holo","weight":400},{"rarity":"rare_holo_ex","weight":150},{"rarity":"rare_holo_star","weight":25},{"rarity":"rare_shining","weight":15},{"rarity":"rare_secret","weight":10}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to = '2007-04-30') AS t;

-- Diamond & Pearl / Platinum:   430+430+100+25+15
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 9,
       '[{"rarity":"rare","weight":430},{"rarity":"rare_holo","weight":430},{"rarity":"rare_holo_lv_x","weight":100},{"rarity":"rare_secret","weight":25},{"rarity":"rare_shining","weight":15}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to = '2010-02-09') AS t;

-- HeartGold SoulSilver:   420+420+100+40+20
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 9,
       '[{"rarity":"rare","weight":420},{"rarity":"rare_holo","weight":420},{"rarity":"rare_prime","weight":100},{"rarity":"legend","weight":40},{"rarity":"rare_secret","weight":20}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to = '2011-04-24') AS t;

-- Black & White / XY:   380+330+130+80+30+25+20+5
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 9,
       '[{"rarity":"rare","weight":380},{"rarity":"rare_holo","weight":330},{"rarity":"rare_ultra","weight":130},{"rarity":"rare_holo_ex","weight":80},{"rarity":"rare_break","weight":30},{"rarity":"rare_ace","weight":25},{"rarity":"rare_secret","weight":20},{"rarity":"rare_shining","weight":5}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to = '2016-12-31') AS t;

-- Sun & Moon:   380+300+130+100+40+30+15+5
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 9,
       '[{"rarity":"rare","weight":380},{"rarity":"rare_holo","weight":300},{"rarity":"rare_holo_gx","weight":130},{"rarity":"rare_ultra","weight":100},{"rarity":"rare_prism_star","weight":40},{"rarity":"rare_rainbow","weight":30},{"rarity":"rare_secret","weight":15},{"rarity":"rare_shining","weight":5}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to = '2019-12-31') AS t;

-- ---------------------------------------------------------------------
-- 4. Sword & Shield: le faltaban dos rarezas de su propia epoca.
--
--    `amazing_rare` (2 sets, 2020-2021) y `classic_collection` (Celebrations,
--    2021, 25 impresiones). Reescalado de los pesos vigentes por 0,99:
--      rare 396 · rare_holo 264 · rare_holo_v 142 · rare_ultra 54
--      vmax 40 · vstar 40 · radiant 20 · secret 20 · rainbow 14
--      + amazing_rare 8 + classic_collection 2  [ESTIMADO]
--      ------------------------------------------------------
--                                                        1000
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"rare","weight":396},{"rarity":"rare_holo","weight":264},{"rarity":"rare_holo_v","weight":142},{"rarity":"rare_ultra","weight":54},{"rarity":"rare_holo_vmax","weight":40},{"rarity":"rare_holo_vstar","weight":40},{"rarity":"radiant_rare","weight":20},{"rarity":"rare_secret","weight":20},{"rarity":"rare_rainbow","weight":14},{"rarity":"amazing_rare","weight":8},{"rarity":"classic_collection","weight":2}]'
 WHERE slot_index = 9
   AND pack_template_id = (
     SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to = '2023-03-30') AS t
   );
