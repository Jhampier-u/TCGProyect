-- =====================================================================
-- ProyectoTCG - Migracion 0015 - cmc no cabia en DECIMAL(4,1)
-- Agente: Base de Datos - Tarea: T-076 - Sesion: S028
-- CORRIGE P-039
-- =====================================================================
-- COMO SALIO
--
-- La ingesta completa de Magic aborto a los 98 sets:
--
--   [MTG] abortado: Out of range value for column '(null)' at row 1
--
-- El nombre de columna vacio lo pone MySQL cuando el desbordamiento ocurre al
-- calcular una columna GENERADA, y ahi estaba: `cmc DECIMAL(4,1)` topa en 999,9.
--
-- EL DATO NO ESTA MAL, LA COLUMNA ESTA ESTRECHA. Magic tiene cartas con coste
-- de mana de 1.000.000 -- las de los Un-sets, `Gleemax` entre ellas -- y los
-- cuatro sets que las traen (unh, ust, und, unf) estaban en la cola. El maximo
-- que habia entrado hasta ahora era 16.
--
-- Reproducido antes de tocar nada, con el mismo mensaje:
--
--   CREATE TABLE t (game_data JSON, cmc DECIMAL(4,1) GENERATED ALWAYS AS (...));
--   INSERT INTO t VALUES ('{"cmc": 16}');       -- entra
--   INSERT INTO t VALUES ('{"cmc": 1000000}');  -- ERROR 1264 (22003)
--
-- Un `SELECT ... CAST(1000000 AS DECIMAL(4,1))` solo TRUNCA a 999,9 con un
-- aviso; es el INSERT en modo estricto el que lo convierte en error. Por eso no
-- se veia venir leyendo el esquema.
--
-- POR QUE DECIMAL(9,1) Y NO OTRA COSA
--
-- Cabe hasta 99.999.999,9, que deja sitio de sobra por encima del millon sin
-- irse a un tipo mayor. Se conservan los decimales porque el coste convertido de
-- Magic los usa de verdad: las cartas con mitad de mana (`{1/2}`) tienen cmc
-- 0,5.
--
-- HAY QUE REPETIR LA EXPRESION ENTERA. Un MODIFY sobre una columna generada
-- exige volver a declarar como se calcula; omitirla la convertiria en una
-- columna normal y vacia. Y como `cmc` esta en `idx_cards_game_cmc`, MySQL
-- rehace ese indice: en una tabla de decenas de miles de filas es inmediato.
--
-- NO LLEVA `USE`: desde la 0007 (P-032), y desde T-065 el migrador lo retiraria.
-- =====================================================================

ALTER TABLE cards
  MODIFY COLUMN cmc DECIMAL(9,1) GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.cmc')) IN ('INTEGER','DOUBLE','DECIMAL')
         THEN CAST(JSON_EXTRACT(game_data, '$.cmc') AS DECIMAL(9,1)) END) STORED;
