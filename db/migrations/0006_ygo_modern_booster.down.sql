-- =====================================================================
-- ProyectoTCG - Migracion 0006 - ROLLBACK
-- Devuelve la plantilla de Yu-Gi-Oh! a la estructura clasica de la 0003.
--
-- AVISO: deshacer esto reintroduce P-019. La plantilla clasica pide una rareza
-- `rare` que los sets posteriores a 2020 no tienen, y nunca pide la Quarter
-- Century Secret Rare, lo que vuelve a poner un techo del 80% a la completitud.
-- =====================================================================

USE proyecto_tcg;

UPDATE pack_templates
   SET name = 'Core Booster', card_count = 9
 WHERE game_id = 2 AND set_id IS NULL AND is_default = 1;

DELETE FROM pack_slots
 WHERE pack_template_id = (
   SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND set_id IS NULL AND is_default = 1) AS t
 );

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"common","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND set_id IS NULL AND is_default = 1) AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 7, '[{"rarity":"rare","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND set_id IS NULL AND is_default = 1) AS t;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 8,
       '[{"rarity":"super_rare","weight":750},{"rarity":"ultra_rare","weight":167},{"rarity":"secret_rare","weight":83}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND set_id IS NULL AND is_default = 1) AS t;
