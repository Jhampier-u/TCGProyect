-- =====================================================================
-- ProyectoTCG - Migracion 0017 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- `ultimate_rare` y `ghost_rare` vuelven a estar solo en la epoca 2, y con ello
-- vuelven los techos del 70-74% en los sets de 2004-2007 y los huecos en las
-- epocas 3 y 4. Son tres UPDATE: no toca plantillas ni aperturas.
-- =====================================================================

UPDATE pack_slots
   SET distribution = '[{"rarity":"rare","weight":625},{"rarity":"super_rare","weight":250},{"rarity":"ultra_rare","weight":83},{"rarity":"secret_rare","weight":42}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_to = '2008-09-01') AS t
   );

UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":748},{"rarity":"ultra_rare","weight":166},{"rarity":"secret_rare","weight":83},{"rarity":"starlight_rare","weight":3}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2016-01-14') AS t
   );

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
