-- =====================================================================
-- ProyectoTCG - Migracion 0021 - Las seis lineas de producto de Yu-Gi-Oh!
-- Agente: Base de Datos - Tarea: T-080 - Sesion: S028
-- =====================================================================
-- Seis plantillas para las seis lineas que la 0020 hizo expresables. Cubren los
-- 80 sets que quedaban con cartas inalcanzables.
--
-- COMO SE ESTIMAN LOS PESOS
--
-- Misma regla que en la 0019 (Black Bolt / White Flare), que es la unica que se
-- puede decir en voz alta: **el slot se reparte en proporcion a lo que los sets
-- de esa linea TIENEN de cada rareza**. Si el 56% de las cartas de un Duel
-- Terminal son Normal Parallel Rare, un Duel Terminal entrega Normal Parallel
-- Rare la mayoria de las veces. Eso es lo que hace a cada linea lo que es.
--
-- No es una medicion del fabricante: ninguna de las seis publica sus tasas. Es
-- una estimacion con un metodo declarado, y si aparecen datos reales es un
-- UPDATE (ADR-005).
--
-- EL TAMANO DEL SOBRE tambien es [ESTIMADO] donde no se conoce: cinco cartas
-- para las lineas cortas y nueve para el Mega Pack, que es el unico que imita al
-- Core Booster. Lo que si es cierto y comprobable es que TODAS las rarezas de
-- cada linea pasan a ser alcanzables, que es lo que P-021 enseno a mirar.
--
-- Composicion medida sobre los sets ofrecidos de cada linea (impresiones):
--
--   Duel Terminal   normal_par 591 · rare_par 147 · common 143 · super_par 87 · ultra_par 86
--   Gold Series     gold 272 · rare 208 · common 160 · premium_gold 106 · gold_secret 93
--   Battle Pack     common 843 · starfoil 440 · shatterfoil 287 · mosaic 215 · rare 160 ...
--   Mega Pack       common 1564 · ultra 642 · prismatic_secret 390 · rare 310 · super 273 ...
--   Rarity Coll.    platinum_secret 787 · qcsr 716 · ultra 461 · ultimate 398 · collectors 397 ...
--   Legendary Duel. common 345 · super 105 · ultra 101 · rare 100 · qcsr 25 · secret 10
--
-- RARITY COLLECTION NO TIENE NI UNA COMUN: sus cinco slots salen todos del
-- extremo premium. Es el unico caso, y por eso su plantilla no se parece a
-- ninguna otra.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

INSERT INTO pack_templates (game_id, set_id, valid_from, valid_to, product_line, name, card_count, is_default) VALUES
  (2, NULL, NULL, NULL, 'duel_terminal',      'Duel Terminal',        5, 0),
  (2, NULL, NULL, NULL, 'gold_series',        'Gold Series',          5, 0),
  (2, NULL, NULL, NULL, 'battle_pack',        'Battle Pack',          5, 0),
  (2, NULL, NULL, NULL, 'mega_pack',          'Mega Pack',            9, 0),
  (2, NULL, NULL, NULL, 'rarity_collection',  'Rarity Collection',    5, 0),
  (2, NULL, NULL, NULL, 'legendary_duelists', 'Legendary Duelists',   5, 0);

-- ---------------------------------------------------------------------
-- DUEL TERMINAL. La maquina reparte 5 cartas y casi todas son parallel rare.
--   base  common 143 : normal_par 591        -> 195 / 805
--   hit   rare_par 147 : super_par 87 : ultra_par 86  -> 459 / 272 / 269
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"duel_terminal_normal_parallel_rare","weight":805},{"rarity":"common","weight":195}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'duel_terminal') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 4,
       '[{"rarity":"duel_terminal_rare_parallel_rare","weight":459},{"rarity":"duel_terminal_super_parallel_rare","weight":272},{"rarity":"duel_terminal_ultra_parallel_rare","weight":269}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'duel_terminal') AS t;

