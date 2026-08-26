-- =====================================================================
-- ProyectoTCG - Migracion 0008 - sets.icon_local_path
-- Agente: Base de Datos - Tarea: T-035 - Sesion: S027
-- CIERRA la mitad pendiente de P-022
-- =====================================================================
-- POR QUE ESTA MIGRACION EXISTE
--
-- `sets.icon_url` apunta al ORIGEN. En S016 se descubrio que la API lo estaba
-- exponiendo: con 1032 sets de Yu-Gi-Oh!, un frontend que pintara iconos habria
-- hecho 1032 peticiones de imagen a YGOPRODeck por cada usuario que abriera el
-- selector. Es exactamente el hotlinking que castiga con lista negra de IP
-- permanente (P-001), y por eso el campo se retiro de la API.
--
-- Desde entonces el dato existe pero es inservible: no se puede mostrar. Esta
-- columna guarda la ruta LOCAL del icono ya cosechado, que es la unica que el
-- navegador puede recibir.
--
-- EL MISMO CONTRATO QUE LAS IMAGENES DE CARTA. `icon_url` es de la capa de
-- ingesta y no sale de ahi; `icon_local_path` es lo unico que se sirve.
--
-- CONTADOR DE FALLOS, igual que en la 0007 (T-019): un icono cuya URL este rota
-- no debe reintentarse en cada ejecucion para siempre.
--
-- No lleva `USE`: la 0001 fija el nombre de la base con uno y eso es P-032. No
-- se puede corregir alli —las migraciones publicadas son inmutables— pero si se
-- puede dejar de repetirlo.
-- =====================================================================

ALTER TABLE sets
  ADD COLUMN icon_local_path  VARCHAR(255)     NULL DEFAULT NULL AFTER icon_url,
  ADD COLUMN icon_fail_count  SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER icon_local_path,
  ADD COLUMN icon_failed_at   TIMESTAMP        NULL DEFAULT NULL AFTER icon_fail_count;
