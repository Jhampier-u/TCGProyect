-- =====================================================================
-- ProyectoTCG - Migracion 0006 - Plantilla de sobre moderna de Yu-Gi-Oh!
-- Agente: Base de Datos - Tarea: T-024 - Sesion: S015
-- CORRIGE P-019
-- =====================================================================
-- QUE ESTABA MAL
--
-- La plantilla sembrada en T-008 describia el Core Booster clasico:
--   7 comunes + 1 Rare + 1 "hit"
--
-- Segun Yugipedia, esa estructura dejo de existir hace cinco anos. La tabla de
-- composicion por epoca del TCG es:
--
--   Legend of Blue Eyes (2002) - Light of Destruction (2008)
--       8 comunes + 1 carta      (1/24 Secret, 1/12 Ultra, 1/4 Super, resto Rare)
--   The Duelist Genesis (2008) - Dimension of Chaos (2015)
--       7 comunes + 1 Rare + 1   (1/24 Secret, 1/12 Ultra, 1/4 Super, resto Common)
--   Breakers of Shadow (2016) - Ignition Assault (2020)
--       7 comunes + 1 Rare + 1   (1/12 Secret, 1/6 Ultra, resto Super)
--   >>> Eternity Code (abril 2020) - PRESENTE
--       8 comunes + 1 carta de rareza superior
--       (1/12 Secret, 1/6 Ultra, resto Super)
--
-- Es decir: **el slot de Rare desaparecio de los sobres en 2020**. Por eso
-- "Supreme Darkness" no tiene ni una sola carta de rareza `rare`, y por eso el
-- motor acababa entregando 8 comunes por respaldo. Acertaba la estructura, pero
-- por accidente y emitiendo un aviso en cada sobre.
--
-- Y LO QUE ROMPIA EL PRODUCTO
--
-- La plantilla no pedia nunca `quarter_century_secret_rare`. Medido en S014 con
-- 103 sobres reales: 0 de 25 QCSR obtenidas, con un techo del 80% en la
-- completitud del set. El "coleccionista", uno de los tres usuarios objetivo de
-- 01_Producto.md, no podia cerrar ningun set moderno JAMAS.
--
-- POR QUE UNA SOLA PLANTILLA Y NO UNA POR SET
--
-- La QCSR solo existe en los sets de la era del 25 aniversario. Se incluye en la
-- plantilla POR DEFECTO igualmente: en un set que no la tenga, el respaldo del
-- motor (S012) cae a la siguiente rareza del mismo slot por peso, que es Super
-- Rare, y eso es exactamente lo correcto. Asi una unica plantilla sirve para los
-- sets con QCSR y sin ella, sin mantener una plantilla por set.
--
-- Los sets ANTERIORES a 2020 quedan descritos de forma imprecisa. Es una
-- limitacion consciente (P-008, limitacion 3): si mas adelante importan, se les
-- asigna su propia plantilla con `set_id`, que es un INSERT.
--
-- NOTA SOBRE LAS APERTURAS YA REALIZADAS: no se ven afectadas. `pack_openings`
-- guarda `template_snapshot` con la configuracion vigente al abrir, y la
-- reproduccion lee `pack_opening_cards`, no la plantilla (P-005). Cambiar esta
-- tabla no reescribe el pasado.
-- =====================================================================

USE proyecto_tcg;

-- La plantilla por defecto de Yu-Gi-Oh! es la id = 2 (sembrada en la 0003).
UPDATE pack_templates
   SET name = 'Core Booster (Eternity Code en adelante)',
       card_count = 9
 WHERE game_id = 2 AND set_id IS NULL AND is_default = 1;

-- Se sustituyen todos los slots. No hay clave foranea desde las aperturas hacia
-- `pack_slots` precisamente para que esto sea posible sin tocar el historial.
DELETE FROM pack_slots
 WHERE pack_template_id = (
   SELECT id FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND set_id IS NULL AND is_default = 1) AS t
 );

-- ---------------------------------------------------------------------
-- Slots 0-7: OCHO comunes. Antes eran 7 comunes + 1 Rare.
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, s.idx, '[{"rarity":"common","weight":1000}]', 0.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND set_id IS NULL AND is_default = 1) AS t
  JOIN (SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7) AS s;

-- ---------------------------------------------------------------------
-- Slot 8: el "hit". Siempre foil.
--
-- Pesos base [OFICIAL] (Yugipedia, Eternity Code en adelante):
--     Secret Rare  1/12  = 83
--     Ultra Rare   1/6   = 167
--     Super Rare   3/4   = 750
--
-- A eso se anade [ESTIMADO] la Quarter Century Secret Rare. El fabricante no
-- publica su tasa; los seguimientos de la comunidad situan aproximadamente una
-- por caja de 24 sobres, es decir ~4,2%. Se le asigna peso 42 y se reescalan los
-- otros tres por (1000-42)/1000 = 0,958 para que el total siga sumando 1000:
--     super  750 * 0,958 = 718
--     ultra  167 * 0,958 = 160
--     secret  83 * 0,958 =  80
--     qcsr                 =  42
--
-- Si aparecen datos mejores, esto es un UPDATE. Ese era todo el proposito de
-- ADR-005: la fidelidad del sobre son datos, no codigo.
-- ---------------------------------------------------------------------
INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance)
SELECT t.id, 8,
       '[{"rarity":"super_rare","weight":718},{"rarity":"ultra_rare","weight":160},{"rarity":"secret_rare","weight":80},{"rarity":"quarter_century_secret_rare","weight":42}]',
       1.00000
  FROM (SELECT id FROM pack_templates WHERE game_id = 2 AND set_id IS NULL AND is_default = 1) AS t;
