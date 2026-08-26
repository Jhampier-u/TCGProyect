-- =====================================================================
-- ProyectoTCG - Migracion 0012 - Las epocas de Pokemon
-- Agente: Base de Datos - Tarea: T-068 - Sesion: S028
-- CORRIGE P-034
-- =====================================================================
-- COMO SALIO ESTO
--
-- `npm run packs:cobertura` se escribio para cerrar el techo de Yu-Gi-Oh!
-- (T-034) y en su PRIMERA ejecucion encontro el mismo defecto en Pokemon, que
-- nadie estaba mirando: siete de nueve sets con una carta que ninguna slot pide.
--
-- LO QUE LA MEDICION ANADIO
--
-- El techo era la mitad del problema. Contando impresiones por rareza en todo
-- el catalogo:
--
--     rare_holo          0 impresiones   <- peso 267 en la plantilla
--     hyper_rare         0 impresiones   <- peso  18
--     mega_hyper_rare    6 impresiones   <- peso   0
--     black_white_rare   2 impresiones   <- peso   0
--
-- El 28,5% del slot del hit pide rarezas que NO EXISTEN en ningun set
-- ingestado, y el respaldo del motor las entrega todas como `rare` porque es la
-- alternativa de mayor peso del slot. Medido sobre 300 sobres de Pitch Black:
--
--     rare                       72,3%   <- la plantilla pide 40%
--     double_rare                12,0%
--     illustration_rare           7,0%
--     ultra_rare                  5,0%
--     special_illustration_rare   3,7%
--     mega_hyper_rare             0,0%   <- inalcanzable
--
-- Siete de cada diez "hits" eran una rare del monton. La plantilla sembrada
-- describe una estructura anterior de Scarlet & Violet: desde la era Mega
-- Evolution no hay `rare_holo` ni `hyper_rare`.
--
-- Es el mismo problema de epocas que Yu-Gi-Oh!, asi que se usa el mismo
-- mecanismo: `valid_from` / `valid_to` de la 0009. La generica se queda como
-- esta, describiendo los sets de Scarlet & Violet anteriores -- que existen
-- aunque todavia no esten ingestados -- y sigue siendo el ultimo respaldo.
--
-- COMO SE REPARTE EL PESO DE UNA RAREZA QUE YA NO EXISTE
--
-- Se quita `rare_holo` y se reescalan las demas PROPORCIONALMENTE, no dando su
-- peso a la mayor. El respaldo del motor hace lo segundo, y por eso `rare`
-- llegaba al 72%: "dale todo a la alternativa mas gorda" es una degradacion
-- para no dejar el hueco vacio, no un modelo de fidelidad.
--
--   sin rare_holo: 400+143+75+67+30+18 = 733, factor 1000/733 = 1,3643
--     rare                      400 * 1,3643 = 546
--     double_rare               143 * 1,3643 = 195
--     illustration_rare          75 * 1,3643 = 102
--     ultra_rare                 67 * 1,3643 =  91
--     special_illustration_rare  30 * 1,3643 =  41
--     el hueco del chase         18 * 1,3643 =  25
--     --------------------------------------------
--                                              1000
--
-- Las proporciones entre las seis que quedan son las que ya estaban sembradas;
-- lo unico nuevo es que la septima deja de existir. [ESTIMADO] en el sentido de
-- que la tasa real de la era Mega no esta publicada.
--
-- NO LLEVA `USE`: ver la cabecera de la 0007 (P-032).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Las dos ventanas. `is_default = 0`: se eligen por fecha, no por bandera
-- (`uq_templates_one_default` solo admite una marcada por juego).
--
-- La de Black Bolt / White Flare es de UN DIA, y es correcto: son un par de
-- sets gemelos publicados a la vez, con una rareza -- `black_white_rare`, una
-- carta por set -- que no existe en ningun otro producto.
-- ---------------------------------------------------------------------
INSERT INTO pack_templates (game_id, set_id, valid_from, valid_to, name, card_count, is_default) VALUES
  (3, NULL, '2025-07-18', '2025-07-18', 'Booster Black Bolt / White Flare', 10, 0),
  (3, NULL, '2025-09-26', NULL,         'Booster Mega Evolution en adelante', 10, 0);

-- ---------------------------------------------------------------------
-- Los nueve primeros slots son los mismos que la generica: 4 comunes,
-- 3 infrecuentes y 2 reversos. Lo que cambio de epoca es el hit.
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"common","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_from IN ('2025-07-18', '2025-09-26')) AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"uncommon","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_from IN ('2025-07-18', '2025-09-26')) AS t
  JOIN (SELECT 4 AS idx UNION SELECT 5 UNION SELECT 6) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"common","weight":600},{"rarity":"uncommon","weight":300},{"rarity":"rare","weight":100}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_from IN ('2025-07-18', '2025-09-26')) AS t
  JOIN (SELECT 7 AS idx UNION SELECT 8) AS s;

-- ---------------------------------------------------------------------
-- Slot 9, era Mega Evolution: el chase es la Mega Hyper Rare.
--
-- Presente en MEG (2), PFL (1), POR (1), CRI (1) y PBL (1). Ascended Heroes no
-- tiene ninguna; ahi el respaldo del motor entrega otra del mismo slot, que es
-- justo lo que debe hacer.
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 9,
       '[{"rarity":"rare","weight":546},{"rarity":"double_rare","weight":195},{"rarity":"illustration_rare","weight":102},{"rarity":"ultra_rare","weight":91},{"rarity":"special_illustration_rare","weight":41},{"rarity":"mega_hyper_rare","weight":25}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_from = '2025-09-26') AS t;

-- ---------------------------------------------------------------------
-- Slot 9, Black Bolt / White Flare: el chase es la Black White Rare.
--
-- Misma reparticion, con la rareza del chase cambiada. LO QUE ESTA PLANTILLA NO
-- DESCRIBE: estos dos sets tienen 69 Illustration Rare de 172 impresiones -- el
-- 40% del set, frente al 8% de un booster normal -- y aqui la Illustration Rare
-- sigue con el 10,2% que le corresponde en la era Mega. Un sobre suyo no se
-- parecera al producto real hasta que alguien mida esa densidad. Se deja dicho
-- en vez de inventarse un numero: lo que esta migracion arregla es que la carta
-- del chase deje de ser INALCANZABLE, no la fidelidad entera del sobre.
-- Registrado con T-067.
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 9,
       '[{"rarity":"rare","weight":546},{"rarity":"double_rare","weight":195},{"rarity":"illustration_rare","weight":102},{"rarity":"ultra_rare","weight":91},{"rarity":"special_illustration_rare","weight":41},{"rarity":"black_white_rare","weight":25}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_from = '2025-07-18') AS t;
