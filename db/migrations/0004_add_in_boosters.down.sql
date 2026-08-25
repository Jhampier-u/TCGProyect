-- =====================================================================
-- ProyectoTCG - Migracion 0004 - ROLLBACK
-- Devuelve el indice del pool a su forma original y elimina la columna.
-- =====================================================================
-- AVISO: ESTE ROLLBACK PIERDE DATOS.
--
-- Las filas de card_prints se conservan, pero el valor de in_boosters no: al
-- eliminar la columna desaparece, y si luego se vuelve a aplicar la 0004 todas
-- las impresiones quedan con DEFAULT 1, es decir, marcadas como de sobre.
-- Verificado: tras un ciclo down->up, 8221 de 8221 impresiones volvieron a 1.
--
-- Consecuencia practica: el simulador volveria a entregar promos como si
-- salieran de sobres, en silencio y sin ningun error. Despues de rehacer este
-- ciclo hay que RE-INGESTAR el catalogo de MTG para recuperar el dato real.
-- =====================================================================

USE proyecto_tcg;

ALTER TABLE card_prints
  DROP INDEX idx_prints_pool,
  ADD INDEX idx_prints_pool (set_id, rarity_id, id);

ALTER TABLE card_prints
  DROP COLUMN in_boosters;
