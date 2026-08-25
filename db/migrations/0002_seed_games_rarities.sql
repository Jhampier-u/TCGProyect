-- =====================================================================
-- ProyectoTCG - Migracion 0002 - Seeds de games y rarities
-- Agente: Base de Datos - Tarea: T-007 - Sesion: S003
-- =====================================================================
-- IDEMPOTENTE: se puede re-ejecutar sin duplicar (ON DUPLICATE KEY UPDATE
-- sobre las claves naturales uq_games_code y uq_rarities_game_code).
--
-- CONVENCION CRITICA para los adaptadores (ADR-003):
--   code  = clave normalizada snake_case. Es lo que usa el codigo.
--   label = cadena EXACTA tal como la devuelve la API de origen.
-- El adaptador normaliza la cadena de la API -> code. Si al ingestar aparece
-- una rareza desconocida, NO se descarta la carta: se inserta la rareza al
-- vuelo con tier=50 y se registra un aviso. Ver la nota sobre datos sucios
-- de YGOPRODeck al final de este fichero.
--
-- tier = orden de escasez ascendente (1 = mas comun). Lo usa la UI para
-- ordenar y el motor de sobres para identificar el "hit" del sobre.
-- =====================================================================

USE proyecto_tcg;

-- ---------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------
INSERT INTO games (id, code, name, source_api) VALUES
  (1, 'MTG',  'Magic: The Gathering', 'scryfall'),
  (2, 'YGO',  'Yu-Gi-Oh!',            'ygoprodeck'),
  (3, 'PTCG', 'Pokemon TCG',          'pokemontcg')
ON DUPLICATE KEY UPDATE name = VALUES(name), source_api = VALUES(source_api);

-- ---------------------------------------------------------------------
-- rarities MTG (game_id = 1)
-- Vocabulario CERRADO de Scryfall. Verificado el 2026-08-25 consultando
-- api.scryfall.com/cards/search?q=rarity:X para cada valor:
--   common 11348 | uncommon 11117 | rare 11775 | mythic 2827
--   special 347  | bonus 9
-- Son exactamente estos seis. No hay mas.
-- 'special' y 'bonus' no estan en la escalera de escasez normal (son cartas
-- de productos especiales), por eso van al final de los tiers.
-- ---------------------------------------------------------------------
INSERT INTO rarities (game_id, code, label, tier) VALUES
  (1, 'common',   'common',   1),
  (1, 'uncommon', 'uncommon', 2),
  (1, 'rare',     'rare',     3),
  (1, 'mythic',   'mythic',   4),
  (1, 'special',  'special',  5),
  (1, 'bonus',    'bonus',    6)
ON DUPLICATE KEY UPDATE label = VALUES(label), tier = VALUES(tier);

-- ---------------------------------------------------------------------
-- rarities YGO (game_id = 2)
-- Lista CURADA: YGOPRODeck no publica un enum de rarezas, las devuelve como
-- texto libre dentro de card_sets[].set_rarity. Se han cubierto las rarezas
-- del TCG que aparecen en sets modernos y clasicos.
-- Muestreo real sobre el set "Supreme Darkness" (2026-08-25) devolvio:
--   Common 55 | Super Rare 34 | Ultra Rare 33 | Quarter Century Secret Rare 25
--   Secret Rare 21 | Starlight Rare 8 | Collector's Rare 3 | Ultimate Rare 3
-- ---------------------------------------------------------------------
INSERT INTO rarities (game_id, code, label, tier) VALUES
  (2, 'common',                      'Common',                       1),
  (2, 'short_print',                 'Short Print',                  2),
  (2, 'super_short_print',           'Super Short Print',            3),
  (2, 'rare',                        'Rare',                         4),
  (2, 'super_rare',                  'Super Rare',                   5),
  (2, 'ultra_rare',                  'Ultra Rare',                   6),
  (2, 'ultimate_rare',               'Ultimate Rare',                7),
  (2, 'secret_rare',                 'Secret Rare',                  8),
  (2, 'prismatic_secret_rare',       'Prismatic Secret Rare',        9),
  (2, 'platinum_secret_rare',        'Platinum Secret Rare',        10),
  (2, 'quarter_century_secret_rare', 'Quarter Century Secret Rare', 11),
  (2, 'collectors_rare',             'Collector''s Rare',           12),
  (2, 'starlight_rare',              'Starlight Rare',              13),
  (2, 'ghost_rare',                  'Ghost Rare',                  14),
  (2, 'gold_rare',                   'Gold Rare',                    5),
  (2, 'gold_secret_rare',            'Gold Secret Rare',             8),
  (2, 'premium_gold_rare',           'Premium Gold Rare',            8),
  (2, 'platinum_rare',               'Platinum Rare',                8),
  (2, 'mosaic_rare',                 'Mosaic Rare',                  5),
  (2, 'shatterfoil_rare',            'Shatterfoil Rare',             5),
  (2, 'starfoil_rare',               'Starfoil Rare',                5),
  (2, 'duel_terminal_normal_parallel_rare', 'Duel Terminal Normal Parallel Rare', 5)
