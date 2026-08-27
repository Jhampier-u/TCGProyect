-- =====================================================================
-- ProyectoTCG - Migracion 0022 - ROLLBACK
-- =====================================================================
-- Vuelven a ser inalcanzables `rare` y `collectors_rare` en los mini-boosters
-- modernos: 19 y 16 sets respectivamente. Es un UPDATE de una fila.
-- =====================================================================

UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":682},{"rarity":"ultra_rare","weight":152},{"rarity":"secret_rare","weight":75},{"rarity":"ultimate_rare","weight":42},{"rarity":"quarter_century_secret_rare","weight":40},{"rarity":"starlight_rare","weight":3},{"rarity":"grand_master_rare","weight":3},{"rarity":"ghost_rare","weight":3}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 2 AND set_id IS NULL AND is_default = 1
          AND valid_from IS NULL AND valid_to IS NULL AND product_line IS NULL
     ) AS t
   );
