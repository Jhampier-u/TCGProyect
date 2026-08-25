-- =====================================================================
-- ProyectoTCG - Migracion 0005 - ROLLBACK
-- =====================================================================
-- AVISO: este rollback FALLA si ya hay sets de Yu-Gi-Oh! ingestados.
--
-- 16 de sus nombres superan los 64 caracteres, asi que MySQL rechazara el
-- MODIFY con error 1406 en lugar de truncar en silencio. Es el comportamiento
-- deseado: perder la clave natural de 16 sets seria peor que no poder deshacer.
-- Para revertir de verdad habria que borrar antes esos sets.
-- =====================================================================

USE proyecto_tcg;

ALTER TABLE sets
  MODIFY COLUMN external_id VARCHAR(64) NOT NULL;
