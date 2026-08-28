-- =====================================================================
-- ProyectoTCG - Migracion 0026 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- The List vuelve a no aparecer en ningun sobre, y el slot de tierra vuelve a
-- entregar cualquier comun en los 112 sets de Magic que si traen tierras
-- basicas. El septimo carton del Play Booster vuelve a ser una comun y la epoca 3
-- vuelve a juntar tierra, foil e insertos en un solo slot.
--
-- LA COBERTURA NO EMPEORA: `special` y `bonus` siguen nombrados en los mismos
-- slots de siempre, solo que sin separar. Lo que empeora es la fidelidad.
--
-- EL ORDEN IMPORTA. Primero se quitan las entradas `{"set":...}` de las
-- `distribution` y despues la columna: dejar una entrada de otro set con el
-- motor de una version anterior la haria elegir una rareza inexistente, y el
-- respaldo lo taparia sin decir nada. La columna se quita al final porque el
-- CHECK que la acompana desaparece con ella.
--
-- NO BORRA NI RETIRA NINGUNA PLANTILLA, asi que no hay nada del tipo P-035 que
-- vigilar: esta migracion solo hizo UPDATEs sobre slots que ya existian, y el
-- rollback los devuelve a su valor anterior.
-- =====================================================================

-- 1. El septimo carton del Play Booster vuelve a ser una comun a secas.
UPDATE pack_slots
   SET distribution = '[{"rarity":"common","weight":1000}]'
 WHERE slot_index = 6
   AND pack_template_id = (
     SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND is_default = 1) AS t
   );

-- 2. La epoca 3, como la dejo la 0025: todo junto en el slot 10.
UPDATE pack_slots
   SET distribution = '[{"rarity":"common","weight":1000}]',
       foil_chance = 0.00000
 WHERE slot_index = 9
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 1 AND valid_from = '2008-10-03' AND valid_to = '2024-02-08'
     ) AS t
   );

UPDATE pack_slots
   SET distribution = '[{"rarity":"common","weight":980},{"rarity":"special","weight":15},{"rarity":"bonus","weight":5}]',
       foil_chance = 0.22000
 WHERE slot_index = 10
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 1 AND valid_from = '2008-10-03' AND valid_to = '2024-02-08'
     ) AS t
   );

-- 3. Y por ultimo la columna, con su CHECK.
ALTER TABLE pack_slots
  DROP CONSTRAINT ck_slots_card_filter,
  DROP COLUMN card_filter;
