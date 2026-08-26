import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildFullServer, assertStrongSecret, WeakJwtSecretError } from './server.js';
import {
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
  warmUp,
} from '../auth/password.js';
import { EmailAlreadyExistsError, type PublicUser, type UserRecord } from '../auth/user-repository.js';

const SECRETO = 'un-secreto-suficientemente-largo-para-produccion-2026';

/** Repositorio de usuarios en memoria con la misma semantica que el real. */
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
      id: this.#siguienteId++, email, displayName, passwordHash,
      createdAt: '2026-08-25T00:00:00Z',
    };
    this.porEmail.set(email, user);
    return { id: user.id, email, displayName };
  }
}

class FakeCollection {
  async list() { return { items: [], nextCursor: null }; }
  async completion() { return []; }
  async summary() { return { entries: 0, copies: 0, openings: 0 }; }
}

class FakePacks {
  readonly aperturas: Array<{ userId: number; setId: number }> = [];
  async open(userId: number, setId: number) {
    this.aperturas.push({ userId, setId });
    return {
      openingId: this.aperturas.length, seed: 'a'.repeat(32), setId,
      openedAt: '2026-08-25T00:00:00Z',
      cards: [{ slotIndex: 0, printId: 1, rarityCode: 'common', finish: 'nonfoil', isNew: true }],
    };
  }
  async replay(openingId: number, userId: number) {
    const propia = this.aperturas[openingId - 1];
    if (!propia || propia.userId !== userId) return null;
    return {
      openingId, seed: 'a'.repeat(32), setId: propia.setId,
      openedAt: '2026-08-25T00:00:00Z',
      cards: [{ slotIndex: 0, printId: 1, rarityCode: 'common', finish: 'nonfoil', isNew: true }],
    };
  }
}

const catalogoFalso = {
  listGames: async () => [],
  listSets: async () => [],
  listRarities: async () => [],
  searchCards: async () => ({ items: [], nextCursor: null }),
  findCard: async () => ({
    id: 5, printId: 1, game: 'YGO', name: 'Blue-Eyes White Dragon', typeLine: null,
    setCode: 'LOB', setName: 'Legend of Blue Eyes', collectorNumber: '001',
    rarity: 'ultra_rare', imagePath: 'ygo/lob/x.245.webp',
    rulesText: null, gameData: {}, releasedAt: null, finishes: ['foil'], inBoosters: true,
  }),
};

async function montar(): Promise<{ app: FastifyInstance; users: FakeUsers; packs: FakePacks }> {
  const users = new FakeUsers();
  const packs = new FakePacks();
  const app = await buildFullServer({
    catalog: catalogoFalso as never,
    auth: {
      users: users as never,
      collection: new FakeCollection() as never,
      packs: packs as never,
      jwtSecret: SECRETO,
    },
  });
  return { app, users, packs };
}

async function crearCuenta(app: FastifyInstance, email = 'juan@example.com'): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { email, displayName: 'Juan', password: 'contrasena-larga-123' },
  });
  return res.json().token as string;
}

beforeAll(async () => {
  // Precalienta el hash señuelo para que el primer test no pague su coste.
  await warmUp();
}, 30_000);

describe('el secreto JWT no puede ser debil', () => {
  it('rechaza vacio, corto o de ejemplo', () => {
    // Un secreto por defecto en produccion es una cuenta de administrador
    // regalada: quien lo conozca puede firmar un token para cualquier usuario.
    expect(() => assertStrongSecret(undefined)).toThrow(WeakJwtSecretError);
    expect(() => assertStrongSecret('')).toThrow(WeakJwtSecretError);
    expect(() => assertStrongSecret('corto')).toThrow(/32/);
    // `cambiame` es literalmente lo que pone en .env.example.
    expect(() => assertStrongSecret('cambiame')).toThrow(WeakJwtSecretError);
    expect(() => assertStrongSecret('c'.repeat(32))).not.toThrow();
  });

  it('el servidor NO ARRANCA con un secreto debil', async () => {
    await expect(
      buildFullServer({
        catalog: catalogoFalso as never,
        auth: {
          users: new FakeUsers() as never,
          collection: new FakeCollection() as never,
          packs: new FakePacks() as never,
          jwtSecret: 'cambiame',
        },
      }),
    ).rejects.toBeInstanceOf(WeakJwtSecretError);
  });
});

