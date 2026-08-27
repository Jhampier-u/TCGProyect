-- =====================================================================
-- ProyectoTCG - Migracion 0023 - La cola larga de Yu-Gi-Oh!
-- Agente: Base de Datos - Tarea: T-082 - Sesion: S028
-- =====================================================================
-- LOS 20 SETS QUE QUEDABAN, Y LA SORPRESA
--
-- Parecian veinte productos sueltos que necesitarian veinte plantillas propias.
-- Medidos uno a uno, casi ninguno la necesita: son las plantillas de LINEA a las
-- que les falta una rareza, mas cuatro sets que no son sobres.
--
--   ghost_rare               LED7, LED8, LED9, LD10   falta en legendary_duelists
--   secret_rare              HAC1                     falta en duel_terminal
--   dt_normal_rare_par_rare  DT07                     un quinto grado de Duel Terminal
--   ghost_gold_rare          GLD5                     falta en gold_series
--   common                   RA05                     una sola carta comun de 692
--   prismatic_secret_rare    WSUP                     falta en la epoca 2
--   ultra_rare_pharaohs_rare KICO, MAMA               falta en la generica
--   10000_secret_rare        BLAR                     una carta, falta en la generica
--   ultra_parallel_rare      TBC1                     idem
--
-- Los Mega Pack de lata (MP21, MP22, MP24) y las latas (TN19) se arreglan en el
-- CLASIFICADOR, no aqui: el problema no era la plantilla, era que sus nombres no
-- dicen lo que son.
--
-- SE SIEMBRAN CINCO RAREZAS que estaban en la base por descubrimiento, con el
-- tier 50 que les puso `ensureRarity`. Misma razon que en la 0011 y la 0020: el
-- tier ordena el respaldo del motor, y una plantilla no debe apoyarse en un
-- valor que llego por accidente.
--
-- LOS PESOS SON [ESTIMADO] y pequenos: todas estas rarezas aparecen una o dos
-- veces por set. Se anaden con peso bajo y se reescala lo que habia, para que
-- cada slot siga sumando 1000 sin deformar la linea.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Las cinco rarezas huerfanas, con un tier que significa algo.
-- ---------------------------------------------------------------------
INSERT INTO rarities (game_id, code, label, tier) VALUES
  (2, 'duel_terminal_normal_rare_parallel_rare', 'Duel Terminal Normal Rare Parallel Rare', 5),
  (2, 'ultra_parallel_rare',      'Ultra Parallel Rare', 6),
  (2, 'ghost_gold_rare',          'Ghost Gold Rare',     9),
  (2, 'ultra_rare_pharaohs_rare', 'Ultra Rare Pharaohs Rare', 11),
  (2, '10000_secret_rare',        '10000 Secret Rare',  13)
ON DUPLICATE KEY UPDATE label = VALUES(label), tier = VALUES(tier);

-- ---------------------------------------------------------------------
-- 2. Legendary Duelists: le faltaba la Ghost Rare.
--    436/419/104/41 reescalado por 0,995 -> 434/417/103/41 + ghost 5 = 1000
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":434},{"rarity":"ultra_rare","weight":417},{"rarity":"quarter_century_secret_rare","weight":103},{"rarity":"secret_rare","weight":41},{"rarity":"ghost_rare","weight":5}]'
 WHERE slot_index = 4
   AND pack_template_id = (SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'legendary_duelists') AS t);

-- ---------------------------------------------------------------------
-- 3. Duel Terminal: el quinto grado y la Secret Rare de Hidden Arsenal.
--    459/272/269 reescalado por 0,94 -> 431/256/253 + normal_rare_par 40 + secret 20
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"duel_terminal_rare_parallel_rare","weight":431},{"rarity":"duel_terminal_super_parallel_rare","weight":256},{"rarity":"duel_terminal_ultra_parallel_rare","weight":253},{"rarity":"duel_terminal_normal_rare_parallel_rare","weight":40},{"rarity":"secret_rare","weight":20}]'
 WHERE slot_index = 4
   AND pack_template_id = (SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'duel_terminal') AS t);

