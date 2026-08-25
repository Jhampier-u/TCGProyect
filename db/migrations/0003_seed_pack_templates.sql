-- =====================================================================
-- ProyectoTCG - Migracion 0003 - Seeds de pack_templates y pack_slots
-- Agente: Base de Datos - Tarea: T-008 - Sesion: S003
-- ATACA P-003 (ninguna API expone la distribucion real de rarezas)
-- =====================================================================
-- IDs de plantilla explicitos (1,2,3) para que el seed sea determinista
-- e idempotente. set_id = NULL => plantilla POR DEFECTO del juego, que se
-- usa para cualquier set que no tenga plantilla propia.
--
-- Los pesos son ENTEROS sobre un total de 1000 por slot. No hace falta que
-- sumen 1000, el motor normaliza; pero se mantienen a 1000 para que el
-- peso se lea directamente como "por mil" al revisar la tabla.
--
-- NIVEL DE CONFIANZA de cada numero, declarado explicitamente:
--   [OFICIAL]  publicado por el fabricante
--   [DERIVADO] calculado a partir de una cifra oficial (se muestra el calculo)
--   [ESTIMADO] agregado de la comunidad; el fabricante no publica datos
-- =====================================================================

USE proyecto_tcg;

-- =====================================================================
-- 1. MTG - Play Booster (14 cartas)
-- Estructura [OFICIAL] (Wizards of the Coast / MTG Wiki):
--   slots 0-5  : 6 comunes
--   slot  6    : 1 comun (12,5% se sustituye por carta de "The List")
--   slots 7-9  : 3 infrecuentes
--   slot  10   : 1 rara o mitica
--   slot  11   : 1 tierra basica (con probabilidad de foil)
--   slot  12   : 1 comodin no-foil de cualquier rareza
--   slot  13   : 1 comodin foil de cualquier rareza
-- =====================================================================
INSERT INTO pack_templates (id, game_id, set_id, name, card_count, is_default) VALUES
  (1, 1, NULL, 'Play Booster', 14, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), card_count = VALUES(card_count);

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance) VALUES
  -- Slots 0-5: comunes garantizadas [OFICIAL]
  (1, 0, '[{"rarity":"common","weight":1000}]', 0.00000),
  (1, 1, '[{"rarity":"common","weight":1000}]', 0.00000),
  (1, 2, '[{"rarity":"common","weight":1000}]', 0.00000),
  (1, 3, '[{"rarity":"common","weight":1000}]', 0.00000),
  (1, 4, '[{"rarity":"common","weight":1000}]', 0.00000),
  (1, 5, '[{"rarity":"common","weight":1000}]', 0.00000),

  -- Slot 6: comun; el 12,5% de "The List" NO se modela en v1 (ver LIMITACION 1)
  (1, 6, '[{"rarity":"common","weight":1000}]', 0.00000),

  -- Slots 7-9: infrecuentes garantizadas [OFICIAL]
  (1, 7, '[{"rarity":"uncommon","weight":1000}]', 0.00000),
  (1, 8, '[{"rarity":"uncommon","weight":1000}]', 0.00000),
  (1, 9, '[{"rarity":"uncommon","weight":1000}]', 0.00000),

  -- Slot 10: rara/mitica. Ratio ~86/14 [OFICIAL]
  (1, 10, '[{"rarity":"rare","weight":860},{"rarity":"mythic","weight":140}]', 0.00000),

  -- Slot 11: tierra. foil_chance 0.20 [ESTIMADO]. Ver LIMITACION 2
  (1, 11, '[{"rarity":"common","weight":1000}]', 0.20000),

  -- Slot 12: comodin no-foil [DERIVADO] - ver el calculo al pie
  (1, 12, '[{"rarity":"common","weight":570},{"rarity":"uncommon","weight":280},{"rarity":"rare","weight":129},{"rarity":"mythic","weight":21}]', 0.00000),

  -- Slot 13: comodin foil. Misma distribucion, foil garantizado [OFICIAL: todo Play Booster trae un foil]
  (1, 13, '[{"rarity":"common","weight":570},{"rarity":"uncommon","weight":280},{"rarity":"rare","weight":129},{"rarity":"mythic","weight":21}]', 1.00000)
