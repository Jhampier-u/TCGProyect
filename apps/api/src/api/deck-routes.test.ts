import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildFullServer } from './server.js';
import { warmUp } from '../auth/password.js';
import { EmailAlreadyExistsError } from '../auth/user-repository.js';
import type { PublicUser, UserRecord } from '../auth/user-repository.js';
import type { DeckCardInput, DeckDetail, DeckSummary } from '../db/deck-repository.js';

const SECRETO = 'un-secreto-suficientemente-largo-para-produccion-2026';

class FakeUsers {
  readonly porEmail = new Map<string, UserRecord>();
  #siguienteId = 1;

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.porEmail.get(email) ?? null;
  }

  async findById(id: number): Promise<PublicUser | null> {
    for (const u of this.porEmail.values()) {
      if (u.id === id) return { id: u.id, email: u.email, displayName: u.displayName };
    }
    return null;
  }

  async create(email: string, displayName: string, passwordHash: string): Promise<PublicUser> {
    if (this.porEmail.has(email)) throw new EmailAlreadyExistsError(email);
    const user: UserRecord = {
      id: this.#siguienteId++,
      email,
      displayName,
      passwordHash,
      createdAt: '2026-08-25T00:00:00Z',
    };
    this.porEmail.set(email, user);
    return { id: user.id, email, displayName };
  }
}

class FakeCollection {
  async list() {
    return { items: [], nextCursor: null };
  }
  async completion() {
    return [];
  }
  async summary() {
    return { entries: 0, copies: 0, openings: 0 };
  }
}

class FakePacks {
  async open() {
    throw new Error('no usado');
  }
  async replay() {
    return null;
  }
}

/** Mismo doble de catalogo que `auth-routes.test.ts`: estas rutas no lo tocan. */
const catalogoFalso = {
  listGames: async () => [],
  listSets: async () => [],
  listRarities: async () => [],
  searchCards: async () => ({ items: [], nextCursor: null }),
  findCard: async () => null,
};

/** Repositorio de mazos en memoria con la MISMA semantica que el real. */
class FakeDecks {
  readonly mazos = new Map<
    number,
    DeckSummary & { userId: number; cards: DeckCardInput[] }
  >();
  #siguienteId = 1;

  /** printId -> juego. Fija lo que "existe" en el catalogo del doble. */
  readonly catalogo = new Map<number, 'MTG' | 'YGO' | 'PTCG'>([
    [10, 'YGO'],
    [11, 'YGO'],
    [90, 'MTG'],
  ]);

  async listByUser(userId: number, game?: string) {
    return [...this.mazos.values()]
      .filter((d) => d.userId === userId && (!game || d.game === game))
      .map(({ userId: _u, cards: _c, ...resto }) => resto);
  }

  async create(userId: number, input: { game: 'MTG' | 'YGO' | 'PTCG'; name: string }) {
    const mazo = {
      id: this.#siguienteId++,
      userId,
      game: input.game,
      name: input.name,
      description: null,
      format: null,
      isPublic: false,
      counts: { main: 0, extra: 0, side: 0, commander: 0 },
      createdAt: '2026-08-25T00:00:00Z',
      updatedAt: '2026-08-25T00:00:00Z',
      cards: [] as DeckCardInput[],
    };
    this.mazos.set(mazo.id, mazo);
    const { userId: _u, cards: _c, ...resto } = mazo;
    return resto;
  }

  async findById(deckId: number, userId: number): Promise<DeckDetail | null> {
    const mazo = this.mazos.get(deckId);
    if (!mazo || mazo.userId !== userId) return null;
    const counts = { main: 0, extra: 0, side: 0, commander: 0 };
    const cards = mazo.cards.map((c, i) => {
      counts[c.zone] += c.quantity;
      return {
        printId: c.printId,
        cardId: c.printId,
        oracleKey: `carta-${c.printId}`,
        name: `Carta ${c.printId}`,
        typeLine: 'Effect Monster',
        gameData: {},
        setCode: 'TST',
        setName: 'Test',
        collectorNumber: String(i + 1),
        rarity: 'common',
        zone: c.zone,
        quantity: c.quantity,
        imagePath: null,
        owned: 0,
      };
    });
    const { userId: _u, cards: _c, ...resto } = mazo;
    return { ...resto, counts, cards };
  }

  async updateHeader(deckId: number, userId: number, patch: Record<string, unknown>) {
    const mazo = this.mazos.get(deckId);
    if (!mazo || mazo.userId !== userId) return null;
    Object.assign(mazo, patch);
    const { userId: _u, cards: _c, ...resto } = mazo;
    return resto;
  }

  async replaceCards(deckId: number, userId: number, entries: DeckCardInput[]) {
    const mazo = this.mazos.get(deckId);
    if (!mazo || mazo.userId !== userId) return false;
    mazo.cards = [...entries];
    return true;
  }

