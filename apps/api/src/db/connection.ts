import mysql from 'mysql2/promise';
import type { MigrationConnection } from './migrator.js';

/**
 * Conexion a MySQL sobre `mysql2` (ADR-006).
 *
 * `multipleStatements` esta activo porque los ficheros de migracion contienen
 * varias sentencias. Es una opcion con fama de peligrosa —facilita la inyeccion
 * SQL si se concatenan datos de usuario— y por eso el uso esta acotado: este
 * pool solo lo consumen el migrador y los repositorios, que parametrizan todo lo
 * que viene de fuera. Ningun dato de un usuario final llega aqui sin parametrizar.
 */
export interface DbConfig {
  url: string;
  connectionLimit?: number;
}

export class Database implements MigrationConnection {
  readonly #pool: mysql.Pool;

  constructor(config: DbConfig) {
    this.#pool = mysql.createPool({
      uri: config.url,
      // 16 y no los 10 de antes: el rail de Yu-Gi-Oh! con sesion lanza 12
      // recuentos en paralelo (seis y sus parejas de tenencia, T-110). Con 10,
      // dos esperaban a que acabara otro, y un solo usuario agotaba el pool.
      connectionLimit: config.connectionLimit ?? 16,
      multipleStatements: true,
      // El driver devuelve DECIMAL y BIGINT como cadena por defecto para no
      // perder precision. Se dejan como estan y se convierten donde importa:
      // un id que viaja como cadena es preferible a uno redondeado en silencio.
      dateStrings: true,
      charset: 'utf8mb4',
    });
  }

  async query(sql: string, params: unknown[] = []): Promise<void> {
    await this.#pool.query(sql, params);
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.#pool.query(sql, params);
    return rows as T[];
  }

  /** Ejecuta dentro de una transaccion. Solo para DML: el DDL hace commit implicito. */
  async transaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
    const conn = await this.#pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
