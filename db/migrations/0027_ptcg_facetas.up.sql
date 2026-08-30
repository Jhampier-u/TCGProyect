-- =====================================================================
-- ProyectoTCG - Migracion 0027 - Las facetas por las que se navega Pokemon
-- Agente: Base de Datos - Tarea: T-091 - Sesion: S035
-- =====================================================================
-- QUE FALTA HOY
--
-- El catalogo de Pokemon se navega por tipo, por categoria y por marca de
-- regulacion, y las tres viven dentro de `cards.game_data`, que es JSON SIN
-- INDICE. Filtrar por ellas hoy es un escaneo completo de 20.434 cartas por
-- consulta, y con el rail de T-093 pulsando filtros eso pasa a ser el camino
-- caliente de la pantalla.
--
-- EL PATRON YA EXISTE Y SE SIGUE, NO SE INVENTA
--
-- `cmc`, `atk`, `def`, `lvl` y `hp` son columnas generadas STORED sobre ese
-- mismo JSON desde la 0001. Estas tres son las mismas cinco lineas con otra
-- clave. Lo unico que cambia es el guardian: donde las numericas comprueban
-- `JSON_TYPE(...) IN ('INTEGER','DOUBLE','DECIMAL')`, estas comprueban
-- `= 'STRING'`. Sin el, un origen que un dia devolviera un objeto ahi metria
-- basura entrecomillada en la columna.
--
-- NO LLEVAN FILTRO POR `game_id`, y es deliberado: tampoco lo llevan `cmc` ni
-- `atk`. La expresion se protege sola porque la clave solo existe en un juego.
-- Medido antes de escribirlo, sobre el catalogo entero:
--
--   clave              MTG     YGO     PTCG
--   supertype            0       0    20.434
--   types                0       0    17.261
--   regulation_mark      0       0     8.184
--
-- Cero colisiones. Anadir `game_id = 3` seria ruido que ademas rompe la
-- simetria con las cinco que ya estan.
--
-- LO QUE `types[0]` PIERDE, DICHO
--
-- `types` es un array y aqui se toma el PRIMERO. Medido: de 17.261 cartas con
-- tipo, 103 tienen dos -- el 0,6%. Esas 103 se pueden filtrar por su tipo
-- principal y no por el segundo.
--
-- Se acepta para v1 porque la alternativa es un indice multivaluado sobre el
-- array, que es la misma decision que `subtypes` tiene pendiente, y no merece
-- pagarse por seis cartas de cada mil. Si algun dia se hace, se hacen las dos a
-- la vez.
--
-- SUPERTYPE NO ES `type_line`. `cards.type_line` es la linea de tipo completa
-- que ensena la carta; `supertype` es la categoria de tres valores -- Pokemon,
-- Entrenador, Energia -- por la que se separa el catalogo. Por eso son dos
-- cosas y no una.
--
-- POR QUE LOS INDICES ACABAN EN `name, id`
--
-- Son las columnas del desempate de la paginacion keyset. Sin ellas, filtrar por
-- tipo obligaria a MySQL a ordenar en memoria el resultado entero antes de
-- devolver la primera pagina. Con ellas el indice ya viene ordenado y la
-- consulta no toca `filesort`. Se comprueba con `EXPLAIN` al aplicar, no se
-- supone.
--
-- COSTE. `STORED` reescribe la tabla: son 173.062 filas de `cards`. Se mide al
-- aplicar y queda apuntado en la bitacora.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

ALTER TABLE cards
  ADD COLUMN supertype VARCHAR(16) GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.supertype')) = 'STRING'
         THEN JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.supertype')) END) STORED,

  ADD COLUMN elem_type VARCHAR(16) GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.types[0]')) = 'STRING'
         THEN JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.types[0]')) END) STORED,

  ADD COLUMN reg_mark CHAR(1) GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.regulation_mark')) = 'STRING'
         THEN JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.regulation_mark')) END) STORED;

CREATE INDEX idx_cards_elem_type ON cards (game_id, elem_type, name, id);
CREATE INDEX idx_cards_supertype ON cards (game_id, supertype, name, id);
CREATE INDEX idx_cards_reg_mark  ON cards (game_id, reg_mark, name, id);