ON DUPLICATE KEY UPDATE distribution = VALUES(distribution), foil_chance = VALUES(foil_chance);

-- ---------------------------------------------------------------------
-- DERIVACION del comodin MTG (slots 12 y 13)
-- ---------------------------------------------------------------------
-- Wizards no publica la tabla de rarezas del comodin, pero si publica que
-- "~28% de los Play Boosters contienen 2 raras o miticas" y "~3% contienen 3".
-- Hay 2 slots comodin independientes. Si p = P(un comodin sea rara o mitica):
--     P(al menos un comodin rara+) = 1 - (1-p)^2 = 0,28
--     (1-p)^2 = 0,72  ->  1-p = 0,8485  ->  p = 0,1515
-- Contraste con el otro dato publicado:
--     P(ambos comodines rara+) = p^2 = 0,0230  ~=  el 3% publicado. Encaja.
-- Se reparte ese 15,15% entre rara y mitica con el mismo ratio 86/14 del
-- slot 10:  rara = 0,1515 * 0,86 = 0,130 -> peso 129
--           mitica = 0,1515 * 0,14 = 0,021 -> peso 21
-- El 84,85% restante se reparte comun/infrecuente en la proporcion tipica
-- de una hoja de impresion (~2:1):  570 / 280.
-- ---------------------------------------------------------------------

-- =====================================================================
-- 2. YGO - Core Booster (9 cartas)
-- Estructura [OFICIAL] (Konami, vigente desde Breakers of Shadow):
--   7 comunes + 1 Rare + 1 slot foil garantizado Super Rare o superior
--   El slot foil: 1:6 Ultra Rare, 1:12 Secret Rare, resto Super Rare
-- =====================================================================
INSERT INTO pack_templates (id, game_id, set_id, name, card_count, is_default) VALUES
  (2, 2, NULL, 'Core Booster', 9, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), card_count = VALUES(card_count);

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance) VALUES
  (2, 0, '[{"rarity":"common","weight":1000}]', 0.00000),
  (2, 1, '[{"rarity":"common","weight":1000}]', 0.00000),
  (2, 2, '[{"rarity":"common","weight":1000}]', 0.00000),
  (2, 3, '[{"rarity":"common","weight":1000}]', 0.00000),
  (2, 4, '[{"rarity":"common","weight":1000}]', 0.00000),
  (2, 5, '[{"rarity":"common","weight":1000}]', 0.00000),
  (2, 6, '[{"rarity":"common","weight":1000}]', 0.00000),

  -- Slot 7: Rare garantizada [OFICIAL]
  (2, 7, '[{"rarity":"rare","weight":1000}]', 0.00000),

  -- Slot 8: el "hit". 1/12 = 83 secret, 1/6 = 167 ultra, resto super [OFICIAL]
  (2, 8, '[{"rarity":"super_rare","weight":750},{"rarity":"ultra_rare","weight":167},{"rarity":"secret_rare","weight":83}]', 1.00000)
ON DUPLICATE KEY UPDATE distribution = VALUES(distribution), foil_chance = VALUES(foil_chance);

-- =====================================================================
-- 3. PTCG - Booster Scarlet & Violet (10 cartas)
-- Estructura [ESTIMADO/comunidad]: The Pokemon Company NO publica pull rates.
-- Los porcentajes proceden de agregados de aperturas masivas (TCGplayer
-- Authentication Center, +8.000 sobres).
--   4 comunes + 3 infrecuentes + 2 reverse holo + 1 slot de rara o superior
-- La energia basica que acompaña al sobre NO cuenta como carta del sobre.
-- =====================================================================
INSERT INTO pack_templates (id, game_id, set_id, name, card_count, is_default) VALUES
  (3, 3, NULL, 'Booster Scarlet & Violet', 10, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), card_count = VALUES(card_count);

