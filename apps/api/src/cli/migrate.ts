import mysql from 'mysql2/promise';
import { loadConfig } from '../config.js';
import { Database, Migrator } from '../db/index.js';

/**
 * `npm run db:migrate` — crea la base de datos si falta y aplica lo pendiente.
 *
 * T-022. Hasta ahora, en el arranque local habia que crear la base a mano antes
 * de nada: el migrador ya la necesita para conectarse, aunque la migracion 0001
 * lleve dentro un `CREATE DATABASE`. Era el ultimo paso manual del README, y en
 * Docker no hacia falta porque la imagen de MySQL la crea sola (S019). Aqui se
 * cierra tambien para quien no use Docker.
 *
 * El nombre de la base sale de `DATABASE_URL`, no de una constante: si alguien
 * apunta a `proyecto_tcg_test`, esa es la que hay que crear.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const url = new URL(config.databaseUrl);

  // `pathname` viene como "/proyecto_tcg".
  const nombre = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (nombre === '') {
    throw new Error('DATABASE_URL no incluye el nombre de la base de datos');
  }

  // Se conecta SIN base para poder crearla. La intercalacion es la del DDL: si
  // la base se crea con otra, los indices FULLTEXT y las comparaciones de nombre
  // se comportan distinto y el sintoma aparece mucho despues.
  const sinBase = new URL(config.databaseUrl);
  sinBase.pathname = '/';
  const admin = await mysql.createConnection({ uri: sinBase.toString() });
  try {
    // El identificador no puede parametrizarse, asi que se acota a lo que un
    // nombre de base puede ser. Sale de una variable de entorno del operador,
    // no de un usuario, pero concatenar SQL sin mirar es como se empieza.
    if (!/^[A-Za-z0-9_$]+$/.test(nombre)) {
      throw new Error(`Nombre de base de datos no valido: ${nombre}`);
    }
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${nombre}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
    console.log(`Base de datos "${nombre}" lista.`);
  } finally {
    await admin.end();
  }

  const db = new Database({ url: config.databaseUrl });
  try {
    const resultado = await new Migrator(db, config.migrationsDir).migrate();
    if (resultado.aplicadas.length === 0) {
      console.log(`Sin migraciones pendientes (${resultado.yaEstaban.length} ya aplicadas).`);
    } else {
      console.log(`Migraciones aplicadas: ${resultado.aplicadas.join(', ')}`);
    }

    // Se dice, no se hace en silencio: quien lea esto tiene que saber que el
    // fichero que hay en disco NO es exactamente lo que se ha ejecutado (T-065).
    for (const { fichero, sentencias } of resultado.sentenciasDeBaseRetiradas) {
      console.log(
        `  ${fichero}: retirada(s) ${sentencias.length} sentencia(s) que elegian base ` +
          `(${sentencias.map((x) => x.split(/\r?\n/)[0]).join(' · ')}). ` +
          'La base la decide DATABASE_URL (P-032).',
      );
    }
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
