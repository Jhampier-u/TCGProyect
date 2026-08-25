import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IngestWarning } from '@tcg/shared';
import {
  ImageHarvester,
  buildImagePath,
  isSafeLocalPath,
  sanitizeSegment,
} from './image-harvester.js';
import { FileImageStore } from './file-store.js';
import type { ImageDownloader, ImageEncoder, ImageRepository, PendingImage } from './types.js';

/** Repositorio en memoria que registra lo que se le pide. */
class FakeRepo implements ImageRepository {
  readonly stored = new Map<number, string>();
  constructor(private readonly pending: PendingImage[]) {}
  async findPending(limit: number): Promise<PendingImage[]> {
    return this.pending.slice(0, limit);
  }
  async markStored(printId: number, localPath: string): Promise<void> {
    this.stored.set(printId, localPath);
  }
}

/** Descargador que cuenta cuantas veces se pide CADA url. Clave para P-001. */
class CountingDownloader implements ImageDownloader {
  readonly peticiones: string[] = [];
  constructor(private readonly bytes: Uint8Array = new Uint8Array([1, 2, 3, 4]),
              private readonly fallar?: (url: string) => boolean) {}
  async stream(url: string): Promise<AsyncIterable<Uint8Array>> {
    this.peticiones.push(url);
    if (this.fallar?.(url)) throw new Error('HTTP 500 simulado');
    const trozos = [this.bytes.subarray(0, 2), this.bytes.subarray(2)];
    return {
      async *[Symbol.asyncIterator]() {
        for (const t of trozos) yield t;
      },
    };
  }
}

/** Codificador de mentira: marca los bytes para poder distinguir la salida. */
const fakeEncoder: ImageEncoder = {
  async toWebp(input) {
    return new Uint8Array([0xff, ...input]);
  },
};

function pending(over: Partial<PendingImage> = {}): PendingImage {
  return {
    printId: 1,
    game: 'MTG',
    setCode: 'blb',
    externalId: '0000419b-0bba-4488',
    imageSourceUrl: 'https://cards.scryfall.io/normal/front/0/0/0000419b.jpg',
    ...over,
  };
}

