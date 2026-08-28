-- =====================================================================
-- ProyectoTCG - Migracion 0025 - Las tres epocas del sobre de Magic
-- Agente: Base de Datos - Tarea: T-084 - Sesion: S029
-- CIERRA el punto 3 de P-008
-- =====================================================================
-- QUE ESTABA MAL
--
-- Magic tenia UNA plantilla -- `Play Booster`, 14 cartas, 14 slots, sin ventana
-- de fechas -- y **208 sets abribles anteriores a 2018** resolvian a ella.
--
-- No era un error de rarezas: el vocabulario de Magic (common/uncommon/rare/
-- mythic) lleva treinta anos estable, y por eso una sola plantilla bastaba para
-- que todo fuera alcanzable (0016, T-077). Era un error de ESTRUCTURA. Un sobre
-- de 1995 eran 15 cartas sin foil; el Play Booster son 14 con un slot foil
-- garantizado y un comodin. Abrir `Tempest` entregaba un sobre de 2024.
--
-- LAS FRONTERAS NO SE ELIGIERON, SE MIDIERON
--
-- Las dos que importan estan en los datos, no en la memoria:
--
--   1. EL FOIL. Primera impresion foil del catalogo: `ulg` Urza's Legacy,
--      1999-02-15. Los 40 sets anteriores no tienen ni una. Medido con
--      JSON_CONTAINS sobre `card_prints.finishes`, set por set:
--
--        1998-10-12  usg  Urza's Saga      356 impresiones,   0 con foil
--        1999-02-15  ulg  Urza's Legacy    143 impresiones, 143 con foil
--
--   2. LA MITICA. Primera impresion `mythic` del catalogo: 2008-10-03, Shards
--      of Alara. Ni una antes, 2392 despues.
--
--   3. EL PLAY BOOSTER, 2024-02-09. Esta no sale de los datos -- es un cambio de
--      formato, no de vocabulario -- pero cae limpia entre dos sets: el ultimo
--      Draft Booster del catalogo es de 2024-01-12 y el primer Play Booster de
--      2024-02-09.
--
-- Reparto de los sets abribles, sin que ninguno caiga a caballo de dos:
--
--   1 clasico          40 sets   1993-08-05 .. 1998-11-01
--   2 foil, sin mitica 54        1999-02-15 .. 2008-09-22
--   3 Draft Booster   310        2008-10-03 .. 2024-01-12
--   4 Play Booster    115        2024-02-09 ..            (la que ya existia)
--
-- EL PLAY BOOSTER NO SE TOCA, y es deliberado. Sigue siendo la plantilla POR
-- DEFECTO del juego (`is_default = 1`, sin ventana), asi que un set sin fecha de
-- salida o posterior a 2024 sigue cayendo en ella. Mismo patron que Pokemon en
-- la 0018: las epocas se anaden, la moderna se queda de red. Ante la duda, la
-- estructura actual.
--
-- `special` Y `bonus` TIENEN QUE SEGUIR ALCANZABLES
--
-- Es el riesgo real de esta migracion. La 0016 (T-077) metio esas dos rarezas en
-- el slot 13 del Play Booster para arreglar nueve sets, y OCHO DE ESOS NUEVE son
-- anteriores a 2024: al darles su epoca dejarian de resolver a la plantilla que
-- los arreglaba y volverian a tener cartas inalcanzables. Medido uno a uno:
--
--   2006-10-06  tsb   121 special   -> epoca 2
--   2014-06-16  vma     9 bonus     -> epoca 3
--   2016-09-30  mps    54 special   -> epoca 3
--   2017-04-28  mp2    54 special   -> epoca 3
--   2020-09-26  plst    4 special   -> epoca 3
--   2020-11-20  cmr     1 special   -> epoca 3
--   2021-03-19  tsr   121 special   -> epoca 3
--   2022-06-10  clb     1 special   -> epoca 3
--   2023-08-04  cmm     1 special   -> epoca 3
--
-- Por eso la epoca 2 nombra `special` y la 3 nombra `special` y `bonus`. La
-- epoca 1 no nombra ninguna de las dos porque NINGUN set anterior a 1999 las
-- tiene, y una plantilla no debe pedir lo que no existe (T-070).
--
-- EL HUECO VARIABLE, que es como se modela lo que no cabe de otra forma
--
-- En las epocas 2 y 3 hay un slot que no es una comun normal. En el producto
-- real ese sitio lo ocupan tres cosas distintas que se turnan, y todas
-- SUSTITUYEN A UNA COMUN: la foil (desde 1999), la carta de inserto -- la
-- timeshifted de borde morado de Time Spiral, los Masterpiece -- y, desde 2008,
-- la tierra basica. Se modela como UN slot de comun con probabilidad de foil y
-- con las rarezas de inserto nombradas.
--
-- LA TIERRA SIGUE SIN PODER EXPRESARSE, y no lo tapa esta migracion: las tierras
-- basicas son rareza `common` en Scryfall, y distinguirlas exige filtrar por
-- `type_line`, que el pool no indexa. Es el punto 2 de P-008 y sigue abierto.
-- Aqui la tierra es una comun mas, igual que ya lo es en el Play Booster.
--
-- LOS NUMEROS, Y DE DONDE SALE CADA UNO
--
--   mitica 125 / rare 875   [OFICIAL] Wizards publica "1 de cada 8 sobres lleva
--                           una mitica" para el Draft Booster. 125/1000 = 1/8.
--                           El Play Booster usa 140 y se queda como esta: es
--                           otro producto y no lo toca esta migracion.
--
--   foil_chance 0.22        [ESTIMADO] derivado de un dato oficial: Wizards
--                           declaraba "aproximadamente 1 de cada 67 cartas es
--                           foil". Un sobre de 15 cartas -> 15/67 = 0,224.
--
--   special 15 / bonus 5    [ESTIMADO] los mismos pesos que la 0016 fijo para el
--                           Play Booster. No hay tasa publicada -- cada set con
--                           hoja de inserto tiene la suya -- y usar dos escalas
--                           distintas para lo mismo seria peor que usar una.
--
-- LO QUE ESTA MIGRACION SIMPLIFICA, DICHO
--
-- La epoca 3 son DIECISEIS ANOS con un solo `foil_chance`. La tasa real subio a
-- lo largo del periodo: el 1-de-cada-67 es de los primeros anos, y para 2020 los
-- sobres llevaban foil mucho mas a menudo. Se modela con un valor porque no hay
-- una serie publicada por bloque, y partir la epoca en trozos que no se pueden
-- justificar seria inventar precision. Si aparece el dato, es un UPDATE
-- (ADR-005): esa es toda la gracia de que los sobres sean datos.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Las tres plantillas. La cuarta -- Play Booster -- ya existe y es la
--    por defecto; no aparece aqui.
-- ---------------------------------------------------------------------
INSERT INTO pack_templates (game_id, set_id, valid_from, valid_to, name, card_count, is_default) VALUES
  (1, NULL, NULL,         '1999-02-14', 'Booster clasico (sin foil)',      15, 0),
  (1, NULL, '1999-02-15', '2008-10-02', 'Booster con foil (sin mitica)',   15, 0),
  (1, NULL, '2008-10-03', '2024-02-08', 'Draft Booster',                   15, 0);

