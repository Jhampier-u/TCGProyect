-- =====================================================================
-- ProyectoTCG - Migracion 0025 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- Los 404 sets de Magic anteriores a 2024 vuelven a resolver a `Play Booster`:
-- 14 cartas con slot foil garantizado y comodin, para sets de 1995. Vuelven
-- tambien a ser alcanzables por la via del Play Booster las rarezas `special` y
-- `bonus`, asi que el informe de cobertura NO empeora al deshacer -- lo que
-- empeora es la fidelidad, que es justo lo que esta migracion arreglaba.
--
-- SE RETIRA EN VEZ DE BORRARSE lo que tenga aperturas (P-035, RN-01). Una
-- plantilla referenciada por `pack_openings` no se puede borrar: la clave
-- foranea es ON DELETE RESTRICT y hace bien, porque borrarla reescribiria el
-- historial de un sobre que alguien abrio. El orden importa: primero los slots,
-- despues las plantillas sin referencias, y a las que quedan se les quita la
-- ventana y se les marca el nombre.
--
-- Sin la ventana ya no las elige `findTemplate` -- una plantilla sin `set_id`,
-- sin `product_line`, sin fechas y con `is_default = 0` no la selecciona ningun
-- nivel de la precedencia -- asi que quedan inertes pero legibles.
-- =====================================================================

DELETE FROM pack_slots
 WHERE pack_template_id IN (
   SELECT id FROM (
     SELECT id FROM pack_templates
      WHERE game_id = 1 AND is_default = 0
        AND valid_to IN ('1999-02-14', '2008-10-02', '2024-02-08')
   ) AS t
 );

DELETE FROM pack_templates
 WHERE game_id = 1 AND is_default = 0
   AND valid_to IN ('1999-02-14', '2008-10-02', '2024-02-08')
   AND id NOT IN (SELECT DISTINCT pack_template_id FROM pack_openings);

UPDATE pack_templates
   SET valid_from = NULL, valid_to = NULL, name = CONCAT(name, ' (retirada)')
 WHERE game_id = 1 AND is_default = 0
   AND valid_to IN ('1999-02-14', '2008-10-02', '2024-02-08');
