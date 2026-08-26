import { loadConfig } from '../config.js';
import { Database, Migrator, CatalogRepository } from '../db/index.js';
import { RateLimitedClient } from '../http/index.js';
import { IngestService, type IngestReport } from '../ingest/index.js';
import { ScryfallAdapter } from '../adapters/scryfall/index.js';
import { YgoprodeckAdapter } from '../adapters/ygoprodeck/index.js';
import { PokemonTcgAdapter } from '../adapters/pokemontcg/index.js';
import { ImageHarvester, SharpImageEncoder, FileImageStore } from '../images/index.js';
import type { GameAdapter, GameCode, IngestWarning } from '@tcg/shared';

/**
 * CLI de ingesta.
 *
 * Sin esto, un clon nuevo del repositorio no tiene forma de poblar la base de
 * datos: el catalogo, las imagenes y por tanto los sobres quedarian vacios.
 *
 *   npm run ingest -- --game YGO --sets 3
 *   npm run ingest -- --game MTG --sets 2 --no-images
 *   npm run ingest -- --images-only --max-images 500
 *   npm run ingest -- --set khm --no-images
 *   npm run ingest -- --images-only --retry-failed
 *
 * Es SEGURO relanzarlo: la ingesta es idempotente (upsert sobre claves
 * naturales) y el job de imagenes detecta las que ya estan en disco y no vuelve
 * a pedirlas al origen (P-001).
 */

interface Opciones {
  game: GameCode | 'ALL';
  sets: number;
  images: boolean;
  imagesOnly: boolean;
  maxImages: number;
  /** Ids de origen concretos, de `--set`. Vacio = orden por fecha. */
  soloSets: string[];
  /** `--retry-failed`: devuelve a la cola las imagenes que agotaron intentos. */
  retryFailed: boolean;
}

function parseArgs(argv: string[]): Opciones {
  const opciones: Opciones = {
    game: 'ALL', sets: 3, images: true, imagesOnly: false, maxImages: 2000, soloSets: [],
    retryFailed: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const valor = argv[i + 1];
    if (arg === '--game' && valor) {
      const g = valor.toUpperCase();
      if (g !== 'MTG' && g !== 'YGO' && g !== 'PTCG' && g !== 'ALL') {
        throw new Error(`--game debe ser MTG, YGO, PTCG o ALL (recibido: ${valor})`);
      }
      opciones.game = g as GameCode | 'ALL';
      i += 1;
    } else if (arg === '--sets' && valor) {
      opciones.sets = Math.max(1, Number(valor));
      i += 1;
    } else if (arg === '--set' && valor) {
      // Repetible y tambien admite lista separada por comas.
      opciones.soloSets.push(...valor.split(',').map((v) => v.trim()).filter((v) => v !== ''));
      i += 1;
    } else if (arg === '--max-images' && valor) {
      opciones.maxImages = Math.max(0, Number(valor));
      i += 1;
    } else if (arg === '--no-images') {
      opciones.images = false;
    } else if (arg === '--images-only') {
      opciones.imagesOnly = true;
    } else if (arg === '--retry-failed') {
      opciones.retryFailed = true;
    }
  }
  return opciones;
}

async function main(): Promise<void> {
  const opciones = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const db = new Database({ url: config.databaseUrl });

  const migraciones = await new Migrator(db, config.migrationsDir).migrate();
  if (migraciones.aplicadas.length > 0) {
    console.log(`Migraciones aplicadas: ${migraciones.aplicadas.join(', ')}`);
  }

  const client = new RateLimitedClient({ userAgent: config.externalUserAgent });
  const repo = new CatalogRepository(db);
  const avisos: IngestWarning[] = [];

  const adaptadores: Array<{ game: GameCode; adapter: GameAdapter }> = [
    { game: 'MTG', adapter: new ScryfallAdapter(client, { onWarning: (w) => avisos.push(w) }) },
    { game: 'YGO', adapter: new YgoprodeckAdapter(client, { onWarning: (w) => avisos.push(w) }) },
    {
      game: 'PTCG',
      adapter: new PokemonTcgAdapter(client, {
        onWarning: (w) => avisos.push(w),
        ...(config.pokemonApiKey ? { apiKey: config.pokemonApiKey } : {}),
      }),
    },
  ];

  if (!opciones.imagesOnly) {
    for (const { game, adapter } of adaptadores) {
      if (opciones.game !== 'ALL' && opciones.game !== game) continue;

      console.log(`\n[${game}] ingestando hasta ${opciones.sets} sets...`);
      try {
        const informe: IngestReport = await new IngestService({
          repository: repo,
          maxSetsPerRun: opciones.sets,
          onWarning: (w) => avisos.push(w),
          onProgress: (e) => {
            if (e.type === 'set_done') console.log(`  ${e.set}: ${e.prints} impresiones`);
            if (e.type === 'set_failed') console.log(`  ${e.set}: FALLO — ${e.reason.slice(0, 90)}`);
          },
        }).ingest(adapter, { soloSets: opciones.soloSets });

        console.log(
          `  via=${informe.via} · sets descubiertos ${informe.setsDescubiertos} · ` +
            `procesados ${informe.setsProcesados} · fallidos ${informe.setsFallidos} · ` +
            `impresiones ${informe.impresiones}`,
        );
      } catch (error) {
        // Un juego que falla no debe impedir ingestar los otros dos. La API de
        // Pokemon, por ejemplo, es intermitentemente inestable (P-016).
        console.error(`  [${game}] abortado: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (opciones.retryFailed) {
    // El contador de T-019 no distingue causas: si el origen estuvo caido una
    // tarde, imagenes perfectamente buenas pueden haber agotado sus intentos.
    // Esto las devuelve a la cola.
    const reactivadas = await repo.resetImageFailures();
    console.log(`
[imagenes] ${reactivadas} vuelven a la cola tras --retry-failed.`);
  }

  if (opciones.images || opciones.imagesOnly) {
    console.log(`\n[imagenes] cosechando hasta ${opciones.maxImages}...`);
    const informe = await new ImageHarvester({
      repository: repo,
      downloader: client,
      encoder: new SharpImageEncoder(),
      store: new FileImageStore(config.storagePath),
      maxPerRun: opciones.maxImages,
      onWarning: (w) => avisos.push(w),
    }).run();

    const reduccion =
      informe.bytesOrigen > 0
        ? (100 - (100 * informe.bytesGuardados) / informe.bytesOrigen).toFixed(1)
        : '0';
    console.log(
      `  descargadas ${informe.descargadas} · ya en disco ${informe.omitidas} · ` +
        `fallidas ${informe.fallidas} · reduccion ${reduccion}%`,
    );
  }

  if (avisos.length > 0) {
    const porCodigo = new Map<string, number>();
    for (const a of avisos) porCodigo.set(a.code, (porCodigo.get(a.code) ?? 0) + 1);
    console.log(`\nAvisos: ${[...porCodigo].map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  }

  await db.close();
  console.log('\nListo.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
