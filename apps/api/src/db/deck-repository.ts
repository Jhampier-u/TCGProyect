import type { GameCode, DeckZone, GameData } from '@tcg/shared';
import { GAME_IDS } from '@tcg/shared';
import type { Database } from './connection.js';

export interface DeckSummary {
  id: number;
  game: GameCode;
  name: string;
  description: string | null;
  format: string | null;
  isPublic: boolean;
  counts: Record<DeckZone, number>;
  createdAt: string;
  updatedAt: string;
}

/** Una carta del mazo, ya resuelta contra el catalogo y contra la coleccion. */
export interface DeckCardRow {
  printId: number;
  cardId: number;
  oracleKey: string;
  name: string;
  typeLine: string | null;
  gameData: GameData;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  zone: DeckZone;
  quantity: number;
  imagePath: string | null;
  /** Copias que el usuario posee, sumando acabados. 0 si no la tiene (RN-03). */
  owned: number;
}

export interface DeckDetail extends DeckSummary {
  cards: DeckCardRow[];
}

export interface DeckInput {
  game: GameCode;
  name: string;
  description?: string | null;
  format?: string | null;
  isPublic?: boolean;
}

export interface DeckHeaderPatch {
  name?: string;
  description?: string | null;
  format?: string | null;
  isPublic?: boolean;
}

export interface DeckCardInput {
  printId: number;
  zone: DeckZone;
  quantity: number;
}

/** Impresion resuelta: sirve para comprobar existencia y juego de golpe. */
export interface ResolvedPrint {
  printId: number;
  game: GameCode;
}

/** Una linea de una lista pegada, tal como la devuelve el codec del juego. */
export interface DeckLineInput {
  quantity: number;
  zone: DeckZone;
  name?: string;
  externalId?: string;
  setCode?: string;
  collectorNumber?: string;
}

export interface ResolvedLine {
  printId: number;
  cardId: number;
  oracleKey: string;
  name: string;
  typeLine: string | null;
  gameData: GameData;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  imagePath: string | null;
  zone: DeckZone;
  quantity: number;
}

export interface UnresolvedLine {
  name: string | null;
  externalId: string | null;
  quantity: number;
  zone: DeckZone;
}

interface DeckRow {
  id: number;
  game: string;
  name: string;
  description: string | null;
  format: string | null;
  is_public: number;
  created_at: string;
  updated_at: string;
  main: number;
  extra: number;
  side: number;
  commander: number;
}

const EMPTY_COUNTS: Record<DeckZone, number> = { main: 0, extra: 0, side: 0, commander: 0 };

/**
 * Acceso a `decks` y `deck_cards` en SQL plano (ADR-006).
 *
 * TODA operacion lleva `user_id` en el WHERE. No se lee primero y se comprueba
 * despues: la pertenencia es parte de la consulta. Un `findById` que devolviera
 * el mazo y dejara la comprobacion a la capa de arriba seria una fuga esperando
 * a que alguien olvide el `if`.
 */
export class DeckRepository {
  constructor(private readonly db: Database) {}

  async listByUser(userId: number, game?: GameCode): Promise<DeckSummary[]> {
    const where = ['d.user_id = ?'];
    const params: unknown[] = [userId];
    if (game) {
      where.push('d.game_id = ?');
      params.push(GAME_IDS[game]);
    }

    const rows = await this.db.select<DeckRow>(
      `SELECT d.id, g.code AS game, d.name, d.description, d.format, d.is_public,
              d.created_at, d.updated_at,
              COALESCE(SUM(CASE WHEN dc.zone = 'main' THEN dc.quantity END), 0) AS main,
              COALESCE(SUM(CASE WHEN dc.zone = 'extra' THEN dc.quantity END), 0) AS extra,
              COALESCE(SUM(CASE WHEN dc.zone = 'side' THEN dc.quantity END), 0) AS side,
              COALESCE(SUM(CASE WHEN dc.zone = 'commander' THEN dc.quantity END), 0) AS commander
       FROM decks d
       JOIN games g ON g.id = d.game_id
       LEFT JOIN deck_cards dc ON dc.deck_id = d.id
       WHERE ${where.join(' AND ')}
       GROUP BY d.id
       ORDER BY d.updated_at DESC, d.id DESC`,
      params,
    );

    return rows.map((row) => toSummary(row));
  }

