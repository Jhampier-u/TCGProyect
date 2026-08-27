-- =====================================================================
-- ProyectoTCG - Migracion 0014 - La era Sword & Shield y dos huecos de SV
-- Agente: Base de Datos - Tarea: T-074 - Sesion: S028
-- =====================================================================
-- COMO SALIO ESTO
--
-- La ingesta de Pokemon paso de 9 sets a 27 (T-005, la clave del usuario), y
-- `npm run packs:cobertura` senalo al instante ONCE sets con cartas
-- inalcanzables, tres de ellos con techo 0%. El catalogo crecio x3,6 y el
-- informe dijo exactamente donde estaba el hueco. Es para lo que se escribio.
--
-- Medido, el problema eran tres cosas distintas y solo dos son de plantilla:
--
--   1. Las GALERIAS (Lost Origin Trainer Gallery, Silver Tempest Trainer
--      Gallery, Crown Zenith Galarian Gallery): 30, 30 y 70 impresiones sin ni
--      una comun. No son productos: son el subconjunto de galeria de su set
--      padre. Se arregla en el clasificador (T-069), no aqui.
--   2. La era SWORD & SHIELD, que no tenia plantilla.
--   3. Dos rarezas que la generica de Scarlet & Violet no nombra.
--
-- NO LLEVA `USE`: desde la 0007. Y desde T-065 el migrador lo retiraria igual.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LA ERA SWORD & SHIELD  (... hasta 2023-03-30)
--
-- `Silver Tempest` (2022-11-11, 215 impresiones) es el set completo de la era
-- que hay en el catalogo, y trae once rarezas de las que la plantilla de
-- Scarlet & Violet solo nombra tres. Su techo era del 67%.
--
-- El corte es el 2023-03-30: `Scarlet & Violet` sale el 31 y con el empieza la
-- generica. El limite inferior queda abierto para cubrir tambien lo anterior.
--
-- LOS NUEVE PRIMEROS SLOTS son los mismos de siempre -- 4 comunes, 3
-- infrecuentes y 2 reversos -- porque un sobre de Pokemon ha llevado esa
-- estructura toda la era moderna. Lo que cambia de epoca es el hit.
--
-- SLOT 9 [ESTIMADO en su reparto interno]. La estructura por ROL es la conocida
-- de Sword & Shield -- rare, holo, V, VMAX/VSTAR, radiant, full art, secret y
-- rainbow -- y los pesos se toman de los roles equivalentes de la generica de
-- Scarlet & Violet para no inventar una escala nueva:
--
--     rare                400   (la rare de base)
--     rare_holo           267   (el rol del "holo garantizado")
--     rare_holo_v         143   (el rol que en SV ocupa `double_rare`)
--     rare_ultra           55   (full art)
--     rare_holo_vmax       40
--     rare_holo_vstar      40
--     radiant_rare         20
--     rare_secret          20
--     rare_rainbow         15
--     ----------------------
--                        1000
--
-- No hay tasa publicada para el reparto entre VMAX, VSTAR, radiant, secret y
-- rainbow. Lo que si esta garantizado es que TODAS son alcanzables, que es lo
-- que P-021 enseno a mirar. Si aparecen datos mejores, es un UPDATE (ADR-005).
-- ---------------------------------------------------------------------
INSERT INTO pack_templates (game_id, set_id, valid_from, valid_to, name, card_count, is_default) VALUES
  (3, NULL, NULL, '2023-03-30', 'Booster Sword & Shield', 10, 0),
  (3, NULL, '2024-01-26', '2024-01-26', 'Booster Paldean Fates', 10, 0);

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"common","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to IN ('2023-03-30', '2024-01-26')) AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"uncommon","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to IN ('2023-03-30', '2024-01-26')) AS t
  JOIN (SELECT 4 AS idx UNION SELECT 5 UNION SELECT 6) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx,
       '[{"rarity":"common","weight":600},{"rarity":"uncommon","weight":300},{"rarity":"rare","weight":100}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to IN ('2023-03-30', '2024-01-26')) AS t
  JOIN (SELECT 7 AS idx UNION SELECT 8) AS s;

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 9,
       '[{"rarity":"rare","weight":400},{"rarity":"rare_holo","weight":267},{"rarity":"rare_holo_v","weight":143},{"rarity":"rare_ultra","weight":55},{"rarity":"rare_holo_vmax","weight":40},{"rarity":"rare_holo_vstar","weight":40},{"rarity":"radiant_rare","weight":20},{"rarity":"rare_secret","weight":20},{"rarity":"rare_rainbow","weight":15}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to = '2023-03-30') AS t;

