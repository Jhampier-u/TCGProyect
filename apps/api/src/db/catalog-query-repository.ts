import type { GameCode } from '@tcg/shared';
import { GAME_IDS, isGameCode } from '@tcg/shared';
import type { Database } from './connection.js';

/**
 * Longitud minima para usar busqueda FULLTEXT.
 *
 * InnoDB ignora por defecto los tokens de menos de 3 caracteres
 * (`innodb_ft_min_token_size = 3`), asi que un MATCH con "ra" no devolveria
 * nada. Por debajo de ese umbral se cae a un LIKE por prefijo, que para dos
 * letras es ademas lo que el usuario espera mientras teclea.
 */
export const MIN_FULLTEXT_LENGTH = 3;

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 40;

export interface CardSummary {
  /**
   * Id de la CARTA, no de la impresion. Se llama `cardId` y no `id` porque
   * conviven los dos en la misma respuesta y `id` a secas es ambiguo — y sobre
   * todo porque es el nombre que declara el esquema de la API: si no coinciden,
   * Fastify descarta el campo sin decir nada (P-024).
   */
  cardId: number;
  /**
   * Identidad de la carta en su origen: `oracle_id` en Magic, passcode en
   * Yu-Gi-Oh!, `set-numero` en Pokemon. El cliente la necesita para exportar
   * un `.ydk`, cuyo contenido son passcodes (T-048).
   */
  oracleKey: string;
  game: GameCode;
  name: string;
  typeLine: string | null;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  /** Ruta LOCAL. Nunca una URL externa (P-001). */
  imagePath: string | null;
  printId: number;
}

export interface CardDetail extends CardSummary {
  rulesText: string | null;
  gameData: Record<string, unknown>;
  releasedAt: string | null;
  finishes: string[];
  inBoosters: boolean;
}

export interface CardQuery {
  game?: GameCode;
  set?: string;
  rarity?: string;
  q?: string;
  /** Cursor opaco de paginacion keyset. */
  cursor?: string;
  limit?: number;
}

export interface CardPage {
  items: CardSummary[];
  /** Cursor para la siguiente pagina, o null si no hay mas. */
  nextCursor: string | null;
}

export interface SetSummary {
  /**
   * Id numerico. Se expone porque `POST /api/packs/open` lo necesita y es lo
   * unico que identifica un set de forma global: `externalId` solo es unico
   * DENTRO de un juego. Sin esto, el frontend no puede enlazar el selector de
   * set con la apertura de sobres.
   */
  id: number;
  externalId: string;
  code: string;
  name: string;
  releasedAt: string | null;
  cardCount: number;
  iconUrl: string | null;
  /** Impresiones que pueden salir en sobre. 0 significa que no se puede abrir. */
  poolSize: number;
}

/**
 * Consultas de lectura del catalogo (H3).
 *
 * Separada de `CatalogRepository`, que es de escritura: la ingesta y la API
 * tienen patrones de acceso opuestos y mezclarlas complicaria las dos.
 */
export class CatalogQueryRepository {
  constructor(private readonly db: Database) {}

  async listGames(): Promise<Array<{ code: string; name: string }>> {
    return this.db.select(`SELECT code, name FROM games ORDER BY id`);
  }

