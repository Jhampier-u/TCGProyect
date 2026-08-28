-- =====================================================================
-- ProyectoTCG - Migracion 0026 - The List y el slot de tierra
-- Agente: Base de Datos - Tarea: T-085 - Sesion: S030
-- CIERRA los puntos 1 y 2 de P-008
-- =====================================================================
-- LOS DOS PUNTOS QUE QUEDABAN, Y POR QUE IBAN JUNTOS
--
-- P-008 llevaba abierto desde T-008 con tres limitaciones aceptadas para v1. La
-- tercera -- los sets antiguos sin epoca propia -- se cerro en la 0025. Estas dos
-- son las que quedaban, y comparten causa: el motor solo sabia elegir dentro del
-- pool `(set_id, rarity_id)` del set que se abre.
--
--   1. THE LIST. Uno de cada ocho Play Booster trae, en su septimo carton, una
--      carta de un set aparte -- `plst`, 4654 impresiones en sobre -- que no
--      esta en el pool del set abierto. No era modelable: no habia forma de
--      decir "esta entrada saca la carta de otro sitio".
--
--   2. EL SLOT DE TIERRA. Las tierras basicas son rareza `common` en Scryfall,
--      asi que un slot que pide `common` entrega cualquier comun. El sobre no
--      llevaba la tierra que el producto real lleva.
--
-- Las dos se arreglan en el MOTOR, no aqui: `distribution` admite ahora una
-- entrada `{"set":"..."}` y `pack_slots` tiene una columna de filtro. Esta
-- migracion es lo que hace falta para usarlas.
--
-- POR QUE UNA COLUMNA CERRADA Y NO UN `type_line LIKE` LIBRE
--
-- Un filtro libre con una errata -- `Basic Lnd%` -- no casaria con nada, vaciaria
-- el slot, y el respaldo del motor lo taparia entregando una comun cualquiera:
-- sin error, sin aviso, con el sobre alterado. Es la misma familia de fallo que
-- P-034 y que las rarezas fantasma de T-081, y este proyecto ya sabe lo que
-- cuesta. El CHECK la limita a los valores que el motor entiende, asi que una
-- errata falla al migrar en vez de callarse durante meses.
--
-- MEDIDO ANTES DE ESCRIBIR NADA
--
--   tierras basicas en pools de sobre: 1962 impresiones en 112 sets
--   sets de Magic con pool y ofrecidos: 207
--
-- Pero el numero que importa no es ese, porque solo dos de las cuatro epocas
-- tienen slot de tierra. De los 135 sets que caen en Draft Booster o Play
-- Booster, 58 NO traen tierras basicas en el sobre y 77 si. Los 58 se quedan
-- exactamente como estaban -- el motor abre la mano, entrega una comun sin
-- filtrar y avisa, porque un slot vacio ahi seria un sobre con catorce cartas en
-- vez de quince -- y los 77 ganan su tierra.
--
-- Los 58 salen por su nombre en `npm run packs:cobertura`, que es donde tienen
-- que estar: es fidelidad perdida, no un fallo, y lo que no se publica se
-- termina contando a mano (T-070).
--
-- THE LIST VA SOLO EN EL PLAY BOOSTER, y no es pereza
--
-- The List aparecio en 2020 en los SET BOOSTER, un producto que este proyecto no
-- modela, y paso al Play Booster en 2024. El Draft Booster -- la epoca 3 de la
-- 0025, de 2008 a 2024 -- NUNCA la llevo. Ponersela seria inventar un producto
-- que no existio.
--
-- EN QUE SLOT VA, Y EL ERROR QUE COSTO UNA MEDICION
--
-- La primera version la puso en el COMODIN (slot 12). Parecia el sitio natural
-- -- es el slot "de cualquier rareza" -- y estaba mal. El comodin ya podia
-- entregar una rara, asi que meter ahi The List no anade una fuente de raras:
-- la sustituye. Medido con 4000 sobres, los sobres con cuatro o mas raras
-- seguian siendo el 0,00%, que es exactamente el sintoma que P-008 describia y
-- que esto tenia que arreglar.
--
-- El producto real la pone en el SEPTIMO CARTON, sustituyendo a una COMUN, y
-- P-008 lo decia con todas sus letras desde el principio: "The List de MTG
-- (12,5 % del slot 7)". Ahi si es una cuarta fuente independiente de raras,
-- junto al slot de rara, el comodin y el comodin foil.
--
-- ARITMETICA. El slot 6 -- el septimo carton, contando desde cero -- era comun
-- al 100%. Se le hace sitio al 12,5% de The List:
--
--     common                = 875
--     set plst              = 125   [OFICIAL] "1 de cada 8 sobres"
--     ------------------------------
--                             1000
--
-- El comodin (slot 12) NO SE TOCA: se queda como lo dejo la 0016.
--
-- LA EPOCA 3 SE REORDENA, y hay que decir por que
--
-- La 0025 metio en su slot 10 tres cosas a la vez: la comun, la probabilidad de
-- foil y las rarezas de inserto. Lo hizo porque no habia filtro de tipo y la
-- tierra no era expresable, asi que el slot de tierra y el hueco variable eran
-- el mismo sitio a la fuerza. Ahora si se pueden separar, que es como es el
-- producto real: el foil y el inserto SUSTITUYEN A UNA COMUN, y la tierra basica
-- es un slot propio.
--
--   slot 9  <- pasa a ser el hueco variable: comun 980 / special 15 / bonus 5,
--              con foil 0,22
--   slot 10 <- pasa a ser el slot de TIERRA: comun 1000, filtro basic_land,
--              sin foil
--
-- No cambia el numero de cartas del sobre ni ninguna rareza deja de ser
-- alcanzable: `special` y `bonus` siguen nombrados, solo que un slot mas a la
-- izquierda.
--
-- LA EPOCA 2 NO SE TOCA. Los sobres anteriores a 2008 no tenian slot de tierra:
-- eran 11 comunes, 3 infrecuentes y 1 rara. Su hueco variable sigue siendo lo
-- que era.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La columna de filtro, cerrada por CHECK.
-- ---------------------------------------------------------------------
ALTER TABLE pack_slots
  ADD COLUMN card_filter VARCHAR(32) NULL DEFAULT NULL AFTER foil_chance,
  ADD CONSTRAINT ck_slots_card_filter CHECK (card_filter IS NULL OR card_filter IN ('basic_land'));

