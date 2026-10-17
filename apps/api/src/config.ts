import { resolve } from 'node:path';

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  storagePath: string;
  port: number;
  host: string;
  externalUserAgent: string;
  pokemonApiKey: string | undefined;
  migrationsDir: string;
  /** Vida de la cache de recuentos base del rail de facetas. 0 = sin cache. */
  facetasCacheTtlMs: number;
}

class MissingConfigError extends Error {
  constructor(clave: string, motivo: string) {
    super(`Falta configuracion: ${clave} — ${motivo}`);
    this.name = 'MissingConfigError';
  }
}

/**
 * Lee la configuracion del entorno.
 *
 * FALLA AL ARRANCAR si falta algo imprescindible, en vez de usar un valor por
 * defecto. Un `DATABASE_URL` por defecto apuntaria a una base equivocada y un
 * `JWT_SECRET` por defecto es una cuenta de administrador regalada (ADR-008).
 * El servidor tiene que caerse ruidosamente, no arrancar a medias.
 *
 * `PORT` y `HOST` si tienen valor por defecto: equivocarse ahi es visible al
 * instante y no compromete nada.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new MissingConfigError('DATABASE_URL', 'sin ella no se sabe contra que base trabajar');
  }

  const jwtSecret = env.JWT_SECRET?.trim();
  if (!jwtSecret) {
    throw new MissingConfigError(
      'JWT_SECRET',
      'generar con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }

  const externalUserAgent = env.EXTERNAL_USER_AGENT?.trim();
  if (!externalUserAgent) {
    // Scryfall bloquea a quien no envia un User-Agent propio y descriptivo.
    throw new MissingConfigError('EXTERNAL_USER_AGENT', 'Scryfall exige uno propio y descriptivo');
  }

  return {
    databaseUrl,
    jwtSecret,
    externalUserAgent,
    storagePath: resolve(env.STORAGE_PATH?.trim() || './storage/cards'),
    port: Number(env.PORT ?? 3000),
    host: env.HOST?.trim() || '127.0.0.1',
    pokemonApiKey: env.POKEMONTCG_API_KEY?.trim() || undefined,
    migrationsDir: resolve(env.MIGRATIONS_DIR?.trim() || './db/migrations'),
    facetasCacheTtlMs: leerTtlDeFacetas(env.FACETAS_CACHE_TTL_SEGUNDOS),
  };
}

/**
 * Cinco minutos por defecto: los recuentos solo cambian con una ingesta, que
 * ademas invalida la cache al terminar; el TTL es la red por si la marca no
 * llega. Un valor mal escrito NO cae al defecto en silencio: quien lo puso
 * queria otra cosa, y una cache que no hace lo configurado se depura mal.
 */
function leerTtlDeFacetas(raw: string | undefined): number {
  const texto = raw?.trim();
  if (!texto) return 300_000;
  const segundos = Number(texto);
  if (!Number.isFinite(segundos) || segundos < 0) {
    throw new MissingConfigError('FACETAS_CACHE_TTL_SEGUNDOS', `debe ser un numero de segundos >= 0 (recibido: ${texto})`);
  }
  return Math.round(segundos * 1000);
}