  async remove(deckId: number, userId: number) {
    const mazo = this.mazos.get(deckId);
    if (!mazo || mazo.userId !== userId) return false;
    this.mazos.delete(deckId);
    return true;
  }

  async resolveLines(game: string, lines: Array<Record<string, unknown>>) {
    const resolved: unknown[] = [];
    const unresolved: unknown[] = [];
    for (const l of lines) {
      const id = Number(l.externalId);
      if (this.catalogo.get(id) === game) {
        resolved.push({
          printId: id, cardId: id, oracleKey: String(id), name: `Carta ${id}`,
          typeLine: 'Effect Monster', gameData: {}, setCode: 'TST',
          collectorNumber: '1', rarity: 'common', imagePath: null,
          zone: l.zone, quantity: l.quantity,
        });
      } else {
        unresolved.push({
          name: (l.name as string) ?? null,
          externalId: (l.externalId as string) ?? null,
          quantity: l.quantity, zone: l.zone,
        });
      }
    }
    return { resolved, unresolved };
  }

  async resolvePrints(printIds: number[]) {
    return printIds
      .filter((id) => this.catalogo.has(id))
      .map((id) => ({ printId: id, game: this.catalogo.get(id) }));
  }
}

let app: FastifyInstance;
let decks: FakeDecks;
let tokenA = '';
let tokenB = '';

beforeAll(async () => {
  await warmUp();
  decks = new FakeDecks();
  app = await buildFullServer({
    catalog: catalogoFalso as never,
    auth: {
      users: new FakeUsers() as never,
      collection: new FakeCollection() as never,
      packs: new FakePacks() as never,
      decks: decks as never,
      jwtSecret: SECRETO,
    },
  });

  for (const email of ['a@example.com', 'b@example.com']) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, displayName: 'Usuario', password: 'contrasena-larga-1' },
    });
    const token = res.json().token as string;
    if (email === 'a@example.com') tokenA = token;
    else tokenB = token;
  }
});

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function crear(token: string, name: string): Promise<number> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/decks',
    headers: auth(token),
    payload: { game: 'YGO', name },
  });
  return res.json().data.id as number;
}

