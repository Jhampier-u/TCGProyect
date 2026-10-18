-- =====================================================================
-- ProyectoTCG - Migracion 0029 - Las facetas de Magic y de Yu-Gi-Oh!
-- Agente: Base de Datos - Tarea: T-109 - Sesion: S038
-- =====================================================================
-- QUE FALTA HOY
--
-- El catalogo de Magic se navega por color, tipo y coste, y el de Yu-Gi-Oh!
-- por clase, marco, atributo, nivel y link (spec H9f). El coste (`cmc`) y el
-- nivel (`lvl`) ya son columnas generadas desde la 0001; el color concreto
-- usa el indice multivaluado de la 0001. Lo demas vive en `type_line` o en
-- `game_data`, sin indice.
--
-- MISMO PATRON QUE LA 0027: columnas STORED con su guardian de tipo, e indice
-- (game_id, columna, name, id). Lo que cambia es la guarda.
--
-- LA GUARDA NO ES `game_id`, Y NO PUEDE SERLO
--
-- `type_line` es comun a los tres juegos: sin guarda, una carta de Pokemon
-- "Trainer - Item" tendria tipo de Magic "other". La guarda natural seria
-- `game_id`, pero `cards.game_id` es la base de `fk_cards_game ... ON UPDATE
-- CASCADE`, y MySQL no admite columnas STORED generadas sobre la base de una
-- clave ajena con CASCADE. Se guarda con la clave JSON EXCLUSIVA de cada
-- juego. Medido el 2026-10-18 sobre el catalogo entero:
--
--   clave            MTG       YGO      PTCG
--   legalities    38.606         0         0     (de 38.606 de Magic)
--   race               0    14.104         0     (de 14.104 de Yu-Gi-Oh!)
--
-- Cero colisiones y cobertura completa. `color_count` lleva la misma guarda:
-- sin ella valdria 0 -- "incolora" -- en Yu-Gi-Oh! y en Pokemon.
--
-- `kind` (MAGIC): EL TIPO PRINCIPAL DE LA PRIMERA CARA
--
-- Lo que va antes de ' // ', por prioridad: criatura > planeswalker > tierra >
-- artefacto > encantamiento > instantaneo > conjuro > batalla > otra. Medido:
-- creature 20.002, instant 3.872, sorcery 3.645, enchantment 3.583,
-- other 3.320, artifact 2.623, land 1.190, planeswalker 332, battle 39.
--
-- "other" incluye los 2.274 reversos "Card // Card" y los 401 "Card" de
-- Scryfall (sin tipos, sin colores, coste 0), y los planos, esquemas y
-- Vanguard. La faceta de coste las aparta y no cuentan como incoloras (F-5).
-- Una carta queda mal: "Token Artifact - Lander" casa con '%Land%'. Se acepta.
--
-- `kind` (YU-GI-OH!) Y `frame`
--
-- La clase: skill 123, token 19, monster 9.098, spell 2.812, trap 2.052.
-- "Skill" va primero por prefijo: su type_line lleva el nombre de un
-- personaje detras ("Skill - Kaiba"). El marco, solo de monstruos y fichas,
-- por prioridad: link > xyz > synchro > fusion > ritual > pendulum > effect >
-- normal. Medido: effect 5.873, xyz 596, fusion 578, normal 551,
-- synchro 531, link 468, pendulum 352, ritual 149, token 19.
--
-- `attribute` y `link_val` siguen el patron de la 0027 sin guarda extra: sus
-- claves solo existen en Yu-Gi-Oh! (0 colisiones medidas).
--
-- EL NIVEL USA `lvl`, QUE NO TENIA INDICE. Se llama `idx_cards_level` y no
-- `idx_cards_lvl` a proposito: la base de desarrollo trae un `idx_cards_lvl`
-- de una migracion que no esta en el repositorio, y el nombre chocaria. Si
-- existe, MySQL avisa de indice duplicado (1831) y sigue.
--
-- COSTE. STORED reescribe `cards` (73.144 filas). Se mide al aplicar.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

ALTER TABLE cards
  ADD COLUMN kind VARCHAR(16) GENERATED ALWAYS AS (
    CASE
      WHEN JSON_CONTAINS_PATH(game_data, 'one', '$.legalities') THEN
        CASE
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Creature%' THEN 'creature'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Planeswalker%' THEN 'planeswalker'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Land%' THEN 'land'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Artifact%' THEN 'artifact'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Enchantment%' THEN 'enchantment'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Instant%' THEN 'instant'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Sorcery%' THEN 'sorcery'
          WHEN SUBSTRING_INDEX(type_line, ' // ', 1) LIKE '%Battle%' THEN 'battle'
          ELSE 'other'
        END
      WHEN JSON_CONTAINS_PATH(game_data, 'one', '$.race') THEN
        CASE
          WHEN type_line LIKE 'Skill%' THEN 'skill'
          WHEN type_line = 'Token' THEN 'token'
          WHEN type_line LIKE '%Monster%' THEN 'monster'
          WHEN type_line LIKE '%Spell%' THEN 'spell'
          WHEN type_line LIKE '%Trap%' THEN 'trap'
        END
    END) STORED,

  ADD COLUMN frame VARCHAR(16) GENERATED ALWAYS AS (
    CASE WHEN JSON_CONTAINS_PATH(game_data, 'one', '$.race') THEN
      CASE
        WHEN type_line = 'Token' THEN 'token'
        WHEN type_line NOT LIKE '%Monster%' THEN NULL
        WHEN type_line LIKE '%Link%' THEN 'link'
        WHEN type_line LIKE '%Xyz%' THEN 'xyz'
        WHEN type_line LIKE '%Synchro%' THEN 'synchro'
        WHEN type_line LIKE '%Fusion%' THEN 'fusion'
        WHEN type_line LIKE '%Ritual%' THEN 'ritual'
        WHEN type_line LIKE '%Pendulum%' THEN 'pendulum'
        WHEN type_line LIKE '%Effect%' THEN 'effect'
        ELSE 'normal'
      END
    END) STORED,

  ADD COLUMN color_count TINYINT UNSIGNED GENERATED ALWAYS AS (
    CASE
      WHEN NOT JSON_CONTAINS_PATH(game_data, 'one', '$.legalities') THEN NULL
      WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.colors')) = 'ARRAY'
        THEN JSON_LENGTH(JSON_EXTRACT(game_data, '$.colors'))
      ELSE 0
    END) STORED,

  ADD COLUMN attribute VARCHAR(8) GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.attribute')) = 'STRING'
         THEN JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.attribute')) END) STORED,

  ADD COLUMN link_val TINYINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.link_val')) IN ('INTEGER','DOUBLE','DECIMAL')
         THEN CAST(JSON_EXTRACT(game_data, '$.link_val') AS UNSIGNED) END) STORED;

CREATE INDEX idx_cards_kind        ON cards (game_id, kind, name, id);
CREATE INDEX idx_cards_frame       ON cards (game_id, frame, name, id);
CREATE INDEX idx_cards_color_count ON cards (game_id, color_count, name, id);
CREATE INDEX idx_cards_attribute   ON cards (game_id, attribute, name, id);
CREATE INDEX idx_cards_link_val    ON cards (game_id, link_val, name, id);
CREATE INDEX idx_cards_level       ON cards (game_id, lvl, name, id);
