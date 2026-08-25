-- =====================================================================
-- ProyectoTCG - Migracion 0001 - ROLLBACK
-- Orden inverso a las dependencias de clave foranea.
-- =====================================================================

USE proyecto_tcg;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS pack_opening_cards;
DROP TABLE IF EXISTS pack_openings;
DROP TABLE IF EXISTS deck_cards;
DROP TABLE IF EXISTS decks;
DROP TABLE IF EXISTS user_collection;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS pack_slots;
DROP TABLE IF EXISTS pack_templates;
DROP TABLE IF EXISTS card_prints;
DROP TABLE IF EXISTS cards;
DROP TABLE IF EXISTS sets;
DROP TABLE IF EXISTS rarities;
DROP TABLE IF EXISTS games;

SET FOREIGN_KEY_CHECKS = 1;