-- ---------------------------------------------------------------------
-- GOLD SERIES. Todo el producto es dorado: un slot de oro garantizado.
--   base  common 160 : rare 208              -> 435 / 565
--   oro   gold_rare                          -> 1000
--   hit   gold 272 : premium_gold 106 : gold_secret 93 -> 578 / 225 / 197
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"rare","weight":565},{"rarity":"common","weight":435}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'gold_series') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 3, '[{"rarity":"gold_rare","weight":1000}]', 1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'gold_series') AS t;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 4,
       '[{"rarity":"gold_rare","weight":578},{"rarity":"premium_gold_rare","weight":225},{"rarity":"gold_secret_rare","weight":197}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'gold_series') AS t;

-- ---------------------------------------------------------------------
-- BATTLE PACK. Sobres de draft: 4 cartas normales y 1 variante foil.
--   base  common 843 : rare 160 : super 69 : ultra 19 : secret 10
--         -> 766 / 145 / 63 / 17 / 9
--   foil  starfoil_rare 440 : shatterfoil 287 : mosaic 215 : starfoil 49 : starlight 25
--         -> 433 / 283 / 212 / 48 / 24
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"common","weight":766},{"rarity":"rare","weight":145},{"rarity":"super_rare","weight":63},{"rarity":"ultra_rare","weight":17},{"rarity":"secret_rare","weight":9}]',
       0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'battle_pack') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 4,
       '[{"rarity":"starfoil_rare","weight":433},{"rarity":"shatterfoil_rare","weight":283},{"rarity":"mosaic_rare","weight":212},{"rarity":"starfoil","weight":48},{"rarity":"starlight_rare","weight":24}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'battle_pack') AS t;

-- ---------------------------------------------------------------------
-- MEGA PACK. Es el que imita al Core Booster: 9 cartas, 7 comunes + rare + hit.
--   hit   super 273 : ultra 642 : prismatic 390 : secret 108 : qcsr 50 : starlight 50
--         -> 180 / 424 / 258 / 71 / 33 / 34
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"common","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'mega_pack') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 7, '[{"rarity":"rare","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'mega_pack') AS t;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 8,
       '[{"rarity":"ultra_rare","weight":424},{"rarity":"prismatic_secret_rare","weight":258},{"rarity":"super_rare","weight":180},{"rarity":"secret_rare","weight":71},{"rarity":"starlight_rare","weight":34},{"rarity":"quarter_century_secret_rare","weight":33}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'mega_pack') AS t;

-- ---------------------------------------------------------------------
-- RARITY COLLECTION. NI UNA COMUN en toda la linea: los cinco slots salen del
-- extremo premium, y el ultimo del extremo del extremo.
--   base  super 396 : ultra 461 : secret 396 : ultimate 398 -> 240 / 279 / 240 / 241
--   hit   platinum_secret 787 : qcsr 716 : collectors 397 : starlight 146
--         -> 385 / 350 / 194 / 71
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"ultra_rare","weight":279},{"rarity":"ultimate_rare","weight":241},{"rarity":"super_rare","weight":240},{"rarity":"secret_rare","weight":240}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'rarity_collection') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 4,
       '[{"rarity":"platinum_secret_rare","weight":385},{"rarity":"quarter_century_secret_rare","weight":350},{"rarity":"collectors_rare","weight":194},{"rarity":"starlight_rare","weight":71}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'rarity_collection') AS t;

-- ---------------------------------------------------------------------
-- LEGENDARY DUELISTS. 5 cartas: 3 comunes, 1 rare y 1 hit. Conserva el slot de
-- Rare que los Core Booster perdieron en 2020, que es por lo que estos sets
-- tenian `rare` inalcanzable.
--   hit   super 105 : ultra 101 : qcsr 25 : secret 10 -> 436 / 419 / 104 / 41
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"common","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'legendary_duelists') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 3, '[{"rarity":"rare","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'legendary_duelists') AS t;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 4,
       '[{"rarity":"super_rare","weight":436},{"rarity":"ultra_rare","weight":419},{"rarity":"quarter_century_secret_rare","weight":104},{"rarity":"secret_rare","weight":41}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'legendary_duelists') AS t;
