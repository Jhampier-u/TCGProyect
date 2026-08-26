-- =====================================================================
-- ProyectoTCG - Migracion 0009 - Ventana de vigencia de una plantilla
-- Agente: Base de Datos - Tarea: T-034 - Sesion: S028
-- =====================================================================
-- POR QUE
--
-- La estructura de un sobre de Yu-Gi-Oh! ha cambiado cuatro veces desde 2002.
-- Una sola plantilla por juego no puede describir 2002 y 2026 a la vez, y hoy
-- describe solo la ultima: los sets antiguos topan su completitud en el 70,7%
-- (P-021).
--
-- POR QUE UNA VENTANA Y NO UNA PLANTILLA POR SET
--
-- `pack_templates.set_id` ya existe y permite una plantilla propia por set. Esa
-- era la solucion apuntada en S015, y es la razon por la que T-034 lleva trece
-- sesiones parada: exige un paso de asignacion POSTERIOR a la ingesta -- miles
-- de filas, y hay que repetirlo cada vez que aparece un set.
--
-- La epoca no es una propiedad del set: es una propiedad de la PLANTILLA, que
-- vale para un rango de fechas. Poniendola aqui, la resolucion la hace la misma
-- consulta que ya elegia plantilla y el paso de asignacion desaparece.
--
-- NULL EN CUALQUIERA DE LAS DOS = SIN LIMITE POR ESE LADO
--
-- La epoca mas antigua lleva `valid_from` nulo para cubrir tambien los promos
-- anteriores a 2002. Una plantilla con las DOS a nulo no es de epoca: es la
-- generica del juego, que sigue siendo el ultimo respaldo.
--
-- NO LLEVA `USE`: ver la cabecera de la 0007 (P-032).
-- =====================================================================

ALTER TABLE pack_templates
  ADD COLUMN valid_from DATE NULL DEFAULT NULL AFTER set_id,
  ADD COLUMN valid_to   DATE NULL DEFAULT NULL AFTER valid_from;

-- No se anade indice. `pack_templates` tiene una decena de filas: cualquier
-- plan es un recorrido, y un indice sobre una tabla asi solo anade
-- mantenimiento. Se revisa si alguna vez crece.