INSERT INTO pack_slots (pack_template_id, slot_index, distribution, foil_chance) VALUES
  (3, 0, '[{"rarity":"common","weight":1000}]', 0.00000),
  (3, 1, '[{"rarity":"common","weight":1000}]', 0.00000),
  (3, 2, '[{"rarity":"common","weight":1000}]', 0.00000),
  (3, 3, '[{"rarity":"common","weight":1000}]', 0.00000),

  (3, 4, '[{"rarity":"uncommon","weight":1000}]', 0.00000),
  (3, 5, '[{"rarity":"uncommon","weight":1000}]', 0.00000),
  (3, 6, '[{"rarity":"uncommon","weight":1000}]', 0.00000),

  -- Slots 7-8: reverse holo. Cualquier rareza baja, siempre foil [ESTIMADO]
  (3, 7, '[{"rarity":"common","weight":600},{"rarity":"uncommon","weight":300},{"rarity":"rare","weight":100}]', 1.00000),
  (3, 8, '[{"rarity":"common","weight":600},{"rarity":"uncommon","weight":300},{"rarity":"rare","weight":100}]', 1.00000),

  -- Slot 9: el "hit" [ESTIMADO] - ver el calculo al pie
  (3, 9, '[{"rarity":"rare","weight":400},{"rarity":"rare_holo","weight":267},{"rarity":"double_rare","weight":143},{"rarity":"illustration_rare","weight":75},{"rarity":"ultra_rare","weight":67},{"rarity":"special_illustration_rare","weight":30},{"rarity":"hyper_rare","weight":18}]', 1.00000)
ON DUPLICATE KEY UPDATE distribution = VALUES(distribution), foil_chance = VALUES(foil_chance);

-- ---------------------------------------------------------------------
-- DERIVACION del slot 9 de PTCG
-- ---------------------------------------------------------------------
-- Tasas agregadas por la comunidad sobre +8.000 sobres:
--   Double Rare (ex)             1 de cada 7    = 14,29%  -> peso 143
--   Illustration Rare                             7,52%  -> peso  75
--   Ultra Rare                   1 de cada 15   =  6,67%  -> peso  67
--   Special Illustration Rare                     3,01%  -> peso  30
--   Hyper Rare (dorada)          1 de cada 54   =  1,85%  -> peso  18
--                                          suma de hits = 333
-- El 66,7% restante se reparte entre Rare y Rare Holo -> 400 / 267.
-- ---------------------------------------------------------------------

-- =====================================================================
-- LIMITACIONES CONOCIDAS DE ESTAS PLANTILLAS (registradas como P-008)
-- =====================================================================
-- LIMITACION 1 - "The List" de MTG (12,5% del slot 6) no se modela en v1.
--   Motivo: The List extrae cartas de OTROS sets. El motor de sobres elige
--   dentro del pool (set_id, rarity_id) y no sabe expresar un pool externo.
--   Consecuencia: el slot 6 es siempre una comun del set. Un sobre MTG
--   simulado tendra una carta "de menos" respecto al real 1 de cada 8 veces.
--
-- LIMITACION 2 - El slot de tierra de MTG no filtra por tipo.
--   Motivo: las tierras basicas son rareza 'common' en Scryfall; distinguirlas
--   exige filtrar por type_line, y el pool solo indexa (set, rareza).
--   Consecuencia: el slot 11 puede devolver cualquier comun, no una tierra.
--   Solucion prevista: anadir un campo opcional de filtro por tipo a
--   pack_slots.distribution en una migracion posterior.
--
-- LIMITACION 3 - Sets antiguos con estructura distinta.
--   Estas son las plantillas POR DEFECTO del juego (set_id NULL). Sets con
--   estructura propia (Draft Boosters de MTG anteriores a 2024, sobres de
--   Pokemon de la era WOTC de 11 cartas, sobres de YGO de 5 cartas) deberan
--   recibir su propia plantilla con set_id concreto. Es exactamente el caso
--   de uso para el que ADR-005 hizo esto configurable por datos.
-- =====================================================================
