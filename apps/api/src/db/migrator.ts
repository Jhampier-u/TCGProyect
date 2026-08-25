import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Conexion minima que el migrador necesita. La cumple `mysql2/promise`. */
export interface MigrationConnection {
  query(sql: string): Promise<unknown>;
  /** Devuelve filas. Se separa de `query` para poder tipar el SELECT. */
  select<T>(sql: string): Promise<T[]>;
}

export interface MigrationResult {
  aplicadas: string[];
  yaEstaban: string[];
}

const REGISTRY_TABLE = 'schema_migrations';

/**
 * Migrador propio (ADR-006).
 *
 * Se descartaron `umzug` y `dbmate`: son ~100 lineas de codigo frente a integrar
 * y configurar una libreria, sin dependencia nueva, y con la ventaja de
 * entenderlo por completo el dia que falle.
 *
 * REGLAS QUE HACE CUMPLIR:
 *  - Las migraciones se aplican **en orden alfabetico de nombre**, que con el
 *    prefijo numerico (0001, 0002...) equivale al orden cronologico.
 *  - Una migracion ya aplicada NUNCA se vuelve a ejecutar. Es lo que permite que
 *    los seeds sean idempotentes sin depender de que alguien recuerde no
 *    relanzarlos.
 *  - Solo se consideran los ficheros `*.up.sql` y los que no llevan sufijo. Los
 *    `.down.sql` son manuales a proposito: deshacer en produccion debe ser una
 *    decision consciente, no un comando que se teclea por inercia.
 *
 * NOTA SOBRE TRANSACCIONES: MySQL hace *commit implicito* en cada DDL, asi que
 * envolver una migracion de esquema en una transaccion da una falsa sensacion de
 * atomicidad. No se envuelven. Si una migracion falla a medias hay que
 * arreglarla a mano, y por eso conviene que cada una haga una sola cosa.
 */
export class Migrator {
  constructor(
    private readonly connection: MigrationConnection,
    private readonly directory: string,
  ) {}

  async ensureRegistry(): Promise<void> {
    await this.connection.query(`
      CREATE TABLE IF NOT EXISTS ${REGISTRY_TABLE} (
        name        VARCHAR(191) NOT NULL,
        applied_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (name)
      ) ENGINE=InnoDB
    `);
  }

  /** Ficheros de migracion en orden de aplicacion. */
  async available(): Promise<string[]> {
    const files = await readdir(this.directory);
    return files
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort((a, b) => a.localeCompare(b, 'en'));
  }

  async applied(): Promise<Set<string>> {
    const rows = await this.connection.select<{ name: string }>(
      `SELECT name FROM ${REGISTRY_TABLE}`,
    );
    return new Set(rows.map((r) => r.name));
  }

  async migrate(): Promise<MigrationResult> {
    await this.ensureRegistry();

    const disponibles = await this.available();
    const yaAplicadas = await this.applied();
    const result: MigrationResult = { aplicadas: [], yaEstaban: [] };

    for (const name of disponibles) {
      if (yaAplicadas.has(name)) {
        result.yaEstaban.push(name);
        continue;
      }

      const sql = await readFile(join(this.directory, name), 'utf8');
      await this.connection.query(sql);
      // El registro se escribe DESPUES de aplicar. Si la migracion falla, no
      // queda marcada y el siguiente intento la reintentara.
      await this.connection.query(
        `INSERT INTO ${REGISTRY_TABLE} (name) VALUES (${quote(name)})`,
      );
      result.aplicadas.push(name);
    }

    return result;
  }
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
