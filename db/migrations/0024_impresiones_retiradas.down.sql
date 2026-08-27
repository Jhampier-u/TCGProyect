-- =====================================================================
-- ProyectoTCG - Migracion 0024 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- La marca de retirada. Las impresiones que el origen ya no lista vuelven a
-- contar en el pool de sobres y en la completitud, como si siguieran
-- existiendo: vuelve P-040.
--
-- No se pierde ninguna carta ni ninguna apertura: solo la memoria de cuales
-- dejaron de existir en el origen.
-- =====================================================================

DROP INDEX idx_prints_pool ON card_prints;
CREATE INDEX idx_prints_pool ON card_prints (set_id, rarity_id, in_boosters, id);

ALTER TABLE card_prints DROP COLUMN withdrawn_at;