describe('registro', () => {
  it('crea la cuenta y devuelve token', async () => {
    const { app } = await montar();
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'Juan@Example.com', displayName: 'Juan', password: 'contrasena-larga-123' },
    });

    expect(res.statusCode).toBe(201);
    // El correo se normaliza: sin esto, Juan@ y juan@ serian dos cuentas.
    expect(res.json().data.email).toBe('juan@example.com');
    expect(res.json().token).toBeTruthy();
    await app.close();
  }, 30_000);

  it('NUNCA devuelve el hash de la contrasena', async () => {
    const { app } = await montar();
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'a@b.com', displayName: 'A', password: 'contrasena-larga-123' },
    });
    // Lo garantiza el esquema de respuesta, igual que con P-001.
    expect(res.body).not.toContain('passwordHash');
    expect(res.body).not.toContain('password_hash');
    expect(res.body).not.toContain('$argon2');
    expect(res.body).not.toContain('contrasena-larga-123');
    await app.close();
  }, 30_000);

  it('rechaza una contrasena corta', async () => {
    const { app } = await montar();
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'a@b.com', displayName: 'A', password: 'corta' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  }, 30_000);

  it('rechaza una contrasena descomunal', async () => {
    // Sin tope, alguien envia 10 MB y obliga al servidor a hashearlos.
    const { app } = await montar();
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'a@b.com', displayName: 'A', password: 'x'.repeat(5000) },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  }, 30_000);

  it('T-062: el registro tiene su propio limite y corta antes del Argon2id', async () => {
    // Cada registro paga un hash de 19 MiB. Con solo el tope global de 300/min
    // se podian pedir 18.000 por hora: denegacion de servicio barata contra el
    // recurso mas caro del servidor.
    const { app } = await montar();
    const registrar = (n: number) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: `limite${n}@example.com`,
          displayName: 'Limite',
          password: 'contrasena-larga-1',
        },
      });

    for (let i = 0; i < 20; i++) {
      expect((await registrar(i)).statusCode).toBe(201);
    }

    const cortado = await registrar(20);
    expect(cortado.statusCode).toBe(429);
    // `retry-after` informado: un cliente honesto necesita saber cuanto esperar.
    expect(cortado.headers['retry-after']).toBeDefined();
    await app.close();
  });

  it('devuelve 409 si el correo ya existe', async () => {
    const { app } = await montar();
    await crearCuenta(app);
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'juan@example.com', displayName: 'Otro', password: 'contrasena-larga-123' },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  }, 30_000);
});

describe('login', () => {
  it('acepta credenciales correctas', async () => {
    const { app } = await montar();
    await crearCuenta(app);
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'juan@example.com', password: 'contrasena-larga-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeTruthy();
    await app.close();
  }, 30_000);

  it('NO revela si el correo existe', async () => {
    // Mensaje y codigo identicos en ambos casos. Distinguirlos convertiria el
    // login en un comprobador de correos registrados.
    const { app } = await montar();
    await crearCuenta(app);

    const noExiste = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'nadie@example.com', password: 'contrasena-larga-123' },
    });
    const malaPass = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'juan@example.com', password: 'contrasena-incorrecta' },
    });

    expect(noExiste.statusCode).toBe(401);
    expect(malaPass.statusCode).toBe(401);
    expect(noExiste.json()).toEqual(malaPass.json());
    await app.close();
  }, 30_000);

  it('gasta tiempo comparable exista o no el correo', async () => {
    // Sin el hash señuelo, un correo inexistente responderia en microsegundos y
    // uno real tardaria lo que tarda Argon2id: la diferencia delata la cuenta.
    const { app } = await montar();
    await crearCuenta(app);

    const medir = async (email: string): Promise<number> => {
      const t = process.hrtime.bigint();
      await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email, password: 'contrasena-larga-123' },
      });
      return Number(process.hrtime.bigint() - t) / 1e6;
    };

    const real = await medir('juan@example.com');
    const falso = await medir('nadie@example.com');

    // No se exige igualdad exacta: se exige que el inexistente no sea
    // trivialmente mas rapido, que es lo explotable.
    expect(falso).toBeGreaterThan(real * 0.25);
    await app.close();
  }, 30_000);
});

