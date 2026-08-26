-- =====================================================================
-- ProyectoTCG - Migracion 0012 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- Las dos plantillas de epoca de Pokemon. Todos los sets vuelven a resolver a
-- `Booster Scarlet & Violet`, y con ella vuelve lo medido antes de la 0012:
-- siete de nueve sets con su carta del chase inalcanzable (P-034) y el 72% de
-- los hits degradados a `rare` porque el 28,5% del slot pide rarezas que no
-- existen en ningun set ingestado.
--
-- POR QUE NO BASTA UN DELETE, Y COMO SE DESCUBRIO
--
-- `pack_openings.pack_template_id` tiene una clave foranea con ON DELETE
-- RESTRICT hacia `pack_templates`. En cuanto alguien abre un sobre con una de
-- estas plantillas, la fila deja de poder borrarse.
--
-- La primera version de este rollback hacia DELETE de las dos tablas. Al
-- probarlo con aperturas ya hechas, el DELETE de `pack_slots` paso y el de
-- `pack_templates` fue rechazado: quedaron dos plantillas VIVAS y SIN SLOTS, y
-- el informe de cobertura paso a decir "techo 0,0%" en los nueve sets. Peor
-- todavia, volver a aplicar la migracion inserto un segundo par de plantillas
-- con la misma ventana, y con dos filas empatadas la que elige `findTemplate`
-- depende del orden de las filas.
--
-- Un rollback a medias es peor que no tener rollback: deja un estado que nadie
-- ha disenado.
--
-- LO QUE SE HACE EN VEZ DE ESO
--
--   1. Se borran las plantillas que NO tienen aperturas.
--   2. Las que si las tienen se RETIRAN: se les quita la ventana. Una plantilla
--      sin `set_id`, sin ventana y con `is_default = 0` no encaja en ninguna de
--      las tres ramas de `findTemplate`, asi que deja de elegirse sin romper la
--      clave foranea ni tocar el historial (P-005, RN-01).
--
-- El orden importa: primero el DELETE, que se lleva las libres, y despues el
-- UPDATE, que retira lo que haya quedado.
-- =====================================================================

DELETE FROM pack_slots
 WHERE pack_template_id IN (
   SELECT id FROM (
     SELECT id FROM pack_templates
      WHERE game_id = 3 AND (valid_from IS NOT NULL OR valid_to IS NOT NULL)
   ) AS t
 );

DELETE FROM pack_templates
 WHERE game_id = 3
   AND (valid_from IS NOT NULL OR valid_to IS NOT NULL)
   AND id NOT IN (SELECT DISTINCT pack_template_id FROM pack_openings);

UPDATE pack_templates
   SET valid_from = NULL,
       valid_to   = NULL,
       name       = CONCAT(name, ' (retirada)')
 WHERE game_id = 3 AND (valid_from IS NOT NULL OR valid_to IS NOT NULL);
