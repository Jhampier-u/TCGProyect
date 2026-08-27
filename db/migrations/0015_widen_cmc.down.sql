-- =====================================================================
-- ProyectoTCG - Migracion 0015 - ROLLBACK
-- =====================================================================
-- CUIDADO: ESTE ROLLBACK PUEDE FALLAR, Y ES CORRECTO QUE FALLE
--
-- Volver a `DECIMAL(4,1)` obliga a MySQL a recalcular la columna generada para
-- TODAS las filas. Si alguna carta tiene un cmc por encima de 999,9 -- y en
-- cuanto se ingesten los Un-sets las habra, con 1.000.000 -- el ALTER se niega
-- con el mismo error 1264 que motivo la migracion.
--
-- No se "arregla" truncando: perder el dato para poder deshacer un cambio de
-- tipo seria cambiar un problema visible por uno silencioso.
--
-- Para deshacerlo de verdad hay que borrar antes esas cartas, y eso es una
-- decision consciente, no algo que este fichero deba hacer por su cuenta:
--
--   SELECT id, name FROM cards WHERE cmc > 999.9;
-- =====================================================================

ALTER TABLE cards
  MODIFY COLUMN cmc DECIMAL(4,1) GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.cmc')) IN ('INTEGER','DOUBLE','DECIMAL')
         THEN CAST(JSON_EXTRACT(game_data, '$.cmc') AS DECIMAL(4,1)) END) STORED;