async function withTempStore<T>(fn: (store: FileImageStore, root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'tcg-img-'));
  try {
    return await fn(new FileImageStore(root), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('cosecha basica', () => {
  it('descarga, convierte, guarda y marca en ese orden', async () => {
    await withTempStore(async (store, root) => {
      const repo = new FakeRepo([pending()]);
      const downloader = new CountingDownloader();
      const report = await new ImageHarvester({
        repository: repo, downloader, encoder: fakeEncoder, store,
      }).run();

      expect(report.descargadas).toBe(1);
      expect(report.fallidas).toBe(0);

      const ruta = repo.stored.get(1)!;
      expect(ruta).toBe('mtg/blb/0000419b-0bba-4488.245.webp');

      const bytes = await readFile(join(root, ruta));
      expect(bytes[0]).toBe(0xff); // paso por el codificador
    });
  });
});

describe('P-001: no pedir dos veces la misma imagen', () => {
  it('NO vuelve a descargar si el fichero ya esta en disco', async () => {
    await withTempStore(async (store) => {
      const p = pending();
      const ruta = buildImagePath(p, 245);
      await store.save(ruta, new Uint8Array([9, 9]));

      const repo = new FakeRepo([p]);
      const downloader = new CountingDownloader();
      const report = await new ImageHarvester({
        repository: repo, downloader, encoder: fakeEncoder, store,
      }).run();

      // Cero peticiones al origen: exactamente lo que YGOPRODeck exige.
      expect(downloader.peticiones).toHaveLength(0);
      expect(report.omitidas).toBe(1);
      expect(report.descargadas).toBe(0);
      // Y aun asi corrige la base de datos, que solo iba retrasada.
      expect(repo.stored.get(1)).toBe(ruta);
    });
  });

  it('dos ejecuciones seguidas solo descargan una vez', async () => {
    await withTempStore(async (store) => {
      const repo = new FakeRepo([pending()]);
      const downloader = new CountingDownloader();
      const opciones = { repository: repo, downloader, encoder: fakeEncoder, store };

      await new ImageHarvester(opciones).run();
      const segunda = await new ImageHarvester(opciones).run();

      expect(downloader.peticiones).toHaveLength(1);
      expect(segunda.omitidas).toBe(1);
    });
  });

  it('respeta el tope de descargas por ejecucion', async () => {
    await withTempStore(async (store) => {
      const muchas = Array.from({ length: 50 }, (_, i) =>
        pending({ printId: i, externalId: `carta-${i}` }),
      );
      const downloader = new CountingDownloader();
      const report = await new ImageHarvester({
        repository: new FakeRepo(muchas), downloader, encoder: fakeEncoder, store, maxPerRun: 5,
      }).run();

      expect(report.intentadas).toBe(5);
      expect(downloader.peticiones).toHaveLength(5);
    });
  });
});

describe('resiliencia', () => {
  it('una imagen que falla no tumba la cosecha', async () => {
    await withTempStore(async (store) => {
      const avisos: IngestWarning[] = [];
      const items = [
        pending({ printId: 1, externalId: 'a' }),
        pending({ printId: 2, externalId: 'b', imageSourceUrl: 'https://rota/x.jpg' }),
        pending({ printId: 3, externalId: 'c' }),
      ];
      const repo = new FakeRepo(items);
      const downloader = new CountingDownloader(undefined, (url) => url.includes('rota'));

      const report = await new ImageHarvester({
        repository: repo, downloader, encoder: fakeEncoder, store,
        onWarning: (w) => avisos.push(w),
      }).run();

      expect(report.descargadas).toBe(2);
      expect(report.fallidas).toBe(1);
      expect(repo.stored.has(2)).toBe(false); // la fallida NO se marca
      expect(repo.stored.has(3)).toBe(true); // y la siguiente si se procesa
      expect(avisos[0]!.code).toBe('missing_image');
      expect(report.errores[0]!.printId).toBe(2);
    });
  });

  it('NO marca en base de datos si la escritura en disco falla', async () => {
    const repo = new FakeRepo([pending()]);
    const storeRoto = {
      exists: async () => false,
      save: async () => {
        throw new Error('disco lleno');
      },
    };
    const report = await new ImageHarvester({
      repository: repo, downloader: new CountingDownloader(), encoder: fakeEncoder, store: storeRoto,
    }).run();

    // Si se marcara, la fila apuntaria a un fichero que no existe.
    expect(repo.stored.size).toBe(0);
    expect(report.fallidas).toBe(1);
  });
});

describe('construccion de rutas', () => {
  it('agrupa por juego y set', () => {
    expect(buildImagePath(pending(), 245)).toBe('mtg/blb/0000419b-0bba-4488.245.webp');
    expect(buildImagePath(pending({ game: 'PTCG', setCode: 'SVI', externalId: 'sv1-8' }), 245))
      .toBe('ptcg/svi/sv1-8.245.webp');
  });

  it('sanea los external_id de Yu-Gi-Oh!, que llevan dos puntos', () => {
    // "SUDA-EN049::quarter_century_secret_rare": los dos puntos son ilegales en
    // nombres de fichero de Windows.
    const ruta = buildImagePath(
      pending({ game: 'YGO', setCode: 'SUDA', externalId: 'SUDA-EN049::secret_rare' }),
      245,
    );
    expect(ruta).toBe('ygo/suda/suda-en049-secret_rare.245.webp');
    expect(ruta).not.toContain(':');
  });

  it('sanitizeSegment neutraliza los intentos de salir del directorio', () => {
    // Lo que importa no es la cadena exacta sino la propiedad: ni '..' ni
    // separadores de ruta pueden sobrevivir.
    const BARRA = String.fromCharCode(92); // barra invertida, sin literales
    for (const hostil of ['../../etc/passwd', '..', 'a/../b', `..${BARRA}..${BARRA}x`]) {
      const limpio = sanitizeSegment(hostil);
      expect(limpio).not.toContain('..');
      expect(limpio).not.toContain('/');
      expect(limpio).not.toContain(String.fromCharCode(92));
    }
    expect(sanitizeSegment('..')).toBe('');
    expect(sanitizeSegment('a/../b')).toBe('a-b');
  });
});

describe('invariante de P-001: el frontend nunca recibe una URL externa', () => {
  it('isSafeLocalPath rechaza cualquier cosa que no sea una ruta relativa', () => {
    expect(isSafeLocalPath('mtg/blb/x.245.webp')).toBe(true);

    expect(isSafeLocalPath('https://images.ygoprodeck.com/images/cards/1.jpg')).toBe(false);
    expect(isSafeLocalPath('http://x/y.jpg')).toBe(false);
    expect(isSafeLocalPath('//cdn/x.jpg')).toBe(false);
    expect(isSafeLocalPath('/etc/passwd')).toBe(false);
    expect(isSafeLocalPath('C:\\Windows\\x.jpg')).toBe(false);
    expect(isSafeLocalPath('../fuera.webp')).toBe(false);
    expect(isSafeLocalPath('')).toBe(false);
  });

  it('todas las rutas que genera el job son seguras', () => {
    const casos: PendingImage[] = [
      pending(),
      pending({ game: 'YGO', externalId: 'SUDA-EN049::secret_rare' }),
      pending({ game: 'PTCG', externalId: 'sv1-199' }),
      pending({ externalId: '../../escape' }),
    ];
    for (const c of casos) expect(isSafeLocalPath(buildImagePath(c, 245))).toBe(true);
  });
});

describe('FileImageStore', () => {
  it('impide escribir fuera de la raiz', async () => {
    await withTempStore(async (store) => {
      await expect(store.save('../fuera.webp', new Uint8Array([1]))).rejects.toThrow(/fuera del almacen/);
    });
  });

  it('crea los directorios intermedios', async () => {
    await withTempStore(async (store, root) => {
      await store.save('ygo/suda/x.245.webp', new Uint8Array([7]));
      expect(await readFile(join(root, 'ygo/suda/x.245.webp'))).toEqual(Buffer.from([7]));
    });
  });
});
