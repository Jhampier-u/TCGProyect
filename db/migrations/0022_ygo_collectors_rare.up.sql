-- =====================================================================
-- ProyectoTCG - Migracion 0022 - Collector's Rare y el Rare que no se fue
-- Agente: Base de Datos - Tarea: T-080 - Sesion: S028
-- =====================================================================
-- QUE QUEDABA
--
-- Tras las plantillas de linea (0021) sobrevivian 19 sets con `rare` y 16 con
-- `collectors_rare` inalcanzables. Medidos, son todos la misma familia: los
-- mini-boosters modernos de Yu-Gi-Oh!.
--
--   TOCH Toon Chaos        2020-06-18   35 rare · 15 collectors · 75 pool
--   GEIM Genesis Impact    2020-12-03   35 · 14 ·  74
--   ANGU Ancient Guardians 2021-04-29   35 · 15 ·  75
--   KICO King's Court      2021-07-08   37 · 15 ·  81
--   MAZE Maze of Memories  2023-03-09   42 · 17 ·  84
--   CRBR Crossover Breakers 2024-12-05  40 · 15 · 105
--   PHRE Phantom Revenge   2025-12-04   40 · 15 · 104
--
-- MATIZA P-019 SIN CONTRADECIRLO. Aquella medicion decia que el slot de Rare
-- desaparecio de los sobres en 2020, y es cierto de los Core Booster de linea
-- principal: `Supreme Darkness` no tiene ni una `rare`. Pero estos mini-boosters
-- SI la conservan, y son casi la mitad de su pool. La conclusion de P-019 era
-- correcta para lo que se midio entonces -- un solo set -- y demasiado ancha
-- para el catalogo completo.
--
-- NO SE LES HACE UNA LINEA PROPIA, y es deliberado: sus nombres no comparten
-- nada (`Toon Chaos`, `King's Court`, `Maze of Memories`), asi que cualquier
-- patron seria adivinar. Van a la plantilla generica, donde el respaldo del
-- motor se encarga: en un set sin `rare` -- como Supreme Darkness -- esa entrada
-- se cae a otra del mismo slot y no cambia nada.
--
-- ARITMETICA. [ESTIMADO] rare 60, collectors_rare 15; el resto reescalado por
-- (1000-75)/1000 = 0,925:
--   super 631 · ultra 141 · secret 68 · ultimate 39 · qcsr 37
--   starlight 3 · grand_master 3 · ghost 3
--   ------------------------------------------------
--   925 + 60 + 15 = 1000
--
-- NO LLEVA `USE`: desde la 0007 (P-032).
-- =====================================================================

UPDATE pack_slots
   SET distribution = '[{"rarity":"super_rare","weight":631},{"rarity":"ultra_rare","weight":141},{"rarity":"secret_rare","weight":68},{"rarity":"rare","weight":60},{"rarity":"ultimate_rare","weight":39},{"rarity":"quarter_century_secret_rare","weight":37},{"rarity":"collectors_rare","weight":15},{"rarity":"starlight_rare","weight":3},{"rarity":"grand_master_rare","weight":3},{"rarity":"ghost_rare","weight":3}]'
 WHERE slot_index = 8
   AND pack_template_id = (
     SELECT id FROM (
       SELECT id FROM pack_templates
        WHERE game_id = 2 AND set_id IS NULL AND is_default = 1
          AND valid_from IS NULL AND valid_to IS NULL AND product_line IS NULL
     ) AS t
   );
