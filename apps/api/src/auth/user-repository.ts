import type { Database } from '../db/connection.js';

export interface UserRecord {
  id: number;
  email: string;
  displayName: string;
  /** Nunca sale de esta capa. Los esquemas de respuesta no lo declaran (ADR-007). */
  passwordHash: string;
  createdAt: string;
}

export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
}

export class EmailAlreadyExistsError extends Error {
  constructor(readonly email: string) {
    super(`Ya existe una cuenta con el correo ${email}`);
    this.name = 'EmailAlreadyExistsError';
  }
}

export class UserRepository {
  constructor(private readonly db: Database) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.db.select<{
      id: number; email: string; display_name: string; password_hash: string; created_at: string;
    }>(
      `SELECT id, email, display_name, password_hash, created_at FROM users WHERE email = ?`,
      [email],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async findById(id: number): Promise<PublicUser | null> {
    const rows = await this.db.select<{ id: number; email: string; display_name: string }>(
      `SELECT id, email, display_name FROM users WHERE id = ?`,
      [id],
    );
    const row = rows[0];
    return row ? { id: Number(row.id), email: row.email, displayName: row.display_name } : null;
  }

  /**
   * Crea una cuenta.
   *
   * La unicidad la impone la base de datos, no una comprobacion previa: entre un
   * `SELECT` de comprobacion y el `INSERT` cabe otra peticion, y dos registros
   * simultaneos con el mismo correo se colarian. Se intenta insertar y se traduce
   * el error de clave duplicada.
   */
  async create(email: string, displayName: string, passwordHash: string): Promise<PublicUser> {
    try {
      await this.db.query(
        `INSERT INTO users (email, display_name, password_hash) VALUES (?, ?, ?)`,
        [email, displayName, passwordHash],
      );
    } catch (error) {
      if (isDuplicate(error, 'uq_users_email')) throw new EmailAlreadyExistsError(email);
      throw error;
    }

    const created = await this.findByEmail(email);
    if (!created) throw new Error('La cuenta se creo pero no se pudo releer');
    return { id: created.id, email: created.email, displayName: created.displayName };
  }
}

function toRecord(row: {
  id: number; email: string; display_name: string; password_hash: string; created_at: string;
}): UserRecord {
  return {
    id: Number(row.id),
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    createdAt: String(row.created_at),
  };
}

function isDuplicate(error: unknown, indexName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: string; message?: string };
  return e.code === 'ER_DUP_ENTRY' && (e.message ?? '').includes(indexName);
}
