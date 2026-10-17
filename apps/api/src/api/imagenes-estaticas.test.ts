import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFullServer } from './server.js';
import { marcarCatalogoCambiado } from '../db/cache-de-facetas.js';

/**
 * /images/ sirve STORAGE_PATH tal cual, pero ahi no solo hay imagenes: la
 * ingesta deja la marca de generacion del catalogo. @fastify/static sirve los
 * ficheros ocultos por defecto (`dotfiles: 'allow'`), y con la cache de un ano
 * e `immutable` un navegador o un CDN la guardaria para siempre. Se comprueba
 * contra un directorio real porque lo que importa es la opcion del plugin.
 */
describe('/images/ no sirve ficheros ocultos', () => {
  let dir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tcg-static-'));
    await writeFile(join(dir, 'carta.webp'), 'RIFF');
    await writeFile(join(dir, '.oculto'), 'no');
    await marcarCatalogoCambiado(dir);
    app = await buildFullServer({
      catalog: {} as never,
      storagePath: dir,
      auth: {
        users: {} as never,
        collection: {} as never,
        packs: {} as never,
        decks: {} as never,
        jwtSecret: 'un-secreto-suficientemente-largo-para-produccion-2026',
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('una imagen normal se sirve (control)', async () => {
    expect((await app.inject({ method: 'GET', url: '/images/carta.webp' })).statusCode).toBe(200);
  });

  it('la marca de generacion del catalogo da 404', async () => {
    expect((await app.inject({ method: 'GET', url: '/images/.catalogo-generacion' })).statusCode).toBe(404);
  });

  it('ningun fichero oculto se sirve', async () => {
    expect((await app.inject({ method: 'GET', url: '/images/.oculto' })).statusCode).toBe(404);
  });
});
