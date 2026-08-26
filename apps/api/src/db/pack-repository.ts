import type { GameCode } from '@tcg/shared';
import { GAME_IDS } from '@tcg/shared';
import { DuplicateSeedError } from '../packs/pack-service.js';
import type { Database } from './connection.js';
import type {
  PackOpening,
  PackRepository,
  PersistOpeningInput,
  SetPool,
  SlotConfig,
  TemplateConfig,
} from '../packs/types.js';

/**
 * Acceso a datos del motor de sobres (ADR-006).
 *
 * El pool se precarga ENTERO en memoria por set y se indexa con el PRNG. Es la
 * decision de rendimiento clave del motor: la alternativa evidente,
 * `ORDER BY RAND() LIMIT 1`, obliga a MySQL a ordenar toda la tabla en cada
 * slot. Con 14 slots por sobre de Magic serian 14 escaneos completos por
 * apertura. Precargando, la eleccion es O(1) sobre un array.
 */
export class PackRepositoryMysql implements PackRepository {
  constructor(private readonly db: Database) {}

  /**
   * Plantilla del set, con dos respaldos.
   *
   * Precedencia, de mas especifica a menos:
   *   1. La propia del set (`set_id`)
   *   2. La de la EPOCA cuya ventana contiene `sets.released_at` (T-034)
   *   3. La generica del juego
   *
   * Un `CASE` explicito y no un `ORDER BY (x IS NULL)`: con tres niveles, el
   * truco de ordenar por un booleano deja de leerse solo.
   *
   * Un set que NO es un producto de sobres no resuelve ninguna plantilla
   * (T-069). Es la barrera del servidor: la interfaz ya no los ofrece, pero un
   * POST directo llegaria igual.
   *
   * Un set sin `released_at` cae al nivel 3, que es lo correcto: sin fecha no
   * hay epoca. Y una plantilla de epoca lleva `is_default = 0` a proposito --
   * `uq_templates_one_default` solo admite una por (juego, set), asi que
   * marcarlas por defecto haria que la segunda no se pudiera insertar.
   */
  async findTemplate(setId: number): Promise<TemplateConfig | null> {
    const rows = await this.db.select<{
      id: number; game_id: number; name: string; card_count: number;
    }>(
      `SELECT t.id, t.game_id, t.name, t.card_count
       FROM pack_templates t
       JOIN sets s ON s.game_id = t.game_id AND s.id = ? AND s.is_openable = 1
       WHERE
             (t.set_id = s.id AND t.is_default = 1)
          OR (t.set_id IS NULL
              AND (t.valid_from IS NOT NULL OR t.valid_to IS NOT NULL)
              AND s.released_at IS NOT NULL
              AND (t.valid_from IS NULL OR s.released_at >= t.valid_from)
              AND (t.valid_to   IS NULL OR s.released_at <= t.valid_to))
          OR (t.set_id IS NULL AND t.is_default = 1
              AND t.valid_from IS NULL AND t.valid_to IS NULL)
       ORDER BY CASE
                  WHEN t.set_id = s.id THEN 1
                  WHEN t.valid_from IS NOT NULL OR t.valid_to IS NOT NULL THEN 2
                  ELSE 3
                END
       LIMIT 1`,
      [setId],
    );
    const row = rows[0];
    if (!row) return null;

    const slots = await this.db.select<{
      slot_index: number; distribution: string | object; foil_chance: string | number;
    }>(
      `SELECT slot_index, distribution, foil_chance
       FROM pack_slots WHERE pack_template_id = ? ORDER BY slot_index`,
      [Number(row.id)],
    );

    return {
      templateId: Number(row.id),
      game: gameCodeOf(Number(row.game_id)),
      setId,
      name: row.name,
      cardCount: Number(row.card_count),
      slots: slots.map<SlotConfig>((s) => ({
        slotIndex: Number(s.slot_index),
        // mysql2 devuelve las columnas JSON ya parseadas; si el driver cambiara
        // de comportamiento, la cadena tambien se admite.
        distribution:
          typeof s.distribution === 'string'
            ? (JSON.parse(s.distribution) as SlotConfig['distribution'])
            : (s.distribution as SlotConfig['distribution']),
        // DECIMAL(6,5) llega como cadena para no perder precision.
        foilChance: Number(s.foil_chance),
      })),
    };
  }

  /**
   * Pool del set agrupado por rareza.
   *
   * `in_boosters = 1` NO es opcional (P-014): sin ese filtro el sobre entrega
   * promos y cartas de Secret Lair, que es mas de la mitad del catalogo de Magic.
   */
  async loadPool(setId: number): Promise<SetPool> {
    const rows = await this.db.select<{ id: number; card_id: number; code: string }>(
      `SELECT p.id, p.card_id, r.code
       FROM card_prints p JOIN rarities r ON r.id = p.rarity_id
       WHERE p.set_id = ? AND p.in_boosters = 1
       ORDER BY p.id`,
      [setId],
    );

    const pool: SetPool = new Map();
    for (const row of rows) {
      const lista = pool.get(row.code) ?? [];
      lista.push({ printId: Number(row.id), cardId: Number(row.card_id) });
      pool.set(row.code, lista);
    }
    return pool;
  }