-- ---------------------------------------------------------------------
-- 2. EPOCA 1 - clasico. 11 comunes, 3 infrecuentes, 1 rara. Sin foil en
--    ningun slot: no existia.
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"common","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND valid_to = '1999-02-14') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
        UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
        UNION SELECT 10) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"uncommon","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND valid_to = '1999-02-14') AS t
  JOIN (SELECT 11 AS idx UNION SELECT 12 UNION SELECT 13) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 14, '[{"rarity":"rare","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND valid_to = '1999-02-14') AS t;

-- ---------------------------------------------------------------------
-- 3. EPOCA 2 - foil desde Urza's Legacy, mitica todavia no. 10 comunes,
--    el hueco variable, 3 infrecuentes y 1 rara.
--    985 + 15 = 1000
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"common","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND valid_from = '1999-02-15') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
        UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 10, '[{"rarity":"common","weight":985},{"rarity":"special","weight":15}]', 0.22000
  FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND valid_from = '1999-02-15') AS t;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"uncommon","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND valid_from = '1999-02-15') AS t
  JOIN (SELECT 11 AS idx UNION SELECT 12 UNION SELECT 13) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 14, '[{"rarity":"rare","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND valid_from = '1999-02-15') AS t;

-- ---------------------------------------------------------------------
-- 4. EPOCA 3 - Draft Booster. Igual que la 2 mas la mitica en la rara y
--    `bonus` en el hueco variable.
--    980 + 15 + 5 = 1000    y    875 + 125 = 1000
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"common","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND valid_from = '2008-10-03') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
        UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 10,
       '[{"rarity":"common","weight":980},{"rarity":"special","weight":15},{"rarity":"bonus","weight":5}]',
       0.22000
  FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND valid_from = '2008-10-03') AS t;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"uncommon","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND valid_from = '2008-10-03') AS t
  JOIN (SELECT 11 AS idx UNION SELECT 12 UNION SELECT 13) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 14, '[{"rarity":"rare","weight":875},{"rarity":"mythic","weight":125}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 1 AND valid_from = '2008-10-03') AS t;
