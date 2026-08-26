-- =====================================================================
-- ProyectoTCG - Migracion 0013 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- La clasificacion de que set es un producto de sobres. Vuelven a poder abrirse
-- las cajas de Structure Decks, los promocionales y los 937 sets del catalogo
-- que declaran menos cartas de las que lleva un solo sobre de su juego (P-033).
--
-- No se pierde nada mas: la columna se recalcula entera en la siguiente ingesta.
-- =====================================================================

ALTER TABLE sets
  DROP COLUMN is_openable;