  async rarityTiers(game: GameCode): Promise<Map<string, number>> {
    const rows = await this.db.select<{ code: string; tier: number }>(
      `SELECT code, tier FROM rarities WHERE game_id = ?`,
      [GAME_IDS[game]],
    );
    return new Map(rows.map((r) => [r.code, Number(r.tier)]));
  }

  async ownedQuantities(userId: number, printIds: number[]): Promise<Map<string, number>> {
    if (printIds.length === 0) return new Map();
    const rows = await this.db.select<{ card_print_id: number; finish: string; quantity: number }>(
      `SELECT card_print_id, finish, quantity FROM user_collection
       WHERE user_id = ? AND card_print_id IN (?)`,
      [userId, printIds],
    );
    return new Map(rows.map((r) => [`${Number(r.card_print_id)}:${r.finish}`, Number(r.quantity)]));
  }

  /**
   * Persiste la apertura y actualiza la coleccion, TODO en una transaccion.
   *
   * Sin transaccion, un fallo a mitad podria dejar una apertura registrada cuyas
   * cartas nunca llegaron a la coleccion del usuario: cartas que "salieron" pero
   * que el usuario no tiene. Es DML puro, asi que aqui la transaccion si es real
   * (el DDL haria commit implicito).
   */
  async persistOpening(input: PersistOpeningInput): Promise<number> {
    try {
      return await this.#persist(input);
    } catch (error) {
      // UNIQUE (user_id, seed): se traduce a un error de dominio para que la
      // capa HTTP responda 409 en vez de filtrar un error del driver.
      if (isDuplicateKey(error, 'uq_openings_user_seed')) {
        throw new DuplicateSeedError(input.seed);
      }
      throw error;
    }
  }

  async #persist(input: PersistOpeningInput): Promise<number> {
    return this.db.transaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO pack_openings (user_id, pack_template_id, set_id, seed, template_snapshot)
         VALUES (?, ?, ?, ?, ?)`,
        [
          input.userId,
          input.templateId,
          input.setId,
          input.seed,
          // P-005: congela la configuracion vigente al abrir. Sin esto, editar
          // pack_slots mas tarde haria irreproducible esta apertura.
          JSON.stringify(input.templateSnapshot),
        ],
      );
      const openingId = Number((result as { insertId: number }).insertId);

      if (input.cards.length > 0) {
        await conn.query(
          `INSERT INTO pack_opening_cards (pack_opening_id, card_print_id, slot_index, finish, is_new)
           VALUES ?`,
          [input.cards.map((c) => [openingId, c.printId, c.slotIndex, c.finish, c.isNew ? 1 : 0])],
        );

        // RN-02: la coleccion es aditiva. Nunca se borra una fila, se suma.
        await conn.query(
          `INSERT INTO user_collection (user_id, card_print_id, finish, quantity)
           VALUES ?
           ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
          [input.cards.map((c) => [input.userId, c.printId, c.finish, 1])],
        );
      }

      return openingId;
    });
  }

  /** RN-01: se reproduce desde lo persistido, jamas re-ejecutando el PRNG. */
  async findOpening(openingId: number, userId: number): Promise<PackOpening | null> {
    const rows = await this.db.select<{
      id: number; seed: string; pack_template_id: number; set_id: number; opened_at: string;
    }>(
      `SELECT id, seed, pack_template_id, set_id, opened_at
       FROM pack_openings WHERE id = ? AND user_id = ?`,
      [openingId, userId],
    );
    const row = rows[0];
    if (!row) return null;

    const cards = await this.db.select<{
      card_print_id: number; slot_index: number; finish: string; is_new: number; code: string;
    }>(
      `SELECT c.card_print_id, c.slot_index, c.finish, c.is_new, r.code
       FROM pack_opening_cards c
       JOIN card_prints p ON p.id = c.card_print_id
       JOIN rarities r ON r.id = p.rarity_id
       WHERE c.pack_opening_id = ?
       ORDER BY c.slot_index`,
      [openingId],
    );

    return {
      openingId: Number(row.id),
      seed: row.seed,
      templateId: Number(row.pack_template_id),
      setId: Number(row.set_id),
      openedAt: String(row.opened_at),
      cards: cards.map((c) => ({
        slotIndex: Number(c.slot_index),
        printId: Number(c.card_print_id),
        rarityCode: c.code,
        finish: c.finish,
        isNew: Number(c.is_new) === 1,
      })),
    };
  }
}

function gameCodeOf(id: number): GameCode {
  const entry = (Object.entries(GAME_IDS) as Array<[GameCode, number]>).find(([, v]) => v === id);
  if (!entry) throw new Error(`game_id desconocido en la base de datos: ${id}`);
  return entry[0];
}

function isDuplicateKey(error: unknown, indexName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: string; message?: string };
  return e.code === 'ER_DUP_ENTRY' && (e.message ?? '').includes(indexName);
}