-- ---------------------------------------------------------------------
-- 2. PALDEAN FATES  (2024-01-26, un solo dia)
--
-- 245 impresiones, de las cuales 132 son shiny: 120 `shiny_rare` y 12
-- `shiny_ultra_rare`. Es el 54% del set, y la generica de Scarlet & Violet no
-- nombra ninguna de las dos: su techo era del 46,1%.
--
-- Es un set de "boveda shiny", como en su dia lo fueron Shining Fates y Hidden
-- Fates. Se le da su propia ventana en vez de meter las shiny en la generica,
-- porque en los otros diecisiete sets de la era ese peso se desperdiciaria.
-- Misma decision que con Black Bolt / White Flare en la 0012.
--
-- SLOT 9 [ESTIMADO]. Las shiny ocupan aqui el rol dominante que su proporcion
-- en el set sugiere, sin dejar fuera lo demas:
--     rare 300 · shiny_rare 300 · double_rare 130 · ultra_rare 90
--     illustration_rare 70 · special_illustration_rare 50
--     shiny_ultra_rare 40 · hyper_rare 20
--     ------------------------------------------------------
--                                                      1000
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 9,
       '[{"rarity":"rare","weight":300},{"rarity":"shiny_rare","weight":300},{"rarity":"double_rare","weight":130},{"rarity":"ultra_rare","weight":90},{"rarity":"illustration_rare","weight":70},{"rarity":"special_illustration_rare","weight":50},{"rarity":"shiny_ultra_rare","weight":40},{"rarity":"hyper_rare","weight":20}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 3 AND valid_to = '2024-01-26') AS t;

-- ---------------------------------------------------------------------
-- 3. LAS ACE SPEC, EN LA GENERICA
--
-- `ace_spec_rare` son 33 impresiones repartidas por SEIS sets, de Temporal
-- Forces (2024-03-22) a Prismatic Evolutions (2025-01-17). Dejaba a esos seis
-- con techos del 96,7% al 98,3% -- poco en porcentaje, pero es UNA carta de
-- cada set y de las que se buscan.
--
-- Va a la generica y NO a una ventana propia, aunque la ventana existiria:
-- seis sets de diez meses. El motivo es que en los sets sin ACE SPEC el
-- respaldo del motor entrega otra carta del mismo slot, asi que el coste de
-- llevarla siempre es ~1% de los hits mal repartido; el de una ventana mas es
-- una plantilla mas que mantener para siempre. Con una rareza de peso 20 no
-- compensa.
--
-- Reescalado desde los pesos vigentes (400/267/143/75/67/30/18) por
-- (1000-20)/1000 = 0,98:
--     rare 392 · rare_holo 262 · double_rare 140 · illustration_rare 74
--     ultra_rare 66 · special_illustration_rare 29 · hyper_rare 17
--     ace_spec_rare 20  [ESTIMADO]
--     ------------------------------------------------------------
--     392+262+140+74+66+29+17+20 = 1000
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"rare","weight":392},{"rarity":"rare_holo","weight":262},{"rarity":"double_rare","weight":140},{"rarity":"illustration_rare","weight":74},{"rarity":"ultra_rare","weight":66},{"rarity":"special_illustration_rare","weight":29},{"rarity":"ace_spec_rare","weight":20},{"rarity":"hyper_rare","weight":17}]'
 WHERE slot_index = 9
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 3 AND set_id IS NULL AND is_default = 1
          AND valid_from IS NULL AND valid_to IS NULL
     ) AS t
   );
