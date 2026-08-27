-- =====================================================================
-- ProyectoTCG - Migracion 0023 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- Vuelven las rarezas de cola larga a ser inalcanzables: la Ghost Rare de los
-- Legendary Duelists, la Ghost Gold de Gold Series, el quinto grado de Duel
-- Terminal, la Prismatic de World Superstars y las tres sueltas de la generica.
-- Y desaparece la plantilla de Movie Pack.
--
-- Las cinco rarezas sembradas vuelven al tier 50 en que las dejo `ensureRarity`.
-- Las filas NO se borran: las pusieron los datos ingestados, y borrarlas dejaria
-- impresiones apuntando a una rareza inexistente.
--
-- La plantilla de Movie Pack se retira en vez de borrarse si tiene aperturas
-- (P-035).
-- =====================================================================

UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":436},{"rarity":"ultra_rare","weight":419},{"rarity":"quarter_century_secret_rare","weight":104},{"rarity":"secret_rare","weight":41}]'
 WHERE slot_index = 4
   AND pack_template_id = (SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'legendary_duelists') AS t);

UPDATE pack_slots
   SET distribution = '[{"rarity":"duel_terminal_rare_parallel_rare","weight":459},{"rarity":"duel_terminal_super_parallel_rare","weight":272},{"rarity":"duel_terminal_ultra_parallel_rare","weight":269}]'
 WHERE slot_index = 4
   AND pack_template_id = (SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'duel_terminal') AS t);

UPDATE pack_slots
   SET distribution = '[{"rarity":"gold_rare","weight":578},{"rarity":"premium_gold_rare","weight":225},{"rarity":"gold_secret_rare","weight":197}]'
 WHERE slot_index = 4
   AND pack_template_id = (SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'gold_series') AS t);

UPDATE pack_slots
   SET distribution = '[{"rarity":"ultra_rare","weight":279},{"rarity":"ultimate_rare","weight":241},{"rarity":"super_rare","weight":240},{"rarity":"secret_rare","weight":240}]'
 WHERE slot_index < 4
   AND pack_template_id = (SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'rarity_collection') AS t);

UPDATE pack_slots
   SET distribution = '[{"rarity":"common","weight":597},{"rarity":"super_rare","weight":239},{"rarity":"ultra_rare","weight":79},{"rarity":"ultimate_rare","weight":42},{"rarity":"secret_rare","weight":40},{"rarity":"ghost_rare","weight":3}]'
 WHERE slot_index = 8
   AND pack_template_id = (SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2008-09-02') AS t);

UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":631},{"rarity":"ultra_rare","weight":141},{"rarity":"secret_rare","weight":68},{"rarity":"rare","weight":60},{"rarity":"ultimate_rare","weight":39},{"rarity":"quarter_century_secret_rare","weight":37},{"rarity":"collectors_rare","weight":15},{"rarity":"starlight_rare","weight":3},{"rarity":"grand_master_rare","weight":3},{"rarity":"ghost_rare","weight":3}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates WHERE game_id = 2 AND set_id IS NULL AND is_default = 1
         AND valid_from IS NULL AND valid_to IS NULL AND product_line IS NULL
     ) AS t
   );

DELETE FROM pack_slots
 WHERE pack_template_id IN (
   SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'movie_pack') AS t
 );

DELETE FROM pack_templates
 WHERE game_id = 2 AND product_line = 'movie_pack'
   AND id NOT IN (SELECT DISTINCT pack_template_id FROM pack_openings);

UPDATE pack_templates
   SET product_line = NULL, name = CONCAT(name, ' (retirada)')
 WHERE game_id = 2 AND product_line = 'movie_pack';

UPDATE rarities SET tier = 50
 WHERE game_id = 2 AND code IN (
   'duel_terminal_normal_rare_parallel_rare','ultra_parallel_rare',
   'ghost_gold_rare','ultra_rare_pharaohs_rare','10000_secret_rare');
