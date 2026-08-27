-- =====================================================================
-- ProyectoTCG - Migracion 0014 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- Las plantillas de Sword & Shield y de Paldean Fates, y las ACE SPEC en la
-- generica. Vuelven los techos medidos antes de la 0014: 67,0% en Silver
-- Tempest, 46,1% en Paldean Fates y del 96,7% al 98,3% en los seis sets con
-- ACE SPEC.
--
-- SE RETIRAN, NO SE BORRAN, las que tengan aperturas: `pack_openings` apunta a
-- `pack_templates` con ON DELETE RESTRICT, y un DELETE a medias deja plantillas
-- vivas y sin slots (P-035). Quitarles la ventana basta para que dejen de
-- elegirse: sin `set_id`, sin ventana y con `is_default = 0` no encajan en
-- ninguna rama de `findTemplate`.
--
-- OJO: el filtro es por las ventanas de ESTA migracion. Las de la 0012
-- -- Mega Evolution y Black Bolt / White Flare -- no se tocan.
-- =====================================================================

DELETE FROM pack_slots
 WHERE pack_template_id IN (
   SELECT id FROM (
     SELECT id FROM pack_templates
      WHERE game_id = 3 AND (valid_to = '2023-03-30' OR valid_to = '2024-01-26')
   ) AS t
 );

DELETE FROM pack_templates
 WHERE game_id = 3
   AND (valid_to = '2023-03-30' OR valid_to = '2024-01-26')
   AND id NOT IN (SELECT DISTINCT pack_template_id FROM pack_openings);

UPDATE pack_templates
   SET valid_from = NULL,
       valid_to   = NULL,
       name       = CONCAT(name, ' (retirada)')
 WHERE game_id = 3 AND (valid_to = '2023-03-30' OR valid_to = '2024-01-26');

-- El slot 9 de la generica vuelve a los pesos anteriores a las ACE SPEC.
UPDATE pack_slots
   SET distribution = '[{"rarity":"rare","weight":400},{"rarity":"rare_holo","weight":267},{"rarity":"double_rare","weight":143},{"rarity":"illustration_rare","weight":75},{"rarity":"ultra_rare","weight":67},{"rarity":"special_illustration_rare","weight":30},{"rarity":"hyper_rare","weight":18}]'
 WHERE slot_index = 9
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 3 AND set_id IS NULL AND is_default = 1
          AND valid_from IS NULL AND valid_to IS NULL
     ) AS t
   );
