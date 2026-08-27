-- =====================================================================
-- ProyectoTCG - Migracion 0018 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- Las cinco epocas historicas de Pokemon, y `Booster Sword & Shield` vuelve a
-- tragarse toda la historia anterior a 2023. Con ello vuelve el centenar de
-- sets con cartas inalcanzables que la 0018 cerro.
--
-- SE RETIRAN, NO SE BORRAN, las que tengan aperturas (P-035).
-- =====================================================================

DELETE FROM pack_slots
 WHERE pack_template_id IN (
   SELECT id FROM (
     SELECT id FROM pack_templates WHERE game_id = 3
      AND valid_to IN ('2007-04-30','2010-02-09','2011-04-24','2016-12-31','2019-12-31')
   ) AS t
 );

DELETE FROM pack_templates
 WHERE game_id = 3
   AND valid_to IN ('2007-04-30','2010-02-09','2011-04-24','2016-12-31','2019-12-31')
   AND id NOT IN (SELECT DISTINCT pack_template_id FROM pack_openings);

UPDATE pack_templates
   SET valid_from = NULL, valid_to = NULL, name = CONCAT(name, ' (retirada)')
 WHERE game_id = 3 AND valid_to IN ('2007-04-30','2010-02-09','2011-04-24','2016-12-31','2019-12-31');

-- Sword & Shield vuelve a tener el inicio abierto.
UPDATE pack_templates SET valid_from = NULL WHERE game_id = 3 AND valid_to = '2023-03-30';

UPDATE pack_slots
   SET distribution = '[{"rarity":"rare","weight":400},{"rarity":"rare_holo","weight":267},{"rarity":"rare_holo_v","weight":143},{"rarity":"rare_ultra","weight":55},{"rarity":"rare_holo_vmax","weight":40},{"rarity":"rare_holo_vstar","weight":40},{"rarity":"radiant_rare","weight":20},{"rarity":"rare_secret","weight":20},{"rarity":"rare_rainbow","weight":15}]'
 WHERE slot_index = 9
   AND pack_template_id = (
     SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to = '2023-03-30') AS t
   );
