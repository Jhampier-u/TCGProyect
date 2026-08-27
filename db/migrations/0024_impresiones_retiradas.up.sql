-- =====================================================================
-- ProyectoTCG - Migracion 0024 - card_prints.withdrawn_at
-- Agente: Base de Datos - Tarea: T-083 - Sesion: S028
-- CORRIGE P-040
-- =====================================================================
-- EL PROBLEMA
--
-- La clave natural de una impresion es `(set_id, external_id)`, y en Yu-Gi-Oh!
-- el `external_id` LLEVA LA RAREZA DENTRO:
--
--   SUDA-EN049::quarter_century_secret_rare
--
-- Es correcto y necesario (P-013): la misma carta sale en dos rarezas dentro del
-- mismo set, y sin la rareza en la clave una taparia a la otra. Pero tiene una
-- consecuencia que no estaba escrita: **si la rareza cambia, cambia la clave**,
-- y el upsert deja de reconocer la fila. En vez de actualizarla, inserta otra.
--
-- Medido al normalizar las etiquetas que no son rarezas (T-081): las impresiones
-- de Yu-Gi-Oh! pasaron de 44.365 a 44.475. Las 110 nuevas convivian con las 110
-- viejas, misma carta fisica, dos rarezas distintas. Nada fallo.
--
-- POR QUE UNA COLUMNA Y NO BORRAR SIN MAS
--
-- Una impresion referenciada por una apertura NO SE PUEDE BORRAR. `pack_openings`
-- y `pack_opening_cards` son la fuente de verdad de RN-01, y borrar una carta que
-- alguien saco de un sobre reescribiria su historial (P-005). La clave foranea lo
-- impide, y hace bien.
--
-- Asi que se distinguen dos casos, igual que se hizo con las plantillas en P-035:
--   - Impresion sobrante SIN referencias -> se borra.
--   - Impresion sobrante CON referencias -> se RETIRA: sigue en la base para que
--     la apertura y la coleccion la sigan resolviendo, pero deja de aparecer en
--     el pool de sobres y de contar para la completitud.
--
-- POR QUE `withdrawn_at` Y NO `in_boosters = 0`
--
-- Poner `in_boosters = 0` habria funcionado y habria sido mentira a medias:
-- ese campo significa "esta impresion puede salir de un sobre DE SU SET" (P-014),
-- y una carta retirada no es que no salga en sobre, es que el origen ya no la
-- lista. Con una columna propia, el dia que alguien se pregunte por que una
-- carta desaparecio de los sobres, la respuesta esta ahi con su fecha.
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

ALTER TABLE card_prints
  ADD COLUMN withdrawn_at TIMESTAMP NULL DEFAULT NULL AFTER in_boosters;

-- Se anade al indice de pool: la precarga del motor filtra por `in_boosters` y
-- ahora tambien por esto, y es la consulta mas caliente del sobre.
DROP INDEX idx_prints_pool ON card_prints;
CREATE INDEX idx_prints_pool ON card_prints (set_id, rarity_id, in_boosters, withdrawn_at, id);
