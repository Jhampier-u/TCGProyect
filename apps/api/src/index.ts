import { mkdir } from 'node:fs/promises';

import { loadConfig } from './config.js';
import { Database, Migrator, CatalogQueryRepository, CollectionRepository, PackRepositoryMysql } from './db/index.js';
import { UserRepository, warmUp } from './auth/index.js';
import { PackService } from './packs/index.js';
import { buildFullServer } from './api/index.js';

/**
 * Arranque del servidor.
 *
 * Orden deliberado: configuracion -> migraciones -> servidor. Si la
 * configuracion es invalida o las migraciones fallan, el proceso muere antes de
 * aceptar una sola peticion. Arrancar contra un esquema desactualizado produce
 * errores confusos horas despues, en consultas que no tienen nada que ver.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const db = new Database({ url: config.databaseUrl });

  const migrator = new Migrator(db, config.migrationsDir);
  const resultado = await migrator.migrate();
  if (resultado.aplicadas.length > 0) {
    console.log(`Migraciones aplicadas: ${resultado.aplicadas.join(', ')}`);
  }

  // @fastify/static exige que su raiz exista al registrarse, y en una maquina
  // recien clonada storage/ no existe todavia: la crea la primera ingesta. Sin
  // esto el servidor arranca igual, pero /images devuelve 404 hasta que alguien
  // ejecuta el CLI, y el aviso pasa desapercibido entre los logs de arranque.
  await mkdir(config.storagePath, { recursive: true });

  // Precalcula el hash señuelo para que el primer login no pague su coste y
  // delate, por lentitud, que es el primero (ADR-008).
  await warmUp();

  const app = await buildFullServer({
    catalog: new CatalogQueryRepository(db),
    logger: true,
    storagePath: config.storagePath,
    auth: {
      users: new UserRepository(db),
      collection: new CollectionRepository(db),
      packs: new PackService({ repository: new PackRepositoryMysql(db) }),
      jwtSecret: config.jwtSecret,
    },
  });

  const cerrar = async (senal: string): Promise<void> => {
    console.log(`\n${senal} recibida, cerrando...`);
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void cerrar('SIGINT'));
  process.on('SIGTERM', () => void cerrar('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
  console.log(`API escuchando en http://${config.host}:${config.port}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