-- ---------------------------------------------------------------------
-- 2. Play Booster: el slot 11 ya era el de la tierra -- comun con un 20% de
--    foil -- pero entregaba cualquier comun. Ahora entrega una tierra.
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET card_filter = 'basic_land'
 WHERE slot_index = 11
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates WHERE game_id = 1 AND is_default = 1
     ) AS t
   );

-- ---------------------------------------------------------------------
-- 3. Play Booster: The List entra en el septimo carton, sustituyendo a una
--    comun -- que es donde va en el producto real.
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"common","weight":875},{"set":"plst","weight":125}]'
 WHERE slot_index = 6
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates WHERE game_id = 1 AND is_default = 1
     ) AS t
   );

-- ---------------------------------------------------------------------
-- 4. Draft Booster: se separan el hueco variable y la tierra.
-- ---------------------------------------------------------------------
UPDATE pack_slots
   SET distribution = '[{"rarity":"common","weight":980},{"rarity":"special","weight":15},{"rarity":"bonus","weight":5}]',
       foil_chance = 0.22000
 WHERE slot_index = 9
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 1 AND valid_from = '2008-10-03' AND valid_to = '2024-02-08'
     ) AS t
   );

UPDATE pack_slots
   SET distribution = '[{"rarity":"common","weight":1000}]',
       foil_chance = 0.00000,
       card_filter = 'basic_land'
 WHERE slot_index = 10
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 1 AND valid_from = '2008-10-03' AND valid_to = '2024-02-08'
     ) AS t
   );
