-- =====================================================================
-- ProyectoTCG - Migracion 0019 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- Los sobres de Black Bolt y White Flare vuelven a dar a las Illustration Rare
-- el 10,2% del hit, cuando son el 40,1% del set. Todas las cartas siguen siendo
-- alcanzables -- eso lo arreglo la 0012 y no depende de esto --; lo que vuelve
-- es que el sobre no se parezca al producto (T-073).
--
-- Es un UPDATE de una fila: no toca plantillas ni aperturas.
-- =====================================================================

UPDATE pack_slots
   SET distribution = '[{"rarity":"rare","weight":546},{"rarity":"double_rare","weight":195},{"rarity":"illustration_rare","weight":102},{"rarity":"ultra_rare","weight":91},{"rarity":"special_illustration_rare","weight":41},{"rarity":"black_white_rare","weight":25}]'
 WHERE slot_index = 9
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 3 AND valid_from = '2025-07-18' AND valid_to = '2025-07-18'
     ) AS t
   );
