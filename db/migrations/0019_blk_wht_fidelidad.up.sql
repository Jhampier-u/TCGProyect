-- =====================================================================
-- ProyectoTCG - Migracion 0019 - La densidad real de Black Bolt / White Flare
-- Agente: Base de Datos - Tarea: T-073 - Sesion: S028
-- =====================================================================
-- QUE ARREGLA
--
-- No es un problema de cobertura: desde la 0012 todas las cartas de estos dos
-- sets son alcanzables, incluida la `black_white_rare`, que es una sola carta.
-- Lo que falla es el REALISMO del sobre.
--
--   BLK / WHT, identicos los dos:
--     illustration_rare  69 de 172 impresiones   40,1% del set
--     rare               11
--     ultra_rare          8
--     special_illustration_rare  7
--     double_rare         6
--     black_white_rare    1
--
-- Un booster normal de Scarlet & Violet lleva un 8% de Illustration Rare; estos
-- llevan el 40%, y la plantilla les daba el 10,2% del slot del hit. El sobre
-- salia mucho menos brillante de lo que el producto real es.
--
-- COMO SE ESTIMA, Y POR QUE ASI
--
-- No hay tasa publicada por sobre para estos dos sets. Se estima con una regla
-- que se puede decir en voz alta, y esa es la diferencia entre estimar e
-- inventar:
--
--   1. Las rarezas de CAZA mantienen la tasa de su epoca. La escasez de una
--      Special Illustration Rare o de la Black White Rare no depende de como
--      este compuesto el set: es una carta rara porque el fabricante la imprime
--      poco. Se quedan en 41 y 25, como en la 0012.
--
--   2. El resto del peso -- 934 -- se reparte en PROPORCION a lo que el set
--      tiene de cada una. Si 69 de las 94 cartas de esos niveles son
--      Illustration Rare, un sobre de este set entrega una Illustration Rare la
--      mayoria de las veces. Eso es lo que hace a estos dos sets lo que son.
--
--      934 * 11/94 = 109   rare
--      934 *  6/94 =  60   double_rare
--      934 * 69/94 = 686   illustration_rare
--      934 *  8/94 =  79   ultra_rare
--      ------------------------------
--                    934  +  41 + 25 = 1000
--
-- LO QUE ESTA ESTIMACION NO ES. No es una medicion: si aparece la tasa real del
-- fabricante, esto es un UPDATE (ADR-005). Y no se aplica a ningun otro set --
-- la plantilla es solo de estos dos, por su ventana de un dia -- precisamente
-- porque la regla depende de una composicion que solo ellos tienen.
--
-- LOS NUEVE PRIMEROS SLOTS no se tocan: 4 comunes, 3 infrecuentes y 2 reversos.
-- El set tiene 39 comunes y 31 infrecuentes, de sobra para llenarlos.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

UPDATE pack_slots
   SET distribution = '[{"rarity":"illustration_rare","weight":686},{"rarity":"rare","weight":109},{"rarity":"ultra_rare","weight":79},{"rarity":"double_rare","weight":60},{"rarity":"special_illustration_rare","weight":41},{"rarity":"black_white_rare","weight":25}]'
 WHERE slot_index = 9
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 3 AND valid_from = '2025-07-18' AND valid_to = '2025-07-18'
     ) AS t
   );