ON DUPLICATE KEY UPDATE label = VALUES(label), tier = VALUES(tier);

-- ---------------------------------------------------------------------
-- rarities PTCG (game_id = 3)
-- Lista AUTORITATIVA Y COMPLETA: obtenida el 2026-08-25 del endpoint
-- oficial GET https://api.pokemontcg.io/v2/rarities -> 38 valores.
-- Los label son la cadena literal que devuelve la API, incluidos sus
-- caprichos de formato ('LEGEND' en mayusculas, 'MEGA_ATTACK_RARE' con
-- guiones bajos, 'Rare Holo LV.X' con punto).
-- ---------------------------------------------------------------------
INSERT INTO rarities (game_id, code, label, tier) VALUES
  (3, 'common',                    'Common',                     1),
  (3, 'uncommon',                  'Uncommon',                   2),
  (3, 'rare',                      'Rare',                       3),
  (3, 'rare_break',                'Rare BREAK',                 3),
  (3, 'rare_prime',                'Rare Prime',                 3),
  (3, 'rare_ace',                  'Rare ACE',                   3),
  (3, 'ace_spec_rare',             'ACE SPEC Rare',              3),
  (3, 'rare_holo',                 'Rare Holo',                  4),
  (3, 'rare_holo_lv_x',            'Rare Holo LV.X',             4),
  (3, 'rare_holo_star',            'Rare Holo Star',             4),
  (3, 'radiant_rare',              'Radiant Rare',               4),
  (3, 'amazing_rare',              'Amazing Rare',               4),
  (3, 'rare_prism_star',           'Rare Prism Star',            4),
  (3, 'trainer_gallery_rare_holo', 'Trainer Gallery Rare Holo',  4),
  (3, 'black_white_rare',          'Black White Rare',           4),
  (3, 'classic_collection',        'Classic Collection',         4),
  (3, 'double_rare',               'Double Rare',                5),
  (3, 'rare_holo_ex',              'Rare Holo EX',               5),
  (3, 'rare_holo_gx',              'Rare Holo GX',               5),
  (3, 'rare_holo_v',               'Rare Holo V',                5),
  (3, 'rare_holo_vmax',            'Rare Holo VMAX',             5),
  (3, 'rare_holo_vstar',           'Rare Holo VSTAR',            5),
  (3, 'ultra_rare',                'Ultra Rare',                 6),
  (3, 'rare_ultra',                'Rare Ultra',                 6),
  (3, 'rare_shining',              'Rare Shining',               6),
  (3, 'rare_shiny',                'Rare Shiny',                 6),
  (3, 'rare_shiny_gx',             'Rare Shiny GX',              6),
  (3, 'shiny_rare',                'Shiny Rare',                 6),
  (3, 'shiny_ultra_rare',          'Shiny Ultra Rare',           6),
  (3, 'legend',                    'LEGEND',                     6),
  (3, 'illustration_rare',         'Illustration Rare',          7),
  (3, 'rare_secret',               'Rare Secret',                8),
  (3, 'rare_rainbow',              'Rare Rainbow',               8),
  (3, 'hyper_rare',                'Hyper Rare',                 8),
  (3, 'mega_hyper_rare',           'Mega Hyper Rare',            8),
  (3, 'mega_attack_rare',          'MEGA_ATTACK_RARE',           8),
  (3, 'special_illustration_rare', 'Special Illustration Rare',  9),
  (3, 'promo',                     'Promo',                     50)
ON DUPLICATE KEY UPDATE label = VALUES(label), tier = VALUES(tier);

-- =====================================================================
-- NOTA PARA EL ADAPTADOR DE YGO (ver P-007)
-- =====================================================================
-- El muestreo real de YGOPRODeck del 2026-08-25 devolvio valores de
-- set_rarity CORRUPTOS junto a los correctos:
--   "PLatinum Secret Rare"  <- errata de mayusculas en el origen
--   "2", "3"                <- numeros sueltos, no son rarezas
--
-- Por eso YgoprodeckAdapter (T-012) DEBE:
--   1. Normalizar agresivamente: minusculas, quitar acentos y apostrofos,
--      colapsar espacios -> snake_case. Asi "PLatinum Secret Rare" cae
--      correctamente en 'platinum_secret_rare'.
--   2. Descartar valores puramente numericos o vacios y usar 'common'
--      como rareza de respaldo, dejando constancia en el log.
--   3. Ante cualquier otra rareza desconocida, insertarla al vuelo con
--      tier = 50 en lugar de perder la carta.
-- =====================================================================