describe('rutas de mazos', () => {
  it('sin token responde 401 en todas', async () => {
    // Los cuerpos son VALIDOS a proposito. Con uno invalido, el esquema de
    // Fastify responderia 400 antes de llegar al manejador y el test pasaria
    // por el motivo equivocado, sin comprobar la autenticacion.
    const peticiones = [
      { method: 'GET' as const, url: '/api/decks' },
      { method: 'POST' as const, url: '/api/decks', payload: { game: 'YGO', name: 'X' } },
      { method: 'GET' as const, url: '/api/decks/1' },
      { method: 'PATCH' as const, url: '/api/decks/1', payload: { name: 'X' } },
      { method: 'PUT' as const, url: '/api/decks/1/cards', payload: { cards: [] } },
      { method: 'DELETE' as const, url: '/api/decks/1' },
    ];
    for (const peticion of peticiones) {
      const res = await app.inject(peticion);
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('unauthorized');
    }
  });

  it('un token invalido tampoco entra', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/decks',
      headers: { authorization: 'Bearer no-es-un-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('el esquema del cuerpo se valida ANTES que el token (400, no 401)', async () => {
    // Queda registrado a proposito: es el orden del ciclo de vida de Fastify, y
    // vale igual para las rutas de H6. Solo revela la forma del cuerpo, que es
    // superficie publica, pero conviene que este escrito y no descubierto.
    const res = await app.inject({ method: 'POST', url: '/api/decks', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('crea un mazo vacio y lo lista', async () => {
    const creado = await app.inject({
      method: 'POST',
      url: '/api/decks',
      headers: auth(tokenA),
      payload: { game: 'YGO', name: 'Mi mazo' },
    });
    expect(creado.statusCode).toBe(201);
    expect(creado.json().data.name).toBe('Mi mazo');

    const lista = await app.inject({ method: 'GET', url: '/api/decks', headers: auth(tokenA) });
    expect(lista.json().data.length).toBeGreaterThan(0);
  });

  it('devuelve la validacion junto al contenido y NO bloquea el guardado', async () => {
    const id = await crear(tokenA, 'Incompleto');

    // Tres cartas: invalido en Yu-Gi-Oh!, pero se guarda igual (D2).
    const guardado = await app.inject({
      method: 'PUT',
      url: `/api/decks/${id}/cards`,
      headers: auth(tokenA),
      payload: { cards: [{ printId: 10, zone: 'main', quantity: 3 }] },
    });
    expect(guardado.statusCode).toBe(200);
    expect(guardado.json().data.validation.valid).toBe(false);
    expect(
      guardado.json().data.validation.issues.map((i: { code: string }) => i.code),
    ).toContain('main_too_small');
    expect(guardado.json().data.cards).toHaveLength(1);
  });

  it('una impresion de otro juego es 422 game_mismatch', async () => {
    const id = await crear(tokenA, 'Mezclado');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/decks/${id}/cards`,
      headers: auth(tokenA),
      payload: { cards: [{ printId: 90, zone: 'main', quantity: 1 }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('game_mismatch');
  });

  it('una impresion inexistente es 422 unknown_print', async () => {
    const id = await crear(tokenA, 'Fantasma');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/decks/${id}/cards`,
      headers: auth(tokenA),
      payload: { cards: [{ printId: 999999, zone: 'main', quantity: 1 }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('unknown_print');
  });

  it('el mazo de OTRO usuario responde 404, no 403', async () => {
    const id = await crear(tokenA, 'Privado');

    for (const peticion of [
      { method: 'GET' as const, url: `/api/decks/${id}` },
      { method: 'PATCH' as const, url: `/api/decks/${id}`, payload: { name: 'Robado' } },
      { method: 'PUT' as const, url: `/api/decks/${id}/cards`, payload: { cards: [] } },
      { method: 'DELETE' as const, url: `/api/decks/${id}` },
    ]) {
      const res = await app.inject({ ...peticion, headers: auth(tokenB) });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('not_found');
    }
  });

  it('un PUT vacio deja el mazo vacio sin borrarlo', async () => {
    const id = await crear(tokenA, 'Se vacia');
    await app.inject({
      method: 'PUT',
      url: `/api/decks/${id}/cards`,
      headers: auth(tokenA),
      payload: { cards: [{ printId: 10, zone: 'main', quantity: 3 }] },
    });
    const vaciado = await app.inject({
      method: 'PUT',
      url: `/api/decks/${id}/cards`,
      headers: auth(tokenA),
      payload: { cards: [] },
    });
    expect(vaciado.statusCode).toBe(200);
    expect(vaciado.json().data.cards).toHaveLength(0);

    const sigue = await app.inject({
      method: 'GET',
      url: `/api/decks/${id}`,
      headers: auth(tokenA),
    });
    expect(sigue.statusCode).toBe(200);
  });

  it('ninguna respuesta contiene una URL externa (P-001, P-022)', async () => {
    const id = await crear(tokenA, 'Sin URLs');
    await app.inject({
      method: 'PUT',
      url: `/api/decks/${id}/cards`,
      headers: auth(tokenA),
      payload: { cards: [{ printId: 10, zone: 'main', quantity: 1 }] },
    });
    const res = await app.inject({ method: 'GET', url: `/api/decks/${id}`, headers: auth(tokenA) });
    expect(res.body).not.toContain('http');
  });

  it('T-052: cada carta del mazo viaja con oracleKey y gameData', async () => {
    // Sin estos dos campos el cliente no puede llamar a validateDeck: uno
    // agrupa las copias y el otro lleva la banlist de Yu-Gi-Oh! y el subtipo de
    // las Energias de Pokemon. El repositorio ya los produce desde T-045; lo
    // que faltaba era declararlos en el esquema.
    const id = await crear(tokenA, 'Con datos');
    await app.inject({
      method: 'PUT',
      url: `/api/decks/${id}/cards`,
      headers: auth(tokenA),
      payload: { cards: [{ printId: 10, zone: 'main', quantity: 1 }] },
    });

    const res = await app.inject({ method: 'GET', url: `/api/decks/${id}`, headers: auth(tokenA) });
    const carta = res.json().data.cards[0];
    expect(carta.oracleKey).toBe('carta-10');
    expect(carta.gameData).toEqual({});
  });

  it('resolve separa lo que esta en el catalogo de lo que no', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/resolve',
      headers: auth(tokenA),
      payload: {
        game: 'YGO',
        lines: [
          { quantity: 3, zone: 'main', externalId: '10' },
          { quantity: 1, zone: 'main', externalId: '999999', name: 'Carta inventada' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.resolved).toHaveLength(1);
    expect(res.json().data.resolved[0].printId).toBe(10);
    expect(res.json().data.unresolved).toEqual([
      { name: 'Carta inventada', externalId: '999999', quantity: 1, zone: 'main' },
    ]);
  });

  it('resolve exige token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/resolve',
      payload: { game: 'YGO', lines: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('borra el mazo', async () => {
    const id = await crear(tokenA, 'Efimero');
    const borrado = await app.inject({
      method: 'DELETE',
      url: `/api/decks/${id}`,
      headers: auth(tokenA),
    });
    expect(borrado.statusCode).toBe(200);
    const despues = await app.inject({
      method: 'GET',
      url: `/api/decks/${id}`,
      headers: auth(tokenA),
    });
    expect(despues.statusCode).toBe(404);
  });
});
