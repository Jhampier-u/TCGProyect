-- =====================================================================
-- ProyectoTCG - Migracion 0016 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- `special` y `bonus` vuelven a ser inalcanzables, y con ellas los techos
-- medidos antes de la 0016: 70,5% en Time Spiral Remastered, 97,2% en Vintage
-- Masters, 99,7-99,9% en The List y los Commander, y 0,0% en las tres hojas de
-- inserto (tsb, mps, mp2).
--
-- Es un UPDATE de una fila: no toca plantillas ni aperturas.
-- =====================================================================

UPDATE pack_slots
   SET distribution = '[{"rarity":"common","weight":570},{"rarity":"uncommon","weight":280},{"rarity":"rare","weight":129},{"rarity":"mythic","weight":21}]'
 WHERE slot_index = 13
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 1 AND set_id IS NULL AND is_default = 1
     ) AS t
   );
