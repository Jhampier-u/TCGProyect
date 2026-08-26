import { describe, it, expect } from 'vitest';
import { buildServer } from './server.js';
import {
  decodeCursor,
  encodeCursor,
  toBooleanQuery,
  type CardDetail,
  type CardPage,
  type CardQuery,
  toSummary,
  type CardRow,
  type CatalogQueryRepository,
} from '../db/catalog-query-repository.js';
import { CARD_SUMMARY } from './schemas.js';

/** Catalogo falso que registra la consulta recibida. */
function fakeCatalog(over: Partial<CatalogQueryRepository> = {}): {
  catalog: CatalogQueryRepository;
  ultimaConsulta: () => CardQuery | null;
} {
  let ultima: CardQuery | null = null;
  const base = {
    listGames: async () => [{ code: 'MTG', name: 'Magic: The Gathering' }],
    listSets: async () => [
      {
        id: 1, externalId: 'blb', code: 'BLB', name: 'Bloomburrow',
        releasedAt: '2024-08-02', cardCount: 398,
        // NO nulo a proposito: con `iconUrl: null` el test de "ninguna URL
        // externa" pasaba sin comprobar nada, y por eso no detecto la fuga
        // real de P-022. La fixture ahora reproduce lo que la base devuelve.
        iconUrl: 'https://images.ygoprodeck.com/images/sets/BLB.jpg',
        iconPath: 'mtg/blb/icon.64.webp',
        poolSize: 281,
      },
    ],
    listRarities: async () => [{ code: 'common', label: 'common', tier: 1 }],
    searchCards: async (q: CardQuery): Promise<CardPage> => {
      ultima = q;
      return { items: [], nextCursor: null };
    },
    findCard: async (): Promise<CardDetail | null> => null,
    ...over,
  } as unknown as CatalogQueryRepository;
  return { catalog: base, ultimaConsulta: () => ultima };
}

const CARTA: CardDetail = {
  cardId: 7, oracleKey: '89631139', printId: 42, game: 'YGO', name: 'Blue-Eyes White Dragon',
  typeLine: 'Normal Monster', setCode: 'LOB', setName: 'Legend of Blue Eyes',
  collectorNumber: '001', rarity: 'ultra_rare',
  imagePath: 'ygo/lob/lob-en001-ultra_rare.245.webp',
  rulesText: 'Legendary dragon.', gameData: { atk: 3000, def: 2500 },
  releasedAt: '2002-03-08', finishes: ['foil'], inBoosters: true,
};

describe('P-001: la respuesta no puede filtrar una URL externa', () => {
  it('ELIMINA cualquier campo no declarado en el esquema', async () => {
    // Se simula el peor caso: el repositorio devuelve de mas, con la url de
    // origen incluida. Fastify no debe dejarla salir.
    const filtrona = {
      ...CARTA,
      image_source_url: 'https://images.ygoprodeck.com/images/cards/89631139.jpg',
      imageSourceUrl: 'https://images.ygoprodeck.com/images/cards/89631139.jpg',
      secreto: 'no deberia salir',
    };
    const { catalog } = fakeCatalog({ findCard: async () => filtrona as CardDetail });
    const app = buildServer({ catalog });

    const res = await app.inject({ method: 'GET', url: '/api/cards/42' });
    expect(res.statusCode).toBe(200);

    const cuerpo = res.body;
    // Servir esto al navegador es el hotlinking que provoca lista negra de IP.
    expect(cuerpo).not.toContain('ygoprodeck.com');
    expect(cuerpo).not.toContain('image_source_url');
    expect(cuerpo).not.toContain('imageSourceUrl');
    expect(cuerpo).not.toContain('secreto');
    // Y lo que si debe salir, sale.
    expect(res.json().data.imagePath).toBe('ygo/lob/lob-en001-ultra_rare.245.webp');
    await app.close();
  });

  it('el icono de set sale por su ruta LOCAL, nunca por la del origen', async () => {
    // Las dos mitades de P-022 en una sola comprobacion: la url del origen se
    // queda dentro y la ruta cosechada sale (T-035). Si alguien quita
    // `iconPath` del esquema, Fastify lo eliminaria en silencio -- que es
    // exactamente como se perdio `cardId` durante tres hitos (P-024).
    const { catalog } = fakeCatalog();
    const app = buildServer({ catalog });

    const res = await app.inject({ method: 'GET', url: '/api/games/MTG/sets' });
    expect(res.statusCode).toBe(200);
    const set = res.json().data[0];
    expect(set.iconPath).toBe('mtg/blb/icon.64.webp');
    expect(set).not.toHaveProperty('iconUrl');
    await app.close();
  });

  it('ninguna respuesta del catalogo contiene http', async () => {
    const { catalog } = fakeCatalog({
      findCard: async () => CARTA,
      searchCards: async () => ({ items: [CARTA], nextCursor: null }),
    });
    const app = buildServer({ catalog });

    for (const url of ['/api/cards', '/api/cards/42', '/api/games/MTG/sets']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.body).not.toMatch(/https?:\/\//);
    }
    await app.close();
  });
});

