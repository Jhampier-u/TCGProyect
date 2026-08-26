import type { GameCode } from '@tcg/shared';
import { GAME_IDS } from '@tcg/shared';
import type { Database } from './connection.js';

export interface CollectionEntry {
  printId: number;
  cardId: number;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  finish: string;
  quantity: number;
  imagePath: string | null;
  firstObtainedAt: string;
}

export interface CollectionPage {
  items: CollectionEntry[];
  nextCursor: string | null;
}

/** Completitud de un set para un usuario. Es lo que pide el perfil "coleccionista". */
export interface SetCompletion {
  setExternalId: string;
  setCode: string;
  setName: string;
  /** Impresiones que pueden salir en sobre. Es el denominador honesto. */
  poolSize: number;
  owned: number;
  /** 0..1 */
  ratio: number;
}

export class CollectionRepository {
  constructor(private readonly db: Database) {}

  /**
   * Colección del usuario, paginada por keyset.
   *
   * El desempate es `(card_prints.id, finish)` porque la clave natural de la
   * tabla es `(user_id, card_print_id, finish)`: una foil y una no-foil de la
   * misma impresión son dos entradas distintas. Sin incluir `finish`, la
   * paginación se saltaría una de las dos — el mismo error que costó diez filas
   * en P-020.
   */
  async list(
    userId: number,
    options: { game?: GameCode; cursor?: string; limit?: number } = {},
  ): Promise<CollectionPage> {
    const limit = Math.min(Math.max(1, options.limit ?? 40), 100);
    const where = ['uc.user_id = ?'];
    const params: unknown[] = [userId];

    if (options.game) {
      where.push('s.game_id = ?');
      params.push(GAME_IDS[options.game]);
    }

    const cursor = decodeCollectionCursor(options.cursor);
    if (cursor) {
      where.push('(p.id > ? OR (p.id = ? AND uc.finish > ?))');
      params.push(cursor.printId, cursor.printId, cursor.finish);
    }

    const rows = await this.db.select<{
      print_id: number; card_id: number; name: string; set_code: string; set_name: string;
      collector_number: string; rarity: string; finish: string; quantity: number;
      image_local_path: string | null; first_obtained_at: string;
    }>(
      `SELECT p.id AS print_id, c.id AS card_id, c.name,
              s.code AS set_code, s.name AS set_name,
              p.collector_number, r.code AS rarity,
              uc.finish, uc.quantity, p.image_local_path, uc.first_obtained_at
       FROM user_collection uc
       JOIN card_prints p ON p.id = uc.card_print_id
       JOIN cards c ON c.id = p.card_id
       JOIN sets s ON s.id = p.set_id
       JOIN rarities r ON r.id = p.rarity_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.id ASC, uc.finish ASC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const hayMas = rows.length > limit;
    const visibles = hayMas ? rows.slice(0, limit) : rows;
    const ultimo = visibles[visibles.length - 1];

    return {
      items: visibles.map((r) => ({
        printId: Number(r.print_id),
        cardId: Number(r.card_id),
        name: r.name,
        setCode: r.set_code,
        setName: r.set_name,
        collectorNumber: r.collector_number,
        rarity: r.rarity,
        finish: r.finish,
        quantity: Number(r.quantity),
        imagePath: r.image_local_path,
        firstObtainedAt: String(r.first_obtained_at),
      })),
      nextCursor:
        hayMas && ultimo ? encodeCollectionCursor(Number(ultimo.print_id), ultimo.finish) : null,
    };
  }

  /**
   * Completitud por set.
   *
   * EL DENOMINADOR ES `in_boosters = 1`, no el total de impresiones del set. Si
   * se contaran todas, la completitud sería inalcanzable por construcción: más
   * de la mitad del catálogo de Magic nunca sale en un sobre (P-014). Prometerle
   * a un coleccionista un 100 % que no puede alcanzar abriendo sobres sería
   * mentirle.
   *
   * Se cuentan impresiones distintas, no copias: tener 40 repetidas de una
   * común no acerca a completar el set.
   */
  async completion(userId: number, game: GameCode): Promise<SetCompletion[]> {
    const rows = await this.db.select<{
      external_id: string; code: string; name: string; icon_local_path: string | null;
      pool_size: number; owned: number;
    }>(
      `SELECT s.external_id, s.code, s.name, s.icon_local_path,
              COUNT(DISTINCT p.id) AS pool_size,
              COUNT(DISTINCT uc.card_print_id) AS owned
       FROM sets s
       JOIN card_prints p ON p.set_id = s.id AND p.in_boosters = 1
       LEFT JOIN user_collection uc
              ON uc.card_print_id = p.id AND uc.user_id = ? AND uc.quantity > 0
       WHERE s.game_id = ?
       GROUP BY s.id
       HAVING pool_size > 0
       ORDER BY owned DESC, s.released_at DESC`,
      [userId, GAME_IDS[game]],
    );

    return rows.map((r) => {
      const poolSize = Number(r.pool_size);
      const owned = Number(r.owned);
      return {
        setExternalId: r.external_id,
        setCode: r.code,
        setName: r.name,
        // Ruta LOCAL, nunca la del origen (P-001, P-022). Nula si el icono no
        // se ha cosechado todavia.
        iconPath: r.icon_local_path,
        poolSize,
        owned,
        ratio: poolSize > 0 ? Number((owned / poolSize).toFixed(4)) : 0,
      };
    });
  }

  /** Resumen para la cabecera del perfil. */
  async summary(userId: number): Promise<{ entries: number; copies: number; openings: number }> {
    const rows = await this.db.select<{ entries: number; copies: number; openings: number }>(
      `SELECT
         (SELECT COUNT(*) FROM user_collection WHERE user_id = ?) AS entries,
         (SELECT COALESCE(SUM(quantity), 0) FROM user_collection WHERE user_id = ?) AS copies,
         (SELECT COUNT(*) FROM pack_openings WHERE user_id = ?) AS openings`,
      [userId, userId, userId],
    );
    const row = rows[0];
    return {
      entries: Number(row?.entries ?? 0),
      copies: Number(row?.copies ?? 0),
      openings: Number(row?.openings ?? 0),
    };
  }
}

export function encodeCollectionCursor(printId: number, finish: string): string {
  return Buffer.from(JSON.stringify([printId, finish]), 'utf8').toString('base64url');
}

export function decodeCollectionCursor(
  cursor: string | undefined,
): { printId: number; finish: string } | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [printId, finish] = parsed as [unknown, unknown];
    if (typeof printId !== 'number' || typeof finish !== 'string') return null;
    return { printId, finish };
  } catch {
    return null;
  }
}
