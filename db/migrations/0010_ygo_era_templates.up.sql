-- =====================================================================
-- ProyectoTCG - Migracion 0010 - Las tres epocas antiguas de Yu-Gi-Oh!
-- Agente: Base de Datos - Tarea: T-034 - Sesion: S028
-- CORRIGE P-021
-- =====================================================================
-- LA TABLA DE COMPOSICION POR EPOCA (Yugipedia)
--
-- Ya estaba capturada en la cabecera de la 0006. Los cortes se han verificado
-- contra las fechas del catalogo: LOB 2002-03-08, TDGS 2008-09-02,
-- BOSH 2016-01-14, ETCO 2020-04-30.
--
--   EPOCA 1  ... 2008-09-01   8 comunes + 1 (Secret 1/24, Ultra 1/12,
--                                            Super 1/4, resto RARE)
--   EPOCA 2  2008-09-02 .. 2016-01-13
--                             7 comunes + 1 RARE + 1 (Secret 1/24, Ultra 1/12,
--                                            Super 1/4, resto Common)
--   EPOCA 3  2016-01-14 .. 2020-04-29
--                             7 comunes + 1 RARE + 1 (Secret 1/12, Ultra 1/6,
--                                            resto Super)
--   EPOCA 4  2020-04-30 ..    es la generica del juego, no se toca aqui
--
-- La epoca 1 lleva `valid_from` nulo para cubrir tambien los promos anteriores
-- a 2002 (SDY 2001-01-01 en el catalogo).
--
-- LAS RAREZAS QUE LA TABLA OFICIAL NO MENCIONA
--
-- Yugipedia documenta los slots, no cada rareza que un set puede traer. Medido
-- sobre el catalogo, quedaban fuera: short_print y super_short_print (LOB, BOSH)
-- y las paralelas ultimate_rare y ghost_rare (TDGS). Una rareza que ninguna slot
-- nombra es INALCANZABLE: el respaldo del motor solo actua cuando la rareza
-- PEDIDA esta vacia, nunca anade una que no se haya pedido.
--
-- Entran en el slot que les toca por naturaleza. Los short prints son Comunes
-- impresas en menor cantidad, no un slot aparte, asi que van con las comunes;
-- las paralelas sustituyen ocasionalmente a la carta del slot superior, asi que
-- van en el hit.
--
-- SUS PESOS SON [ESTIMADO]. No hay tasa publicada para ninguna de las cuatro.
-- Se eligen para que la rareza sea alcanzable sin deformar el slot, y van
-- marcados uno a uno abajo. Es exactamente lo que se hizo con la QCSR en la
-- 0006 y por el mismo motivo: ADR-005 hizo esto configurable por datos para que
-- afinar la fidelidad sea un UPDATE, no un despliegue.
--
-- LAS APERTURAS YA REALIZADAS NO SE VEN AFECTADAS: `pack_openings` guarda
-- `template_snapshot` y la reproduccion lee `pack_opening_cards` (P-005).
--
-- NO LLEVA `USE`: ver la cabecera de la 0007 (P-032).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Las tres plantillas. `is_default = 0` a proposito: el indice
-- `uq_templates_one_default` solo admite una por (juego, set), y la generica ya
-- la ocupa. Se eligen por ventana, no por bandera.
-- ---------------------------------------------------------------------
INSERT INTO pack_templates (game_id, set_id, valid_from, valid_to, name, card_count, is_default) VALUES
  (2, NULL, NULL,         '2008-09-01', 'Core Booster (hasta Light of Destruction)', 9, 0),
  (2, NULL, '2008-09-02', '2016-01-13', 'Core Booster (Duelist Genesis - Dimension of Chaos)', 9, 0),
  (2, NULL, '2016-01-14', '2020-04-29', 'Core Booster (Breakers of Shadow - Ignition Assault)', 9, 0);

-- ---------------------------------------------------------------------
-- EPOCA 1: 8 comunes + 1 hit.
--
-- Comunes [ESTIMADO en la reparticion interna]:
--     common             900
--     short_print         90   (~1 de cada 11 comunes)
--     super_short_print   10   (~1 de cada 100)
--   El slot sigue siendo "una comun": lo estimado es COMO se reparte por dentro.
--   En un set sin short prints, el respaldo del motor entrega una common, que es
--   justo lo correcto.
--
-- Hit [OFICIAL, Yugipedia]:
--     Secret 1/24 =  42
--     Ultra  1/12 =  83
--     Super  1/4  = 250
--     resto Rare  = 625
--     -------------------
--                   1000
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"common","weight":900},{"rarity":"short_print","weight":90},{"rarity":"super_short_print","weight":10}]',
       0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_to = '2008-09-01') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 8,
       '[{"rarity":"rare","weight":625},{"rarity":"super_rare","weight":250},{"rarity":"ultra_rare","weight":83},{"rarity":"secret_rare","weight":42}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_to = '2008-09-01') AS t;

-- ---------------------------------------------------------------------
-- EPOCA 2: 7 comunes + 1 Rare + 1 hit.
--
-- Comunes [ESTIMADO en la reparticion interna]: common 950 / short_print 50.
--
-- Hit: base [OFICIAL] Secret 42, Ultra 83, Super 250, resto Common 625.
--   A eso se anaden [ESTIMADO] las paralelas de la epoca:
--     ultimate_rare  42   (~1 por caja de 24)
--     ghost_rare      3   (~1 por caja de 12 cajas)
--   Total estimado 45, y los oficiales se reescalan por (1000-45)/1000 = 0,955
--   para que el slot siga sumando 1000:
--     secret 42*0,955 =  40
--     ultra  83*0,955 =  79
--     super 250*0,955 = 239
--     common 625*0,955= 597
--     -----------------------
--     40+79+239+597+42+3 = 1000
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"common","weight":950},{"rarity":"short_print","weight":50}]',
       0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2008-09-02') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 7, '[{"rarity":"rare","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2008-09-02') AS t;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 8,
       '[{"rarity":"common","weight":597},{"rarity":"super_rare","weight":239},{"rarity":"ultra_rare","weight":79},{"rarity":"ultimate_rare","weight":42},{"rarity":"secret_rare","weight":40},{"rarity":"ghost_rare","weight":3}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2008-09-02') AS t;

-- ---------------------------------------------------------------------
-- EPOCA 3: 7 comunes + 1 Rare + 1 hit.
--
-- Comunes [ESTIMADO en la reparticion interna]: common 950 / short_print 50.
--
-- Hit: base [OFICIAL] Secret 1/12 = 83, Ultra 1/6 = 167, resto Super = 750.
--   La Starlight Rare aparecio con Ignition Assault (2020-01-30), que cae DENTRO
--   de esta epoca, asi que entra aqui tambien:
--     starlight_rare  3   [ESTIMADO] ~1 por caja de 12 cajas
--   Reescalado por (1000-3)/1000 = 0,997:
--     secret  83*0,997 =  83
--     ultra  167*0,997 = 166
--     super  750*0,997 = 748
--     -----------------------
--     83+166+748+3 = 1000
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"common","weight":950},{"rarity":"short_print","weight":50}]',
       0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2016-01-14') AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 7, '[{"rarity":"rare","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2016-01-14') AS t;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 8,
       '[{"rarity":"super_rare","weight":748},{"rarity":"ultra_rare","weight":166},{"rarity":"secret_rare","weight":83},{"rarity":"starlight_rare","weight":3}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND valid_from = '2016-01-14') AS t;
