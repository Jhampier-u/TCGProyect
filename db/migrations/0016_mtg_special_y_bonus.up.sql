-- =====================================================================
-- ProyectoTCG - Migracion 0016 - `special` y `bonus` en el Play Booster
-- Agente: Base de Datos - Tarea: T-077 - Sesion: S028
-- =====================================================================
-- COMO SALIO
--
-- Primera pasada del informe de cobertura sobre el catalogo COMPLETO de Magic:
-- 1045 sets, 207 con pool y ofrecidos. Solo NUEVE tienen cartas inalcanzables,
-- y es una noticia buena: el vocabulario de rarezas de Magic
-- -- common/uncommon/rare/mythic -- ha sido estable treinta anos, asi que una
-- sola plantilla cubre de 1993 a 2026. Nada que ver con Pokemon, que necesito
-- cuatro epocas para tres anos.
--
-- Los nueve fallan por dos rarezas que la plantilla no nombra:
--
--   tsr  Time Spiral Remastered   410 impresiones · techo 70,5%  · special
--   tsb  Time Spiral Timeshifted  121 ·   0,0% (el set ENTERO es special)
--   mps  Kaladesh Inventions       54 ·   0,0%
--   mp2  Amonkhet Invocations      54 ·   0,0%
--   plst The List                4654 ·  99,9%
--   cmr / clb / cmm  Commander    361/361/451 · 99,7-99,8%
--   vma  Vintage Masters          325 ·  97,2%  · bonus
--
-- QUE SON ESAS DOS RAREZAS. Scryfall marca `special` lo que va en una hoja
-- aparte -- los Timeshifted de borde morado, los Masterpiece, los inventos de
-- Kaladesh -- y `bonus` la hoja extra de Vintage Masters. En el producto real
-- son cartas de inserto: aparecen en el sobre, pero no en la tabla de rarezas
-- normal.
--
-- DONDE VAN. Al slot 13, que es el ultimo y el unico siempre foil: es el sitio
-- del producto donde de verdad aparece un inserto. Peso 15 [ESTIMADO] -- no hay
-- una tasa unica publicada porque cada set con hoja de inserto tiene la suya --
-- y `bonus` 5, que es mas raro todavia.
--
-- Reescalado de los pesos vigentes (570/280/129/21) por (1000-20)/1000 = 0,98:
--     common 559 · uncommon 274 · rare 126 · mythic 21
--     special 15 · bonus 5      [ESTIMADO]
--     ----------------------------------
--     559+274+126+21+15+5 = 1000
--
-- LO QUE ESTO NO ARREGLA, Y SE DICE. `tsb`, `mps` y `mp2` son hojas de inserto
-- ENTERAS, no productos: sus cartas salen en los sobres de su set padre. Con
-- esto pasan a ser completables, pero "abrir un sobre" de ellas seguira
-- entregando catorce cartas special, que no se parece a nada real. Es la misma
-- familia que las galerias de Pokemon (T-069).
--
-- Se descarto la regla obvia -- "un set de una sola rareza no es un producto" --
-- porque MEDIDA caza 505 sets de Yu-Gi-Oh!, entre ellos productos reales como
-- `MVP1` o `WI26`, donde todas las cartas son Ultra Rare por diseno. Habria
-- quitado mas contenido real del que arregla, que es el error que ya se evito
-- con el patron `Tin` en T-069. Registrado aparte.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

UPDATE pack_slots
   SET distribution = '[{"rarity":"common","weight":559},{"rarity":"uncommon","weight":274},{"rarity":"rare","weight":126},{"rarity":"mythic","weight":21},{"rarity":"special","weight":15},{"rarity":"bonus","weight":5}]'
 WHERE slot_index = 13
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 1 AND set_id IS NULL AND is_default = 1
     ) AS t
   );
