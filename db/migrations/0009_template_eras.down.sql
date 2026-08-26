-- =====================================================================
-- ProyectoTCG - Migracion 0009 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- La ventana de vigencia. Las plantillas de epoca que la 0010 inserta dejarian
-- de poder distinguirse de la generica, asi que esta migracion NO se puede
-- deshacer sin deshacer antes la 0010 y la 0011.
-- =====================================================================

ALTER TABLE pack_templates
  DROP COLUMN valid_to,
  DROP COLUMN valid_from;
