-- =====================================================================
-- ProyectoTCG - Migracion 0007 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- El recuento de intentos fallidos. Las impresiones siguen sin imagen, asi que
-- volveran a la cola del job y se reintentaran desde cero: las que estaban
-- agotadas vuelven a pedirse al origen en cada ejecucion, que es exactamente el
-- comportamiento que T-019 corrigio.
--
-- No se pierde ninguna imagen ni ninguna fila: solo la memoria de lo que ya se
-- intento.
-- =====================================================================

ALTER TABLE card_prints
  DROP COLUMN image_failed_at,
  DROP COLUMN image_fail_count;
