-- =====================================================================
-- ProyectoTCG - Migracion 0011 - El hueco de la epoca moderna
-- Agente: Base de Datos - Tarea: T-034 - Sesion: S028
-- =====================================================================
-- LO QUE LA MEDICION DESTAPO
--
-- T-034 estaba fichada como un problema de los sets anteriores a 2020. Medido,
-- los MODERNOS estaban peor:
--
--   ETCO Eternity Code        2020-04-30   105 impresiones   techo  95,2%
--   MAMO Magnificent Monsters 2026-09-04   206 impresiones   techo  68,9%
--   MAMS Magnificent Maestros 2026-11-12    66 impresiones   techo  36,4%
--
-- La plantilla que la 0006 dejo pide `quarter_century_secret_rare`, y estos sets
-- traen `starlight_rare` y `grand_master_rare`. P-019 se dio por cerrado y el
-- techo seguia ahi, por debajo del set de 2002.
--
-- LO QUE SE HACE
--
--   1. Sembrar `grand_master_rare` con un tier de verdad. Hoy esta en la base
--      con tier 50 porque la puso `ensureRarity` al ingestar, no el seed. El
--      tier ordena el respaldo del motor ("de menos a mas escasa"), asi que una
--      rareza huerfana en 50 se ordena por accidente. Una plantilla no debe
--      depender de algo que llego por descubrimiento.
--   2. Anadir starlight y grand master al slot del hit.
--
-- ARITMETICA DEL SLOT 8
--
--   base [OFICIAL, Yugipedia]:  Secret 1/12 = 83, Ultra 1/6 = 167, Super = 750
--   [ESTIMADO]:  qcsr 42 (0006, ~1 por caja) + starlight 3 + grand_master 3 = 48
--   reescalado de los oficiales por (1000-48)/1000 = 0,952:
--       super  750*0,952 = 714
--       ultra  167*0,952 = 159
--       secret  83*0,952 =  79
--   -----------------------------------------------------------------
--       714+159+79+42+3+3 = 1000
--
-- ALCANZABLE NO ES REALISTA, Y CONVIENE DECIRLO. MAMO y MAMS no tienen ni una
-- carta comun y esta plantilla pide ocho: sus ocho slots caen al respaldo en
-- cada sobre. Con esto sus rarezas pasan a ser alcanzables y el techo llega al
-- 100%, pero un sobre de MAMO seguira sin parecerse al producto real.
-- Describirlos bien exige una plantilla propia con `set_id`, que es un INSERT
-- cuando se decida hacerlo. Registrado aparte, no tapado aqui.
--
-- NO LLEVA `USE`: ver la cabecera de la 0007 (P-032).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La rareza, sembrada de verdad.
--
--    Tier 15, por encima de ghost_rare (14), que era el mas escaso sembrado.
--    Es un JUICIO, no un dato publicado: coloca a la Grand Master Rare como la
--    mas escasa conocida. Si aparece mejor informacion, es un UPDATE.
-- ---------------------------------------------------------------------
INSERT INTO rarities (game_id, code, label, tier) VALUES
  (2, 'grand_master_rare', 'Grand Master Rare', 15)
ON DUPLICATE KEY UPDATE label = VALUES(label), tier = VALUES(tier);

-- ---------------------------------------------------------------------
-- 2. El slot del hit de la plantilla generica de Yu-Gi-Oh!.
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":714},{"rarity":"ultra_rare","weight":159},{"rarity":"secret_rare","weight":79},{"rarity":"quarter_century_secret_rare","weight":42},{"rarity":"starlight_rare","weight":3},{"rarity":"grand_master_rare","weight":3}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 2 AND set_id IS NULL AND is_default = 1
          AND valid_from IS NULL AND valid_to IS NULL
     ) AS t
   );
