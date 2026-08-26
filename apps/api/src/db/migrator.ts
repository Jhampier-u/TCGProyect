import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { quitarSentenciasDeBase } from './migration-sql.js';

/** Conexion minima que el migrador necesita. La cumple `mysql2/promise`. */
export interface MigrationConnection {
  query(sql: string): Promise<unknown>;
  /** Devuelve filas. Se separa de `query` para poder tipar el SELECT. */
  select<T>(sql: string): Promise<T[]>;
}

export interface MigrationResult {
  aplicadas: string[];
  yaEstaban: string[];
  /** Sentencias `USE` / `CREATE DATABASE` retiradas, por fichero (T-065). */
  sentenciasDeBaseRetiradas: Array<{ fichero: string; sentencias: string[] }>;
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
 *  - **Una migracion no elige contra que base se aplica** (T-065). Los `USE` y
 *    los `CREATE DATABASE` se retiran antes de ejecutar, y despues de cada
 *    fichero se comprueba que la base sigue siendo la misma. La base la decide
 *    la conexion, y solo la conexion. Ver `migration-sql.ts` y P-032.
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
    const result: MigrationResult = { aplicadas: [], yaEstaban: [], sentenciasDeBaseRetiradas: [] };
    const base = await this.#baseActual();

    for (const name of disponibles) {
      if (yaAplicadas.has(name)) {
        result.yaEstaban.push(name);
        continue;
      }

      const crudo = await readFile(join(this.directory, name), 'utf8');
      const { sql, quitadas } = quitarSentenciasDeBase(crudo);
      if (quitadas.length > 0) {
        result.sentenciasDeBaseRetiradas.push({ fichero: name, sentencias: quitadas });
      }

      await this.connection.query(sql);

      // CINTURON Y TIRANTES. Quitar los `USE` cubre la forma conocida de
      // cambiarse de base; esto cubre las que no se han previsto -- un
      // procedimiento almacenado, un `USE` con un comentario detras que la regla
      // de linea no reconoce.
      //
      // LO QUE ESTO PUEDE Y LO QUE NO. Corre DESPUES de ejecutar el fichero, asi
      // que no evita lo que ese fichero ya haya hecho en la base equivocada:
      // MySQL confirma cada DDL al vuelo y no hay transaccion que deshacer.
      // Lo que si evita es que la ejecucion siga y que la migracion quede
      // ANOTADA COMO APLICADA en una base donde no ha creado nada. Esa
      // discrepancia entre tablas y registro es P-032, y es lo que convierte un
      // fallo en dos bases inconsistentes y en silencio.
      const ahora = await this.#baseActual();
      if (ahora !== base) {
        throw new Error(
          `La migracion "${name}" ha cambiado la base de datos activa de "${base ?? 'ninguna'}" a ` +
            `"${ahora ?? 'ninguna'}". Una migracion describe un esquema, no elige donde vive (P-032).`,
        );
      }
      // El registro se escribe DESPUES de aplicar. Si la migracion falla, no
      // queda marcada y el siguiente intento la reintentara.
      await this.connection.query(
        `INSERT INTO ${REGISTRY_TABLE} (name) VALUES (${quote(name)})`,
      );
      result.aplicadas.push(name);
    }

    return result;
  }

  /** La base contra la que esta trabajando la conexion ahora mismo. */
  async #baseActual(): Promise<string | null> {
    const filas = await this.connection.select<{ db: string | null }>('SELECT DATABASE() AS db');
    return filas[0]?.db ?? null;
  }
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