describe('validacion de entrada', () => {
  it('rechaza un juego desconocido', async () => {
    const { catalog } = fakeCatalog();
    const app = buildServer({ catalog });
    const res = await app.inject({ method: 'GET', url: '/api/games/POKEMON/sets' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('rechaza un limit por encima del tope', async () => {
    // Sin tope, un cliente pediria 100.000 filas y convertiria una consulta
    // barata en un problema de memoria.
    const { catalog } = fakeCatalog();
    const app = buildServer({ catalog });
    expect((await app.inject({ method: 'GET', url: '/api/cards?limit=500' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/cards?limit=0' })).statusCode).toBe(400);
    await app.close();
  });

  it('rechaza parametros no declarados', async () => {
    const { catalog } = fakeCatalog();
    const app = buildServer({ catalog });
    const res = await app.inject({ method: 'GET', url: '/api/cards?orderBy=precio' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('aplica el limit por defecto', async () => {
    const { catalog, ultimaConsulta } = fakeCatalog();
    const app = buildServer({ catalog });
    await app.inject({ method: 'GET', url: '/api/cards?game=MTG' });
    expect(ultimaConsulta()?.limit).toBe(40);
    await app.close();
  });
});

describe('rutas', () => {
  it('sirve la lista de juegos', async () => {
    const { catalog } = fakeCatalog();
    const app = buildServer({ catalog });
    const res = await app.inject({ method: 'GET', url: '/api/games' });
    expect(res.json().data[0].code).toBe('MTG');
    await app.close();
  });

  it('devuelve 404 con cuerpo util si la impresion no existe', async () => {
    const { catalog } = fakeCatalog();
    const app = buildServer({ catalog });
    const res = await app.inject({ method: 'GET', url: '/api/cards/999999' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
    await app.close();
  });

  it('devuelve 404 en una ruta desconocida', async () => {
    const { catalog } = fakeCatalog();
    const app = buildServer({ catalog });
    const res = await app.inject({ method: 'GET', url: '/api/inventado' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('P-024: toSummary produce EXACTAMENTE los campos que declara el esquema', () => {
    // El esquema declaraba `cardId` y el repositorio devolvia `id`: Fastify
    // descartaba los dos en silencio y la API no expuso el id de la carta desde
    // H3. TypeScript no lo detecta porque el esquema es un literal JSON, no un
    // tipo, y los ficheros de test ni siquiera pasan por `tsc`.
    //
    // Por eso el test ejecuta la funcion de mapeo DE VERDAD y compara sus
    // claves con las del esquema. Renombrar un campo en cualquiera de los dos
    // lados lo rompe.
    const fila: CardRow = {
      id: 7,
      oracle_key: '89631139',
      game_id: 2,
      name: 'Blue-Eyes White Dragon',
      type_line: 'Normal Monster',
      set_code: 'LOB',
      set_name: 'Legend of Blue Eyes',
      print_id: 42,
      collector_number: '001',
      image_local_path: 'ygo/lob/x.245.webp',
      rarity: 'ultra_rare',
    };
    const producido = toSummary(fila);

    expect(Object.keys(producido).sort()).toEqual(Object.keys(CARD_SUMMARY.properties).sort());
    expect(producido.cardId).toBe(7);
    expect(producido.printId).toBe(42);
  });

  it('NO expone endpoint de apertura de sobres (espera a H6)', async () => {
    // El motor existe desde S012, pero abrir un sobre muta la coleccion de un
    // usuario. Sin autenticacion habria que fiarse del user_id del cliente.
    const { catalog } = fakeCatalog();
    const app = buildServer({ catalog });
    const res = await app.inject({ method: 'POST', url: '/api/packs/open' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('cursor de paginacion', () => {
  it('va y vuelve sin perder informacion', () => {
    const cursor = encodeCursor('Lightning Bolt', 1234);
    expect(decodeCursor(cursor)).toEqual({ name: 'Lightning Bolt', id: 1234 });
  });

  it('es opaco: no parece un numero de pagina', () => {
    expect(encodeCursor('Forest', 1)).not.toMatch(/^\d+$/);
  });

  it('un cursor corrupto se ignora en vez de reventar', () => {
    // Un enlace viejo o manipulado no debe producir un 500.
    expect(decodeCursor('no-es-base64!!')).toBeNull();
    expect(decodeCursor(Buffer.from('{"a":1}').toString('base64url'))).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('sobrevive a nombres con acentos y comillas', () => {
    for (const n of ['Pokémon ex', "Farfetch'd", 'Æther Vial', 'Nidoran-m']) {
      expect(decodeCursor(encodeCursor(n, 9))?.name).toBe(n);
    }
  });
});

describe('traduccion de la busqueda a BOOLEAN MODE', () => {
  it('anade prefijo para que "light" encuentre "Lightning"', () => {
    expect(toBooleanQuery('light')).toBe('+light*');
    expect(toBooleanQuery('blue eyes')).toBe('+blue* +eyes*');
  });

  it('ELIMINA los operadores de MySQL', () => {
    // Dejarlos pasar permite provocar errores de sintaxis o consultas absurdas.
    expect(toBooleanQuery('+dragon -white')).toBe('+dragon* +white*');
    expect(toBooleanQuery('"exact phrase"')).toBe('+exact* +phrase*');
    expect(toBooleanQuery('a* (b)')).toBe('');
  });

  it('descarta los tokens demasiado cortos para FULLTEXT', () => {
    // InnoDB ignora por defecto los tokens de menos de 3 caracteres.
    expect(toBooleanQuery('ex')).toBe('');
    expect(toBooleanQuery('ex machina')).toBe('+machina*');
  });
});

describe('el cursor identifica una IMPRESION, no una carta', () => {
  it('el desempate usa el id de impresion', () => {
    // Cada fila del resultado es una impresion, y varias comparten carta
    // conceptual: en Yu-Gi-Oh! la misma carta sale en dos rarezas dentro del
    // mismo set (P-013). Con el id de CARTA como desempate, el cursor no
    // identifica una fila sino un grupo, y la paginacion se salta filas.
    // Medido: 723 de 733 impresiones devueltas antes de corregirlo.
    const a = encodeCursor('A Bao A Qu, the Lightless Shadow', 101);
    const b = encodeCursor('A Bao A Qu, the Lightless Shadow', 102);
    expect(a).not.toBe(b);
    expect(decodeCursor(a)!.id).toBe(101);
    expect(decodeCursor(b)!.id).toBe(102);
  });
});
