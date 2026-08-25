-- =====================================================================
-- ProyectoTCG - Migracion 0005 - Ampliar sets.external_id
-- Agente: Base de Datos - Sesion: S011
-- CORRIGE P-017
-- =====================================================================
-- POR QUE
--
-- `sets.external_id` era VARCHAR(64). Para Yu-Gi-Oh! la clave natural de un set
-- es su NOMBRE (decision de T-012: `set_code` se repite en 142 casos, ver P-013),
-- y hay nombres de set que superan con creces los 64 caracteres:
--
--   "Trials of the Pharaoh - Match of the Millennium & Twisted Nightmares
--    promotional card"   -> 85 caracteres
--
-- 16 de los 1032 sets de Yu-Gi-Oh! desbordan la columna. El INSERT fallaba con
-- error 1406 y tumbaba la ingesta COMPLETA de ese juego: no es que se perdieran
-- 16 sets, es que no entraba ninguno.
--
-- POR QUE NO SE DETECTO ANTES: las verificaciones de S006 a S010 insertaban un
-- set cada vez, elegido a mano. La primera ejecucion del orquestador real, que
-- hace un upsert del catalogo entero de golpe, lo destapo de inmediato.
--
-- ANCHO ELEGIDO: 255. El maximo real hoy es 85; 255 deja margen amplio para
-- nombres futuros. La clave UNIQUE (game_id, external_id) ocupa 1 + 255*4 = 1021
-- bytes, muy por debajo del limite de 3072 de InnoDB con ROW_FORMAT=DYNAMIC.
--
-- `sets.name` se deja en VARCHAR(160): su maximo real es tambien 85 y ahi el
-- margen ya era suficiente. Se amplia solo lo que realmente rompio.
-- =====================================================================

USE proyecto_tcg;

ALTER TABLE sets
  MODIFY COLUMN external_id VARCHAR(255) NOT NULL;
