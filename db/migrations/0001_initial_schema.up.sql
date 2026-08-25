-- =====================================================================
-- ProyectoTCG - Migracion 0001 - Esquema inicial
-- Requiere: MySQL >= 8.0.17 (indices multivaluados, CHECK constraints)
-- Motor: InnoDB - Charset: utf8mb4 - Collation: utf8mb4_0900_ai_ci
-- Agente: Base de Datos - Tarea: T-006 - Sesion: S002
-- =====================================================================
-- Orden de creacion respetando dependencias de clave foranea:
--   games -> rarities -> sets -> cards -> card_prints
--   pack_templates -> pack_slots
--   users -> user_collection -> decks -> deck_cards
--   pack_openings -> pack_opening_cards
-- =====================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS proyecto_tcg
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE proyecto_tcg;

-- ---------------------------------------------------------------------
-- 1. games - catalogo fijo. IDs explicitos, sin AUTO_INCREMENT: son
--    constantes del dominio referenciadas desde el codigo (1=MTG,2=YGO,3=PTCG).
-- ---------------------------------------------------------------------
CREATE TABLE games (
  id          TINYINT UNSIGNED NOT NULL,
  code        VARCHAR(8)   NOT NULL,
  name        VARCHAR(64)  NOT NULL,
  source_api  VARCHAR(32)  NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_games_code (code)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 2. rarities - la rareza es POR JUEGO. Un "rare" de MTG y uno de YGO no
--    son la misma entidad, por eso la unicidad es (game_id, code) y nunca
--    existe una tabla de rarezas global.
--    tier = orden de escasez ascendente (1 = mas comun). Lo usa la UI para
--    ordenar y el motor de sobres para los "hits" garantizados.
-- ---------------------------------------------------------------------
CREATE TABLE rarities (
  id       SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id  TINYINT UNSIGNED  NOT NULL,
  -- VARCHAR(48), no 32: Yu-Gi-Oh! tiene nombres de rareza muy largos.
  -- 'duel_terminal_normal_parallel_rare' son 34 caracteres y reventaba con
  -- VARCHAR(32) (error 1406). Detectado al ejecutar el seed T-007.
  code     VARCHAR(48)       NOT NULL,
  label    VARCHAR(64)       NOT NULL,
  tier     TINYINT UNSIGNED  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rarities_game_code (game_id, code),
  KEY idx_rarities_game_tier (game_id, tier),
  CONSTRAINT fk_rarities_game
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_rarities_tier CHECK (tier BETWEEN 1 AND 50)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 3. sets - expansion/coleccion.
--    ingested_at es el CHECKPOINT de ADR-004: si el worker muere, reanuda
--    por los sets con ingested_at IS NULL en vez de reprocesar todo.
--    external_id es la clave natural de deduplicacion frente a la API origen.
-- ---------------------------------------------------------------------
CREATE TABLE sets (
  id            BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  game_id       TINYINT UNSIGNED NOT NULL,
  external_id   VARCHAR(64)      NOT NULL,
  code          VARCHAR(16)      NOT NULL,
  name          VARCHAR(160)     NOT NULL,
  released_at   DATE             NULL,
  card_count    INT UNSIGNED     NOT NULL DEFAULT 0,
  icon_url      VARCHAR(512)     NULL,
  ingested_at   TIMESTAMP        NULL DEFAULT NULL,
  created_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sets_game_external (game_id, external_id),
  KEY idx_sets_game_released (game_id, released_at DESC),
  KEY idx_sets_ingest_pending (game_id, ingested_at),
  CONSTRAINT fk_sets_game
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 4. cards - la carta CONCEPTUAL (el "oraculo"), no la impresion.
--    Existe separada de card_prints porque las reglas de mazo se aplican
--    por NOMBRE (max. 4 copias de "Lightning Bolt" sumando todas sus
--    impresiones), no por impresion.
--
--    game_data JSON: todo lo especifico de cada juego. Evita ~50 columnas
--    nullables. Los campos que se filtran de verdad se exponen como
--    columnas generadas STORED e indexadas.
--
--    GUARDA DE TIPO: el CASE + JSON_TYPE evita que un valor no numerico
--    (p.ej. el ATK "?" de Slifer en YGO) provoque un error de truncado y
--    aborte el INSERT en modo estricto. Sin esta guarda, la ingesta de YGO
--    se rompe con las cartas de ATK variable.
-- ---------------------------------------------------------------------
CREATE TABLE cards (
  id          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  game_id     TINYINT UNSIGNED NOT NULL,
  oracle_key  VARCHAR(64)      NOT NULL,
  name        VARCHAR(255)     NOT NULL,
  type_line   VARCHAR(255)     NULL,
  rules_text  TEXT             NULL,
  game_data   JSON             NOT NULL,

  cmc DECIMAL(4,1) GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.cmc')) IN ('INTEGER','DOUBLE','DECIMAL')
         THEN CAST(JSON_EXTRACT(game_data, '$.cmc') AS DECIMAL(4,1)) END) STORED,

  atk INT GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.atk')) IN ('INTEGER','DOUBLE','DECIMAL')
         THEN CAST(JSON_EXTRACT(game_data, '$.atk') AS SIGNED) END) STORED,

  def INT GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.def')) IN ('INTEGER','DOUBLE','DECIMAL')
         THEN CAST(JSON_EXTRACT(game_data, '$.def') AS SIGNED) END) STORED,

  lvl TINYINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.level')) IN ('INTEGER','DOUBLE','DECIMAL')
         THEN CAST(JSON_EXTRACT(game_data, '$.level') AS UNSIGNED) END) STORED,

  hp SMALLINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN JSON_TYPE(JSON_EXTRACT(game_data, '$.hp')) IN ('INTEGER','DOUBLE','DECIMAL')
         THEN CAST(JSON_EXTRACT(game_data, '$.hp') AS UNSIGNED) END) STORED,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_cards_game_oracle (game_id, oracle_key),

  -- Paginacion keyset estable: ORDER BY name, id
  KEY idx_cards_game_name (game_id, name, id),
  KEY idx_cards_game_cmc  (game_id, cmc),
  KEY idx_cards_game_atk  (game_id, atk),
  KEY idx_cards_game_hp   (game_id, hp),

  -- Indice multivaluado sobre el array de colores de MTG (MySQL >= 8.0.17).
  -- Permite: WHERE 'R' MEMBER OF (game_data->'$.colors') con acceso por indice.
  KEY idx_cards_mtg_colors ((CAST(game_data->'$.colors' AS CHAR(2) ARRAY))),

  FULLTEXT KEY ftx_cards_search (name, rules_text),

  CONSTRAINT fk_cards_game
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_cards_game_data_object CHECK (JSON_TYPE(game_data) = 'OBJECT')
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 5. card_prints - la impresion concreta en un set. Es lo que entrega un sobre.
--    image_local_path es la UNICA ruta que el frontend puede consumir (P-001).
--    image_source_url existe solo para la descarga inicial del job image-harvest
--    y nunca debe serializarse en una respuesta de la API.
-- ---------------------------------------------------------------------
CREATE TABLE card_prints (
  id                BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  card_id           BIGINT UNSIGNED   NOT NULL,
  set_id            BIGINT UNSIGNED   NOT NULL,
  external_id       VARCHAR(64)       NOT NULL,
  collector_number  VARCHAR(16)       NOT NULL DEFAULT '',
  rarity_id         SMALLINT UNSIGNED NOT NULL,
  image_local_path  VARCHAR(512)      NULL,
  image_source_url  VARCHAR(512)      NULL,
  finishes          JSON              NOT NULL,
  created_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prints_set_external (set_id, external_id),

  -- INDICE CRITICO del motor de sobres: precarga del pool (set, rareza).
  -- Es covering para "SELECT id FROM card_prints WHERE set_id=? AND rarity_id=?",
  -- lo que evita el ORDER BY RAND() que haria escaneo completo.
  KEY idx_prints_pool (set_id, rarity_id, id),

  KEY idx_prints_card (card_id),
  KEY idx_prints_image_pending (image_local_path),

  CONSTRAINT fk_prints_card
    FOREIGN KEY (card_id) REFERENCES cards (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_prints_set
    FOREIGN KEY (set_id) REFERENCES sets (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_prints_rarity
    FOREIGN KEY (rarity_id) REFERENCES rarities (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_prints_finishes_array CHECK (JSON_TYPE(finishes) = 'ARRAY')
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 6. pack_templates - ADR-005: la configuracion del sobre son DATOS.
--    set_id NULL = plantilla por defecto del juego (fallback para sets sin
--    plantilla propia).
--    set_key/default_guard: columnas generadas cuyo unico fin es hacer
--    cumplir "como maximo un default por (juego, set)" con un UNIQUE.
--    Sin set_key, los NULL de set_id se trataran como distintos entre si
--    y permitirian varios defaults por juego.
-- ---------------------------------------------------------------------
CREATE TABLE pack_templates (
  id          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  game_id     TINYINT UNSIGNED NOT NULL,
  set_id      BIGINT UNSIGNED  NULL,
  name        VARCHAR(64)      NOT NULL,
  card_count  TINYINT UNSIGNED NOT NULL,
  is_default  TINYINT(1)       NOT NULL DEFAULT 0,
  created_at  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- VIRTUAL, no STORED: MySQL rechaza (error 1215) una FK con ON DELETE CASCADE
  -- sobre una columna que es base de una columna generada STORED. Verificado
  -- empiricamente en 8.0.42. Con VIRTUAL la FK se acepta, el UNIQUE de abajo
  -- sigue siendo indexable y ademas no ocupamos espacio en disco.
  set_key       BIGINT UNSIGNED  GENERATED ALWAYS AS (IFNULL(set_id, 0)) VIRTUAL,
  default_guard TINYINT UNSIGNED GENERATED ALWAYS AS (IF(is_default = 1, 1, NULL)) VIRTUAL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_templates_one_default (game_id, set_key, default_guard),
  KEY idx_templates_set (set_id),
  CONSTRAINT fk_templates_game
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  -- NOTA: ON UPDATE RESTRICT (no CASCADE) es OBLIGATORIO aqui. MySQL prohibe
  -- ON UPDATE CASCADE sobre una columna que es base de una columna generada
  -- STORED, y set_id alimenta a set_key. Error 1215 si se usa CASCADE.
  -- No supone perdida: sets.id es un surrogate AUTO_INCREMENT que nunca cambia.
  CONSTRAINT fk_templates_set
    FOREIGN KEY (set_id) REFERENCES sets (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ck_templates_card_count CHECK (card_count BETWEEN 1 AND 60)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 7. pack_slots - cada posicion del sobre y su tabla de pesos por rareza.
--    distribution: [{"rarity":"rare","weight":865},{"rarity":"mythic","weight":135}]
--    Se referencia la rareza por CODE (texto), no por FK: la plantilla debe
--    poder editarse desde un panel sin resolver IDs, y el motor traduce
--    code -> rarity_id una sola vez al precargar el pool.
-- ---------------------------------------------------------------------
CREATE TABLE pack_slots (
  id                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  pack_template_id  INT UNSIGNED     NOT NULL,
  slot_index        TINYINT UNSIGNED NOT NULL,
  distribution      JSON             NOT NULL,
  foil_chance       DECIMAL(6,5)     NOT NULL DEFAULT 0.00000,
  PRIMARY KEY (id),
  UNIQUE KEY uq_slots_template_index (pack_template_id, slot_index),
  CONSTRAINT fk_slots_template
    FOREIGN KEY (pack_template_id) REFERENCES pack_templates (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_slots_distribution_array CHECK (JSON_TYPE(distribution) = 'ARRAY'),
  CONSTRAINT ck_slots_distribution_len   CHECK (JSON_LENGTH(distribution) >= 1),
  CONSTRAINT ck_slots_foil_chance        CHECK (foil_chance >= 0 AND foil_chance <= 1)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 8. users - password_hash dimensionado para Argon2id (~96-128 chars).
--    VARCHAR(255) deja margen para futuros parametros de coste.
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email             VARCHAR(190)    NOT NULL,
  display_name      VARCHAR(64)     NOT NULL,
  password_hash     VARCHAR(255)    NOT NULL,
  email_verified_at TIMESTAMP       NULL DEFAULT NULL,
  created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 9. user_collection - RN-02: aditiva. Nunca se borra una fila; se ajusta
--    quantity. UNSIGNED ya impide cantidades negativas sin necesidad de CHECK.
--    La unicidad incluye finish: una foil y una no-foil de la misma impresion
--    son entradas distintas de la coleccion.
-- ---------------------------------------------------------------------
CREATE TABLE user_collection (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  card_print_id     BIGINT UNSIGNED NOT NULL,
  finish            VARCHAR(16)     NOT NULL DEFAULT 'nonfoil',
  quantity          INT UNSIGNED    NOT NULL DEFAULT 0,
  first_obtained_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_collection_entry (user_id, card_print_id, finish),
  KEY idx_collection_print (card_print_id),
  CONSTRAINT fk_collection_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_collection_print
    FOREIGN KEY (card_print_id) REFERENCES card_prints (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 10. decks
-- ---------------------------------------------------------------------
CREATE TABLE decks (
  id          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED  NOT NULL,
  game_id     TINYINT UNSIGNED NOT NULL,
  name        VARCHAR(120)     NOT NULL,
  description TEXT             NULL,
  format      VARCHAR(32)      NULL,
  is_public   TINYINT(1)       NOT NULL DEFAULT 0,
  created_at  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_decks_user (user_id, updated_at DESC),
  KEY idx_decks_public (is_public, game_id, updated_at DESC),
  CONSTRAINT fk_decks_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_decks_game
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 11. deck_cards - RN-03: referencia al CATALOGO, no a la coleccion.
--     zone cubre las tres gramaticas: main/side (MTG, PTCG),
--     extra (YGO), commander (MTG Commander).
-- ---------------------------------------------------------------------
CREATE TABLE deck_cards (
  id            BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  deck_id       BIGINT UNSIGNED  NOT NULL,
  card_print_id BIGINT UNSIGNED  NOT NULL,
  zone          ENUM('main','extra','side','commander') NOT NULL DEFAULT 'main',
  quantity      TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_deck_card_zone (deck_id, card_print_id, zone),
  KEY idx_deck_cards_print (card_print_id),
  CONSTRAINT fk_deck_cards_deck
    FOREIGN KEY (deck_id) REFERENCES decks (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_deck_cards_print
    FOREIGN KEY (card_print_id) REFERENCES card_prints (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_deck_cards_qty CHECK (quantity BETWEEN 1 AND 99)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 12. pack_openings - RN-01: apertura inmutable y auditable.
--     template_snapshot congela la configuracion de sobre vigente en el
--     momento de abrir. Sin ella, editar pack_slots mas tarde haria que
--     "reproducir la semilla" devolviera cartas distintas y RN-01 se
--     romperia silenciosamente (ver P-005).
--     UNIQUE (user_id, seed) impide reprocesar dos veces la misma apertura.
-- ---------------------------------------------------------------------
CREATE TABLE pack_openings (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  pack_template_id  INT UNSIGNED    NOT NULL,
  set_id            BIGINT UNSIGNED NOT NULL,
  seed              CHAR(32)        NOT NULL,
  template_snapshot JSON            NOT NULL,
  opened_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_openings_user_seed (user_id, seed),
  KEY idx_openings_user_time (user_id, opened_at DESC),
  CONSTRAINT fk_openings_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_openings_template
    FOREIGN KEY (pack_template_id) REFERENCES pack_templates (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_openings_set
    FOREIGN KEY (set_id) REFERENCES sets (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

-- ---------------------------------------------------------------------
-- 13. pack_opening_cards - el resultado materializado. ESTA tabla, y no la
--     semilla, es la fuente de verdad al reproducir una apertura.
--     is_new marca si era la primera copia del usuario (para el "NUEVA!" de la UI).
-- ---------------------------------------------------------------------
CREATE TABLE pack_opening_cards (
  id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  pack_opening_id BIGINT UNSIGNED  NOT NULL,
  card_print_id   BIGINT UNSIGNED  NOT NULL,
  slot_index      TINYINT UNSIGNED NOT NULL,
  finish          VARCHAR(16)      NOT NULL DEFAULT 'nonfoil',
  is_new          TINYINT(1)       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_opening_slot (pack_opening_id, slot_index),
  KEY idx_opening_cards_print (card_print_id),
  CONSTRAINT fk_opening_cards_opening
    FOREIGN KEY (pack_opening_id) REFERENCES pack_openings (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_opening_cards_print
    FOREIGN KEY (card_print_id) REFERENCES card_prints (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;
