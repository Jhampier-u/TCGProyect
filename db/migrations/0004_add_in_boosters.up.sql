-- =====================================================================
-- ProyectoTCG - Migracion 0004 - card_prints.in_boosters
-- Agente: Base de Datos - Tarea: T-018 - Sesion: S008
-- CORRIGE P-014
-- =====================================================================
-- POR QUE ESTA MIGRACION EXISTE
--
-- Scryfall marca cada impresion con un booleano `booster`, que vale false en
-- las cartas que NUNCA se obtienen abriendo un sobre: promos, buy-a-box,
-- Secret Lair, art series, cartas de mazos preconstruidos, The List.
--
-- Medido sobre el volcado real: el 54,7% de las impresiones tiene booster=false.
-- Hay sets enteros al 100% (prm, sld, who).
--
-- Sin esta columna, el motor de sobres elige del pool (set_id, rarity_id) y
-- puede entregar una promo de Secret Lair como si hubiera salido de un sobre.
-- Las distribuciones de rareza serian fieles (P-003) pero las cartas no, que es
-- peor: un error creible es mas danino que uno evidente.
--
-- NOTA SOBRE EL METODO: se anade una migracion nueva en lugar de editar la 0001.
-- En S003 si se edito la 0001 (ampliar rarities.code) porque el proyecto no
-- tenia ni repositorio. Ahora las migraciones estan commiteadas y pueden
-- haberse aplicado, asi que pasan a ser inmutables.
-- =====================================================================

USE proyecto_tcg;

-- ---------------------------------------------------------------------
-- 1. La columna.
--
--    DEFAULT 1 (aparece en sobres) es el valor correcto por omision:
--      - MTG  : el adaptador escribe `raw.booster ?? true`.
--      - YGO  : YGOPRODeck no expone el dato por carta. Es correcto asumir true
--               porque en Yu-Gi-Oh! la distincion es POR SET: los Structure Deck
--               y los tins son sets aparte, no cartas marcadas dentro de un set
--               de sobres.
--      - PTCG : mismo caso que YGO.
--
--    Es decir: en MTG el dato es real; en los otros dos es una suposicion
--    razonada a nivel de set. Queda anotado para no confundir una cosa con otra.
-- ---------------------------------------------------------------------
ALTER TABLE card_prints
  ADD COLUMN in_boosters TINYINT(1) NOT NULL DEFAULT 1 AFTER rarity_id;

-- ---------------------------------------------------------------------
-- 2. Rehacer el indice del pool para que siga siendo COVERING.
--
--    El motor de sobres consulta:
--      SELECT id FROM card_prints
--      WHERE set_id=? AND rarity_id=? AND in_boosters=1
--
--    Con el indice antiguo (set_id, rarity_id, id) MySQL tendria que ir a la
--    tabla a comprobar in_boosters en cada fila, perdiendo el "Using index" que
--    hace que la precarga del pool sea barata.
--
--    El orden importa: las tres columnas de igualdad primero y el id al final.
--    Asi el indice sigue sirviendo tambien a las consultas que solo filtran por
--    (set_id, rarity_id) -- el catalogo y la coleccion -- usando el prefijo.
-- ---------------------------------------------------------------------
ALTER TABLE card_prints
  DROP INDEX idx_prints_pool,
  ADD INDEX idx_prints_pool (set_id, rarity_id, in_boosters, id);