-- ---------------------------------------------------------------------
-- 4. Gold Series: la Ghost Gold Rare, 6 de las 55 de Haunted Mine.
--    578/225/197 reescalado por 0,94 -> 543/212/185 + ghost_gold 60 = 1000
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"gold_rare","weight":543},{"rarity":"premium_gold_rare","weight":212},{"rarity":"gold_secret_rare","weight":185},{"rarity":"ghost_gold_rare","weight":60}]'
 WHERE slot_index = 4
   AND pack_template_id = (SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'gold_series') AS t);

-- ---------------------------------------------------------------------
-- 5. Rarity Collection: UNA carta comun en RA05, de 692 impresiones.
--    279/241/240/240 reescalado por 0,99 -> 276/239/238/237 + common 10 = 1000
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"ultra_rare","weight":276},{"rarity":"ultimate_rare","weight":239},{"rarity":"super_rare","weight":238},{"rarity":"secret_rare","weight":237},{"rarity":"common","weight":10}]'
 WHERE slot_index < 4
   AND pack_template_id = (SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'rarity_collection') AS t);

-- ---------------------------------------------------------------------
-- 6. Movie Pack. Tres productos comparten el codigo MVP1 -- Movie Pack, Gold
--    Edition y Secret Edition -- y cada uno es de UNA sola rareza. Cinco cartas
--    del mismo nivel; el respaldo del motor entrega la que el set concreto
--    tenga, que es exactamente para lo que existe.
-- ---------------------------------------------------------------------
INSERT INTO pack_templates (game_id, set_id, valid_from, valid_to, product_line, name, card_count, is_default) VALUES
  (2, NULL, NULL, NULL, 'movie_pack', 'Movie Pack', 5, 0);

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"ultra_rare","weight":400},{"rarity":"secret_rare","weight":300},{"rarity":"gold_rare","weight":270},{"rarity":"gold_secret_rare","weight":30}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND product_line = 'movie_pack') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) AS s;

-- ---------------------------------------------------------------------
-- 7. Epoca 2 (2008-09-02 .. 2016-01-13): la Prismatic Secret de World
--    Superstars, 16 de sus 50 impresiones.
--    597/239/79/42/40/3 reescalado por 0,98 -> 585/234/77/41/39/3 + prismatic 21
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"common","weight":585},{"rarity":"super_rare","weight":234},{"rarity":"ultra_rare","weight":77},{"rarity":"ultimate_rare","weight":41},{"rarity":"secret_rare","weight":39},{"rarity":"prismatic_secret_rare","weight":21},{"rarity":"ghost_rare","weight":3}]'
 WHERE slot_index = 8
   AND pack_template_id = (SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2008-09-02') AS t);

-- ---------------------------------------------------------------------
-- 8. La generica: tres rarezas de una o dos cartas cada una.
--    627+140+67+60+39+37+15+3+3+3+3+2+1 = 1000
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":627},{"rarity":"ultra_rare","weight":140},{"rarity":"secret_rare","weight":67},{"rarity":"rare","weight":60},{"rarity":"ultimate_rare","weight":39},{"rarity":"quarter_century_secret_rare","weight":37},{"rarity":"collectors_rare","weight":15},{"rarity":"ultra_rare_pharaohs_rare","weight":3},{"rarity":"starlight_rare","weight":3},{"rarity":"grand_master_rare","weight":3},{"rarity":"ghost_rare","weight":3},{"rarity":"10000_secret_rare","weight":2},{"rarity":"ultra_parallel_rare","weight":1}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates WHERE game_id = 2 AND set_id IS NULL AND is_default = 1
         AND valid_from IS NULL AND valid_to IS NULL AND product_line IS NULL
     ) AS t
   );