  /**
   * Mazo completo. Dos consultas —cabecera y cartas—, nunca una por carta.
   *
   * El JOIN con `cards` trae lo que el motor de reglas necesita (`oracle_key`,
   * `type_line`, `game_data`); la subconsulta correlacionada trae las copias
   * poseidas sumando acabados. Devuelve 0 cuando el usuario no tiene la carta:
   * en un mazo, "no la tienes" es informacion, no un motivo para ocultarla
   * (RN-03).
   */
  async findById(deckId: number, userId: number): Promise<DeckDetail | null> {
    const cabeceras = await this.db.select<Omit<DeckRow, 'main' | 'extra' | 'side' | 'commander'>>(
      `SELECT d.id, g.code AS game, d.name, d.description, d.format, d.is_public,
              d.created_at, d.updated_at
       FROM decks d
       JOIN games g ON g.id = d.game_id
       WHERE d.id = ? AND d.user_id = ?`,
      [deckId, userId],
    );

    const cabecera = cabeceras[0];
    if (!cabecera) return null;

    const filas = await this.db.select<{
      print_id: number;
      card_id: number;
      oracle_key: string;
      name: string;
      type_line: string | null;
      game_data: GameData;
      set_code: string;
      set_name: string;
      collector_number: string;
      rarity: string;
      zone: DeckZone;
      quantity: number;
      image_local_path: string | null;
      owned: number;
    }>(
      `SELECT p.id AS print_id, c.id AS card_id, c.oracle_key, c.name, c.type_line,
              c.game_data, s.code AS set_code, s.name AS set_name,
              p.collector_number, r.code AS rarity, dc.zone, dc.quantity,
              p.image_local_path,
              (SELECT COALESCE(SUM(uc.quantity), 0)
                 FROM user_collection uc
                WHERE uc.user_id = ? AND uc.card_print_id = p.id) AS owned
       FROM deck_cards dc
       JOIN card_prints p ON p.id = dc.card_print_id
       JOIN cards c ON c.id = p.card_id
       JOIN sets s ON s.id = p.set_id
       JOIN rarities r ON r.id = p.rarity_id
       WHERE dc.deck_id = ?
       ORDER BY dc.zone, c.name, p.id`,
      [userId, deckId],
    );

    const counts = { ...EMPTY_COUNTS };
    const cards: DeckCardRow[] = filas.map((fila) => {
      counts[fila.zone] += Number(fila.quantity);
      return {
        printId: Number(fila.print_id),
        cardId: Number(fila.card_id),
        oracleKey: fila.oracle_key,
        name: fila.name,
        typeLine: fila.type_line,
        gameData: fila.game_data,
        setCode: fila.set_code,
        setName: fila.set_name,
        collectorNumber: fila.collector_number,
        rarity: fila.rarity,
        zone: fila.zone,
        quantity: Number(fila.quantity),
        imagePath: fila.image_local_path,
        owned: Number(fila.owned),
      };
    });

    return { ...toSummary({ ...cabecera, ...EMPTY_COUNTS }), counts, cards };
  }