  async listSets(game: GameCode): Promise<SetSummary[]> {
    const rows = await this.db.select<{
      id: number; external_id: string; code: string; name: string; released_at: string | null;
      card_count: number; icon_url: string | null; pool_size: number;
    }>(
      `SELECT s.id, s.external_id, s.code, s.name, s.released_at, s.card_count, s.icon_url,
              COUNT(p.id) AS pool_size
       FROM sets s
       LEFT JOIN card_prints p ON p.set_id = s.id AND p.in_boosters = 1
       WHERE s.game_id = ?
       GROUP BY s.id
       ORDER BY s.released_at DESC, s.id DESC`,
      [GAME_IDS[game]],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      externalId: r.external_id,
      code: r.code,
      name: r.name,
      releasedAt: r.released_at,
      cardCount: Number(r.card_count),
      iconUrl: r.icon_url,
      poolSize: Number(r.pool_size),
    }));
  }

  /**
   * Busqueda paginada por KEYSET, no por OFFSET.
   *
   * Con `LIMIT ? OFFSET ?`, pedir la pagina 500 obliga a MySQL a leer y descartar
   * 20.000 filas. Sobre 116.752 impresiones de Magic eso degrada hasta ser
   * inusable. El keyset usa la ultima clave vista como punto de corte, asi que
   * la pagina 500 cuesta lo mismo que la primera.
   *
   * EL DESEMPATE ES `card_prints.id`, NO `cards.id`.
   *
   * Cada fila del resultado es una IMPRESION, y varias impresiones comparten la
   * misma carta conceptual: en Yu-Gi-Oh! la misma carta sale en dos rarezas
   * dentro del mismo set (P-013). Con `cards.id` como desempate, el cursor
   * `(name, cards.id)` no identifica una fila sino un grupo, y al pedir "lo que
   * va despues" se salta el resto de impresiones de esa carta.
   *
   * Medido antes de corregirlo: 723 de 733 impresiones devueltas. **Diez filas
   * desaparecidas del catalogo, en silencio.** Con `card_prints.id` el par es
   * unico por fila y la cobertura es completa.
   */
  async searchCards(query: CardQuery): Promise<CardPage> {
    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const where: string[] = [];
    const params: unknown[] = [];

    if (query.game) {
      where.push('c.game_id = ?');
      params.push(GAME_IDS[query.game]);
    }
    if (query.set) {
      where.push('s.external_id = ?');
      params.push(query.set);
    }
    if (query.rarity) {
      where.push('r.code = ?');
      params.push(query.rarity);
    }

    const texto = (query.q ?? '').trim();
    if (texto.length >= MIN_FULLTEXT_LENGTH) {
      where.push('MATCH(c.name, c.rules_text) AGAINST(? IN BOOLEAN MODE)');
      params.push(toBooleanQuery(texto));
    } else if (texto.length > 0) {
      where.push('c.name LIKE ?');
      params.push(`${escapeLike(texto)}%`);
    }

    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      // El par (name, id) es la clave de orden: se pide estrictamente lo que va
      // despues del ultimo elemento visto.
      where.push('(c.name > ? OR (c.name = ? AND p.id > ?))');
      params.push(cursor.name, cursor.name, cursor.id);
    }

    // Se piden `limit + 1` filas: si llega la extra, hay pagina siguiente. Evita
    // un COUNT(*) aparte, que sobre un catalogo grande cuesta tanto como la
    // propia consulta.
    const rows = await this.db.select<CardRow>(
      `SELECT c.id, c.oracle_key, c.game_id, c.name, c.type_line,
              s.code AS set_code, s.name AS set_name,
              p.id AS print_id, p.collector_number, p.image_local_path,
              r.code AS rarity
       FROM cards c
       JOIN card_prints p ON p.card_id = c.id
       JOIN sets s ON s.id = p.set_id
       JOIN rarities r ON r.id = p.rarity_id
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY c.name ASC, p.id ASC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const hayMas = rows.length > limit;
    const visibles = hayMas ? rows.slice(0, limit) : rows;
    const ultimo = visibles[visibles.length - 1];

    return {
      items: visibles.map(toSummary),
      // El cursor lleva el id de la IMPRESION, que es lo unico unico por fila.
      nextCursor: hayMas && ultimo ? encodeCursor(ultimo.name, Number(ultimo.print_id)) : null,
    };
  }

  async findCard(printId: number): Promise<CardDetail | null> {
    const rows = await this.db.select<CardRow & {
      rules_text: string | null; game_data: unknown; released_at: string | null;
      finishes: unknown; in_boosters: number;
    }>(
      `SELECT c.id, c.oracle_key, c.game_id, c.name, c.type_line, c.rules_text, c.game_data,
              s.code AS set_code, s.name AS set_name, s.released_at,
              p.id AS print_id, p.collector_number, p.image_local_path,
              p.finishes, p.in_boosters,
              r.code AS rarity
       FROM card_prints p
       JOIN cards c ON c.id = p.card_id
       JOIN sets s ON s.id = p.set_id
       JOIN rarities r ON r.id = p.rarity_id
       WHERE p.id = ?`,
      [printId],
    );
    const row = rows[0];
    if (!row) return null;

    return {
      ...toSummary(row),
      rulesText: row.rules_text,
      gameData: parseJson(row.game_data, {}) as Record<string, unknown>,
      releasedAt: row.released_at,
      finishes: parseJson(row.finishes, []) as string[],
      inBoosters: Number(row.in_boosters) === 1,
    };
  }

  /** Rarezas de un juego, para poblar el filtro del frontend. */
  async listRarities(game: GameCode): Promise<Array<{ code: string; label: string; tier: number }>> {
    const rows = await this.db.select<{ code: string; label: string; tier: number }>(
      `SELECT code, label, tier FROM rarities WHERE game_id = ? ORDER BY tier, code`,
      [GAME_IDS[game]],
    );
    return rows.map((r) => ({ code: r.code, label: r.label, tier: Number(r.tier) }));
  }
}

export interface CardRow {
  id: number; oracle_key: string; game_id: number; name: string; type_line: string | null;
  set_code: string; set_name: string; print_id: number;
  collector_number: string; image_local_path: string | null; rarity: string;
}

/**
 * Fila cruda -> resumen de carta.
 *
 * Se exporta para que un test pueda comparar los campos que produce con los que
 * declara el esquema de la API. No es cosmetico: el esquema es un literal JSON
 * y TypeScript no lo relaciona con `CardSummary`, asi que hasta P-024 nadie
 * comprobaba que los dos lados dijeran lo mismo — y Fastify descarta en
 * silencio lo que no cuadra.
 */
export function toSummary(row: CardRow): CardSummary {
  const game = gameCodeOf(Number(row.game_id));
  return {
    cardId: Number(row.id),
    oracleKey: row.oracle_key,
    game,
    name: row.name,
    typeLine: row.type_line,
    setCode: row.set_code,
    setName: row.set_name,
    collectorNumber: row.collector_number,
    rarity: row.rarity,
    // SOLO la ruta local. `image_source_url` ni se selecciona (P-001).
    imagePath: row.image_local_path,
    printId: Number(row.print_id),
  };
}

/**
 * Traduce texto libre a una consulta BOOLEAN MODE segura.
 *
 * Los operadores de MySQL (`+ - > < ( ) ~ * " @`) se eliminan en vez de
 * escaparse: dejarlos pasar permite que el usuario provoque errores de sintaxis
 * o consultas absurdamente caras. Cada token recibe un `*` final para que
 * buscar "light" encuentre "Lightning Bolt", que es lo que la gente espera.
 */
export function toBooleanQuery(raw: string): string {
  return raw
    .replace(/[+\-><()~*"@]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= MIN_FULLTEXT_LENGTH)
    .map((t) => `+${t}*`)
    .join(' ');
}

function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Cursor opaco. Se codifica para que nadie lo trate como un numero de pagina. */
export function encodeCursor(name: string, id: number): string {
  return Buffer.from(JSON.stringify([name, id]), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { name: string; id: number } | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [name, id] = parsed as [unknown, unknown];
    if (typeof name !== 'string' || typeof id !== 'number') return null;
    return { name, id };
  } catch {
    // Un cursor corrupto se ignora y se sirve la primera pagina. Es preferible a
    // un 500 por un enlace viejo o manipulado.
    return null;
  }
}

function parseJson(value: unknown, fallback: unknown): unknown {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function gameCodeOf(id: number): GameCode {
  const entry = (Object.entries(GAME_IDS) as Array<[GameCode, number]>).find(([, v]) => v === id);
  if (!entry) throw new Error(`game_id desconocido: ${id}`);
  return entry[0];
}

export { isGameCode };
