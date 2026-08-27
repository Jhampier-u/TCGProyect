-- =====================================================================
-- ProyectoTCG - Migracion 0021 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- Las seis plantillas de linea. Los 70 sets de Duel Terminal, Gold Series,
-- Battle Pack, Mega Pack, Rarity Collection y Legendary Duelists vuelven a
-- resolver a su epoca -- un Core Booster -- y con ello vuelven los 80 sets con
-- cartas inalcanzables.
--
-- SE RETIRAN, NO SE BORRAN, las que tengan aperturas (P-035): quitarles la
-- linea basta para que dejen de elegirse.
-- =====================================================================

DELETE FROM pack_slots
 WHERE pack_template_id IN (
   SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line IS NOT NULL) AS t
 );

DELETE FROM pack_templates
 WHERE game_id = 2 AND product_line IS NOT NULL
   AND id NOT IN (SELECT DISTINCT pack_template_id FROM pack_openings);

UPDATE pack_templates
   SET product_line = NULL, name = CONCAT(name, ' (retirada)')
 WHERE game_id = 2 AND product_line IS NOT NULL;
