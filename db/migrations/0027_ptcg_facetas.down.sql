-- =====================================================================
-- ProyectoTCG - Migracion 0027 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- Los filtros de tipo, categoria y marca de regulacion vuelven a ser un escaneo
-- completo de `cards`. No se pierde NINGUN dato: las tres columnas son
-- generadas, asi que su contenido se recalcula entero desde `game_data` en
-- cuanto se vuelva a aplicar la migracion. Es la ventaja de derivar en vez de
-- copiar.
--
-- EL ORDEN IMPORTA. Primero los indices y despues las columnas: un indice sobre
-- una columna que ya no existe no se puede borrar, y MySQL rechaza el `ALTER`
-- entero si se intenta al reves.
--
-- ESTE ROLLBACK NO PUEDE FALLAR POR DATOS, a diferencia del de la 0015 -- que si
-- falla, y debe, si ya hay un coste de mana que no cabe en la columna estrecha.
-- Aqui solo se quita lo derivado.
-- =====================================================================

DROP INDEX idx_cards_reg_mark ON cards;
DROP INDEX idx_cards_supertype ON cards;
DROP INDEX idx_cards_elem_type ON cards;

ALTER TABLE cards
  DROP COLUMN reg_mark,
  DROP COLUMN elem_type,
  DROP COLUMN supertype;