describe('rutas protegidas', () => {
  const PROTEGIDAS = [
    { method: 'GET' as const, url: '/api/auth/me' },
    { method: 'GET' as const, url: '/api/collection' },
    { method: 'GET' as const, url: '/api/collection/summary' },
    { method: 'GET' as const, url: '/api/collection/completion/YGO' },
    { method: 'GET' as const, url: '/api/packs/openings/1' },
  ];

  it('devuelven 401 sin token', async () => {
    const { app } = await montar();
    for (const r of PROTEGIDAS) {
      const res = await app.inject(r);
      expect(res.statusCode, r.url).toBe(401);
    }
    const abrir = await app.inject({ method: 'POST', url: '/api/packs/open', payload: { setId: 1 } });
    expect(abrir.statusCode).toBe(401);
    await app.close();
  }, 30_000);

  it('devuelven 401 con un token manipulado', async () => {
    const { app } = await montar();
    const token = await crearCuenta(app);
    const manipulado = token.slice(0, -4) + 'AAAA';
    const res = await app.inject({
      method: 'GET', url: '/api/auth/me',
      headers: { authorization: `Bearer ${manipulado}` },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  }, 30_000);

  it('devuelven 401 con un token firmado con OTRO secreto', async () => {
    const { app } = await montar();
    const otro = await buildFullServer({
      catalog: catalogoFalso as never,
      auth: {
        users: new FakeUsers() as never, collection: new FakeCollection() as never,
        packs: new FakePacks() as never,
        jwtSecret: 'otro-secreto-igualmente-largo-pero-distinto-2026',
      },
    });
    const tokenAjeno = otro.jwt.sign({ sub: '1' });

    const res = await app.inject({
      method: 'GET', url: '/api/auth/me',
      headers: { authorization: `Bearer ${tokenAjeno}` },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
    await otro.close();
  }, 30_000);
});

describe('el userId sale del TOKEN, nunca del cuerpo', () => {
  it('ignora un userId inyectado en el cuerpo', async () => {
    // Aceptarlo del cliente seria una referencia directa a objetos: cualquiera
    // abriria sobres en la cuenta de otro.
    const { app, packs } = await montar();
    const token = await crearCuenta(app);

    const res = await app.inject({
      method: 'POST', url: '/api/packs/open',
      headers: { authorization: `Bearer ${token}` },
      payload: { setId: 1, userId: 9999 },
    });

    // El esquema no declara `userId`, asi que la peticion ni siquiera se acepta.
    expect(res.statusCode).toBe(400);
    expect(packs.aperturas).toHaveLength(0);
    await app.close();
  }, 30_000);

  it('abre el sobre en la cuenta del token', async () => {
    const { app, packs } = await montar();
    const token = await crearCuenta(app);
    const res = await app.inject({
      method: 'POST', url: '/api/packs/open',
      headers: { authorization: `Bearer ${token}` },
      payload: { setId: 7, count: 2 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
    expect(packs.aperturas.every((a) => a.userId === 1)).toBe(true);
    await app.close();
  }, 30_000);

  it('rechaza abrir mas sobres de los permitidos de una vez', async () => {
    const { app } = await montar();
    const token = await crearCuenta(app);
    const res = await app.inject({
      method: 'POST', url: '/api/packs/open',
      headers: { authorization: `Bearer ${token}` },
      payload: { setId: 1, count: 10_000 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  }, 30_000);
});

describe('aislamiento entre usuarios', () => {
  it('NO se puede reproducir la apertura de otro', async () => {
    const { app } = await montar();
    const tokenA = await crearCuenta(app, 'a@example.com');
    const tokenB = await crearCuenta(app, 'b@example.com');

    await app.inject({
      method: 'POST', url: '/api/packs/open',
      headers: { authorization: `Bearer ${tokenA}` }, payload: { setId: 1 },
    });

    const propia = await app.inject({
      method: 'GET', url: '/api/packs/openings/1',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const ajena = await app.inject({
      method: 'GET', url: '/api/packs/openings/1',
      headers: { authorization: `Bearer ${tokenB}` },
    });

    expect(propia.statusCode).toBe(200);
    // 404 y no 403: un 403 confirmaria que esa apertura existe.
    expect(ajena.statusCode).toBe(404);
    await app.close();
  }, 30_000);
});

describe('utilidades de contrasena', () => {
  it('normalizeEmail unifica mayusculas y espacios', () => {
    expect(normalizeEmail('  Juan@Example.COM ')).toBe('juan@example.com');
  });

  it('validatePassword mide LONGITUD, no composicion', () => {
    // Las reglas de composicion empujan hacia contrasenas predecibles.
    expect(validatePassword('caballo correcto grapa pila')).toBeNull();
    expect(validatePassword('Ab1!')).not.toBeNull();
  });

  it('verifyPassword devuelve false sin usuario, sin lanzar', async () => {
    expect(await verifyPassword('lo que sea', null)).toBe(false);
  }, 30_000);

  it('verifyPassword tolera un hash corrupto en base de datos', async () => {
    // No debe tumbar el login del resto de usuarios.
    expect(await verifyPassword('x', 'esto-no-es-un-hash')).toBe(false);
  }, 30_000);

  it('el hash es distinto para la misma contrasena (sal aleatoria)', async () => {
    const a = await hashPassword('contrasena-larga-123');
    const b = await hashPassword('contrasena-larga-123');
    expect(a).not.toBe(b);
    expect(await verifyPassword('contrasena-larga-123', a)).toBe(true);
    expect(await verifyPassword('contrasena-larga-123', b)).toBe(true);
  }, 30_000);
});
