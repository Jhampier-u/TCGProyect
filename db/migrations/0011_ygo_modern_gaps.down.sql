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