  /**
   * Crea el mazo y devuelve su resumen.
   *
   * El id sale de `insertId`, como en `PackRepositoryMysql`: MySQL 8 no soporta
   * `INSERT ... RETURNING` (eso es de MariaDB). Va en transaccion para que el
   * INSERT y la lectura del id compartan conexion.
   */
  async create(userId: number, input: DeckInput): Promise<DeckSummary> {
    const id = await this.db.transaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO decks (user_id, game_id, name, description, format, is_public)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          GAME_IDS[input.game],
          input.name,
          input.description ?? null,
          input.format ?? null,
          input.isPublic ? 1 : 0,
        ],
      );
      return Number((result as { insertId: number }).insertId);
    });

    const mazo = (await this.listByUser(userId)).find((d) => d.id === id);
    if (!mazo) throw new Error(`El mazo ${id} no aparece tras crearlo`);
    return mazo;
  }

  async updateHeader(
    deckId: number,
    userId: number,
    patch: DeckHeaderPatch,
  ): Promise<DeckSummary | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      sets.push('name = ?');
      params.push(patch.name);
    }
    if (patch.description !== undefined) {
      sets.push('description = ?');
      params.push(patch.description);
    }
    if (patch.format !== undefined) {
      sets.push('format = ?');
      params.push(patch.format);
    }
    if (patch.isPublic !== undefined) {
      sets.push('is_public = ?');
      params.push(patch.isPublic ? 1 : 0);
    }

    if (sets.length > 0) {
      params.push(deckId, userId);
      await this.db.query(`UPDATE decks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
    }

    const mazos = await this.listByUser(userId);
    return mazos.find((d) => d.id === deckId) ?? null;
  }

  /**
   * Reemplaza el contenido entero, en una transaccion.
   *
   * Sin transaccion, un fallo a mitad deja el mazo vacio. El `SELECT ... FOR
   * UPDATE` inicial hace dos cosas a la vez: comprueba la pertenencia y bloquea
   * la fila mientras se reescribe.
   *
   * Devuelve false si el mazo no existe o no es del usuario, para que la ruta
   * responda 404 sin una consulta previa.
   */
  async replaceCards(
    deckId: number,
    userId: number,
    entries: readonly DeckCardInput[],
  ): Promise<boolean> {
    // Dos filas con la misma (impresion, zona) violarian uq_deck_card_zone. Se
    // fusionan sumando: el cliente manda una lista, no un conjunto.
    const fusionadas = new Map<string, DeckCardInput>();
    for (const entry of entries) {
      const clave = `${entry.printId}:${entry.zone}`;
      const previa = fusionadas.get(clave);
      fusionadas.set(
        clave,
        previa ? { ...previa, quantity: previa.quantity + entry.quantity } : { ...entry },
      );
    }

    return this.db.transaction(async (conn) => {
      const [propias] = await conn.query(
        'SELECT id FROM decks WHERE id = ? AND user_id = ? FOR UPDATE',
        [deckId, userId],
      );
      if ((propias as unknown[]).length === 0) return false;

      await conn.query('DELETE FROM deck_cards WHERE deck_id = ?', [deckId]);

      const filas = [...fusionadas.values()];
      if (filas.length > 0) {
        const valores = filas.map(() => '(?, ?, ?, ?)').join(', ');
        const params = filas.flatMap((f) => [deckId, f.printId, f.zone, f.quantity]);
        await conn.query(
          `INSERT INTO deck_cards (deck_id, card_print_id, zone, quantity) VALUES ${valores}`,
          params,
        );
      }

      // updated_at solo salta si cambia alguna columna de `decks`; se toca a
      // mano para que la lista ordenada por fecha refleje la edicion.
      await conn.query('UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deckId]);
      return true;
    });
  }

  async remove(deckId: number, userId: number): Promise<boolean> {
    const filas = await this.db.select<{ id: number }>(
      'SELECT id FROM decks WHERE id = ? AND user_id = ?',
      [deckId, userId],
    );
    if (filas.length === 0) return false;
    // deck_cards cae por ON DELETE CASCADE.
    await this.db.query('DELETE FROM decks WHERE id = ? AND user_id = ?', [deckId, userId]);
    return true;
  }

  /**
   * Resuelve impresiones a su juego, en UNA consulta.
   *
   * La ruta lo usa para distinguir "no existe" de "es de otro juego" sin pedir
   * las cartas una a una.
   */
  async resolvePrints(printIds: readonly number[]): Promise<ResolvedPrint[]> {
    // Sin filtro de `withdrawn_at`, a proposito (T-083). Esto valida los ids que
    // el usuario manda al guardar un mazo, y un mazo que ya contenia una
    // impresion retirada tiene que poder guardarse. Filtrar aqui haria que
    // guardar un mazo viejo fallara con "esa carta no existe".
    if (printIds.length === 0) return [];
    const huecos = printIds.map(() => '?').join(', ');
    const filas = await this.db.select<{ print_id: number; game: string }>(
      `SELECT p.id AS print_id, g.code AS game
       FROM card_prints p
       JOIN sets s ON s.id = p.set_id
       JOIN games g ON g.id = s.game_id
       WHERE p.id IN (${huecos})`,
      [...printIds],
    );
    return filas.map((fila) => ({
      printId: Number(fila.print_id),
      game: fila.game as GameCode,
    }));
  }

  /**
   * Resuelve lineas de una lista pegada contra el catalogo, en UNA consulta.
   *
   * No muta nada: devuelve lo que ha encontrado y lo que no. Con pocos sets
   * ingestados lo normal es que falte bastante, y decirlo es mas util que
   * fallar entero.
   */
  async resolveLines(
    game: GameCode,
    lines: readonly DeckLineInput[],
  ): Promise<{ resolved: ResolvedLine[]; unresolved: UnresolvedLine[] }> {
    const aFuera = (l: DeckLineInput): UnresolvedLine => ({
      name: l.name ?? null,
      externalId: l.externalId ?? null,
      quantity: l.quantity,
      zone: l.zone,
    });

    if (lines.length === 0) return { resolved: [], unresolved: [] };

    const claves = [...new Set(lines.map((l) => l.externalId).filter((v): v is string => !!v))];
    const nombres = [...new Set(lines.map((l) => l.name).filter((v): v is string => !!v))];

    const condiciones: string[] = [];
    const params: unknown[] = [GAME_IDS[game]];
    if (claves.length > 0) {
      condiciones.push(`c.oracle_key IN (${claves.map(() => '?').join(', ')})`);
      params.push(...claves);
    }
    if (nombres.length > 0) {
      condiciones.push(`c.name IN (${nombres.map(() => '?').join(', ')})`);
      params.push(...nombres);
    }
    if (condiciones.length === 0) return { resolved: [], unresolved: lines.map(aFuera) };

    const filas = await this.db.select<{
      print_id: number; card_id: number; oracle_key: string; name: string;
      type_line: string | null; game_data: GameData; set_code: string;
      collector_number: string; rarity: string; image_local_path: string | null;
    }>(
      `SELECT p.id AS print_id, c.id AS card_id, c.oracle_key, c.name, c.type_line,
              c.game_data, s.code AS set_code, p.collector_number, r.code AS rarity,
              p.image_local_path
       FROM cards c
       JOIN card_prints p ON p.card_id = c.id
       JOIN sets s ON s.id = p.set_id
       JOIN rarities r ON r.id = p.rarity_id
       WHERE c.game_id = ? AND (${condiciones.join(' OR ')})
       ORDER BY p.withdrawn_at IS NOT NULL, p.id ASC`,
      params,
    );

    // `ORDER BY ... p.id ASC` + escribir solo si falta => se queda la impresion
    // de menor id. Determinista y reproducible entre ejecuciones.
    //
    // Las RETIRADAS van al final en vez de excluirse (T-083): si de un nombre
    // solo quedan retiradas, es preferible resolverlo a una de ellas que decirle
    // al usuario que su carta no existe. Excluirlas convertiria un import
    // correcto en una linea no reconocida.
    const porClave = new Map<string, (typeof filas)[number]>();
    const porNombre = new Map<string, (typeof filas)[number]>();
    const porImpresion = new Map<string, (typeof filas)[number]>();
    for (const fila of filas) {
      if (!porClave.has(fila.oracle_key)) porClave.set(fila.oracle_key, fila);
      const nombre = fila.name.toLowerCase();
      if (!porNombre.has(nombre)) porNombre.set(nombre, fila);
      porImpresion.set(
        `${fila.set_code.toLowerCase()}:${fila.collector_number.toLowerCase()}`,
        fila,
      );
    }

    const resolved: ResolvedLine[] = [];
    const unresolved: UnresolvedLine[] = [];

    for (const linea of lines) {
      // Si la linea trae set y numero, se prefiere ESA impresion exacta.
      const exacta =
        linea.setCode && linea.collectorNumber
          ? porImpresion.get(
              `${linea.setCode.toLowerCase()}:${linea.collectorNumber.toLowerCase()}`,
            )
          : undefined;
      const fila =
        exacta ??
        (linea.externalId ? porClave.get(linea.externalId) : undefined) ??
        (linea.name ? porNombre.get(linea.name.toLowerCase()) : undefined);

      if (!fila) {
        unresolved.push(aFuera(linea));
        continue;
      }

      resolved.push({
        printId: Number(fila.print_id),
        cardId: Number(fila.card_id),
        oracleKey: fila.oracle_key,
        name: fila.name,
        typeLine: fila.type_line,
        gameData: fila.game_data,
        setCode: fila.set_code,
        collectorNumber: fila.collector_number,
        rarity: fila.rarity,
        imagePath: fila.image_local_path,
        zone: linea.zone,
        quantity: linea.quantity,
      });
    }

    return { resolved, unresolved };
  }
}

function toSummary(row: DeckRow): DeckSummary {
  return {
    id: Number(row.id),
    game: row.game as GameCode,
    name: row.name,
    description: row.description,
    format: row.format,
    isPublic: Number(row.is_public) === 1,
    counts: {
      main: Number(row.main),
      extra: Number(row.extra),
      side: Number(row.side),
      commander: Number(row.commander),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
