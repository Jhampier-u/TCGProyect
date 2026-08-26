-- =====================================================================
-- ProyectoTCG - Migracion 0010 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- Las tres plantillas de epoca. Todos los sets de Yu-Gi-Oh! vuelven a resolver
-- a la generica, y con ella los sets anteriores a 2020 vuelven a topar su
-- completitud en el 70-76% (P-021).
--
-- POR QUE NO BASTA UN DELETE
--
-- `pack_openings.pack_template_id` tiene una clave foranea con ON DELETE
-- RESTRICT hacia `pack_templates`. En cuanto alguien abre un sobre con una de
-- estas plantillas, la fila deja de poder borrarse.
--
-- La primera version de este fichero hacia DELETE de las dos tablas. Paso la
-- prueba del ciclo up-down-up SOLO porque en ese momento todavia no se habia
-- abierto ningun sobre con las plantillas nuevas; los 300 de la verificacion
-- vinieron despues. El fallo se destapo al probar el rollback equivalente de la
-- 0012, con aperturas ya hechas: el DELETE de `pack_slots` paso y el de
-- `pack_templates` fue rechazado, dejando plantillas VIVAS y SIN SLOTS. Un
-- rollback a medias es peor que no tener rollback.
--
-- Este fichero se corrigio en la misma sesion en que se escribio, antes de
-- publicarse. La regla de migraciones inmutables protege el `up`, que fija el
-- estado que otras instalaciones ya tienen aplicado; un `down` que nunca ha
-- funcionado en ninguna parte es un script roto, no un cambio de esquema.
--
-- LO QUE SE HACE EN VEZ DE ESO
--
--   1. Se borran las plantillas que NO tienen aperturas.
--   2. Las que si las tienen se RETIRAN: se les quita la ventana. Una plantilla
--      sin `set_id`, sin ventana y con `is_default = 0` no encaja en ninguna de
--      las tres ramas de `findTemplate`, asi que deja de elegirse sin romper la
--      clave foranea ni tocar el historial (P-005, RN-01).
-- =====================================================================

DELETE FROM pack_slots
 WHERE pack_template_id IN (
   SELECT id FROM (
     SELECT id FROM pack_templates
      WHERE game_id = 2 AND (valid_from IS NOT NULL OR valid_to IS NOT NULL)
   ) AS t
 );

DELETE FROM pack_templates
 WHERE game_id = 2
   AND (valid_from IS NOT NULL OR valid_to IS NOT NULL)
   AND id NOT IN (SELECT DISTINCT pack_template_id FROM pack_openings);

UPDATE pack_templates
   SET valid_from = NULL,
       valid_to   = NULL,
       name       = CONCAT(name, ' (retirada)')
 WHERE game_id = 2 AND (valid_from IS NOT NULL OR valid_to IS NOT NULL);
