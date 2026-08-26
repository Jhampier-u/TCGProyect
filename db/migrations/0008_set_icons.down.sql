-- =====================================================================
-- ProyectoTCG - Migracion 0008 - ROLLBACK
-- =====================================================================
-- QUE SE PIERDE AL DESHACER
--
-- La referencia a los iconos ya cosechados. Los FICHEROS siguen en disco, asi
-- que no hay que volver a descargarlos: al reaplicar la 0008 y relanzar el job,
-- la salvaguarda de "si ya esta en disco no se pide al origen" los recupera sin
-- una sola peticion externa.
--
-- Lo que si vuelve a cero es el contador de intentos fallidos.
-- =====================================================================

ALTER TABLE sets
  DROP COLUMN icon_failed_at,
  DROP COLUMN icon_fail_count,
  DROP COLUMN icon_local_path;
