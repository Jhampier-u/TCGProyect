-- =====================================================================
-- ProyectoTCG - Migracion 0010 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- Las tres plantillas de epoca. Todos los sets de Yu-Gi-Oh! vuelven a resolver
-- a la generica, y con ella los sets anteriores a 2020 vuelven a topar su
-- completitud en el 70-76% (P-021).
--
-- No se pierde ninguna apertura: `pack_openings` guarda su propio
-- `template_snapshot` y no tiene clave foranea hacia `pack_slots` (P-005).
-- =====================================================================

DELETE FROM pack_slots
 WHERE pack_template_id IN (
   SELECT id FROM (
     SELECT id FROM pack_templates
      WHERE game_id = 2 AND (valid_from IS NOT NULL OR valid_to IS NOT NULL)
   ) AS t
 );

DELETE FROM pack_templates
 WHERE game_id = 2 AND (valid_from IS NOT NULL OR valid_to IS NOT NULL);
