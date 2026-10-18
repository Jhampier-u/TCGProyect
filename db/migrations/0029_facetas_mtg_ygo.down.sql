-- =====================================================================
-- ProyectoTCG - Migracion 0029 - ROLLBACK
-- =====================================================================
-- No se pierde ningun dato: las cinco columnas son generadas y se recalculan
-- enteras desde `type_line` y `game_data` al volver a aplicar. Los filtros de
-- Magic y Yu-Gi-Oh! vuelven a escanear. Primero los indices, despues las
-- columnas: MySQL rechaza borrar una columna que un indice aun usa.
-- `idx_cards_level` no toca ninguna columna nueva, pero se va con la migracion
-- que lo creo.
-- =====================================================================

DROP INDEX idx_cards_level       ON cards;
DROP INDEX idx_cards_link_val    ON cards;
DROP INDEX idx_cards_attribute   ON cards;
DROP INDEX idx_cards_color_count ON cards;
DROP INDEX idx_cards_frame       ON cards;
DROP INDEX idx_cards_kind        ON cards;

ALTER TABLE cards
  DROP COLUMN link_val,
  DROP COLUMN attribute,
  DROP COLUMN color_count,
  DROP COLUMN frame,
  DROP COLUMN kind;
