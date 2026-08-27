-- =====================================================================
-- ProyectoTCG - Migracion 0020 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- La linea de producto de cada set y de cada plantilla. Con ella se van las seis
-- plantillas de la 0021 -- hay que deshacer esa PRIMERO -- y vuelven los 80 sets
-- con cartas inalcanzables.
--
-- Los tres grados de Duel Terminal y `starfoil` vuelven al tier 50 en el que los
-- dejo `ensureRarity`. Las filas NO se borran: las pusieron los datos
-- ingestados, no esta migracion, y borrarlas dejaria impresiones apuntando a una
-- rareza inexistente.
-- =====================================================================

ALTER TABLE pack_templates DROP COLUMN product_line;
ALTER TABLE sets DROP COLUMN product_line;

UPDATE rarities SET tier = 50
 WHERE game_id = 2 AND code IN (
   'duel_terminal_rare_parallel_rare','duel_terminal_super_parallel_rare',
   'duel_terminal_ultra_parallel_rare','starfoil');
