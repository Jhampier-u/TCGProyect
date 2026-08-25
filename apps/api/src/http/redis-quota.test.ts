import { describe, it, expect } from 'vitest';
import { RedisQuotaStore, type RedisLike } from './redis-quota.js';
import type { Clock } from './types.js';

/** Doble de Redis que imita la semantica real de INCR / DECR / EXPIRE / GET. */
class FakeRedis implements RedisLike {
  readonly values = new Map<string, number>();
  readonly ttls = new Map<string, number>();
  /** Historial de comandos, para comprobar el orden de las operaciones. */
  readonly log: string[] = [];

  async incr(key: string): Promise<number> {
    const next = (this.values.get(key) ?? 0) + 1;
    this.values.set(key, next);
    this.log.push(`incr ${key}`);
    return next;
  }
  async decr(key: string): Promise<number> {
    const next = (this.values.get(key) ?? 0) - 1;
    this.values.set(key, next);
    this.log.push(`decr ${key}`);
    return next;
  }
  async expire(key: string, seconds: number): Promise<unknown> {
    this.ttls.set(key, seconds);
    this.log.push(`expire ${key} ${seconds}`);
    return 1;
  }
  async get(key: string): Promise<string | null> {
    const v = this.values.get(key);
    return v === undefined ? null : String(v);
  }
}

class FixedClock implements Clock {
  constructor(public t: number) {}
  now(): number {
    return this.t;
  }
  async sleep(): Promise<void> {}
}

const HOST = 'api.pokemontcg.io';
/** 2026-08-25T12:00:00Z */
const MEDIODIA = Date.parse('2026-08-25T12:00:00Z');

describe('RedisQuotaStore', () => {
  it('consume hasta el limite y luego rechaza', async () => {
    const redis = new FakeRedis();
    const store = new RedisQuotaStore(redis, new FixedClock(MEDIODIA));

    expect(await store.consume(HOST, 3)).toBe(true);
    expect(await store.consume(HOST, 3)).toBe(true);
    expect(await store.consume(HOST, 3)).toBe(true);
    expect(await store.consume(HOST, 3)).toBe(false);
    expect(await store.used(HOST)).toBe(3);
  });

  it('NO infla el contador cuando la cuota ya esta agotada', async () => {
    // Sin el DECR de compensacion, cada peticion rechazada seguiria sumando y
    // `used()` reportaria cifras sin sentido en los paneles.
    const redis = new FakeRedis();
    const store = new RedisQuotaStore(redis, new FixedClock(MEDIODIA));

    await store.consume(HOST, 1);
    for (let i = 0; i < 20; i += 1) await store.consume(HOST, 1);

    expect(await store.used(HOST)).toBe(1);
  });

  it('incluye la fecha UTC en la clave', async () => {
    const redis = new FakeRedis();
    const store = new RedisQuotaStore(redis, new FixedClock(MEDIODIA));
    await store.consume(HOST, 10);

    expect([...redis.values.keys()]).toEqual(['tcg:quota:api.pokemontcg.io:2026-08-25']);
  });

  it('SOBREVIVE al reinicio del worker: el conteo esta en Redis, no en el proceso (P-012)', async () => {
    const redis = new FakeRedis();
    const clock = new FixedClock(MEDIODIA);

    // Primer "worker": gasta 5 de 10.
    const antes = new RedisQuotaStore(redis, clock);
    for (let i = 0; i < 5; i += 1) await antes.consume(HOST, 10);

    // El worker muere y arranca otro, con un objeto store completamente nuevo.
    const despues = new RedisQuotaStore(redis, clock);

    expect(await despues.used(HOST)).toBe(5);
    // Solo quedan 5, no 10: es exactamente lo que la version en memoria perdia.
    for (let i = 0; i < 5; i += 1) expect(await despues.consume(HOST, 10)).toBe(true);
    expect(await despues.consume(HOST, 10)).toBe(false);
  });

  it('la cuota se renueva al cambiar de dia UTC', async () => {
    const redis = new FakeRedis();
    const clock = new FixedClock(MEDIODIA);
    const store = new RedisQuotaStore(redis, clock);

    expect(await store.consume(HOST, 1)).toBe(true);
    expect(await store.consume(HOST, 1)).toBe(false);

    clock.t += 86_400_000; // un dia exacto
    expect(await store.consume(HOST, 1)).toBe(true);
    expect(await store.used(HOST)).toBe(1);
  });

  it('fija el TTL solo en el primer incremento', async () => {
    const redis = new FakeRedis();
    const store = new RedisQuotaStore(redis, new FixedClock(MEDIODIA));

    await store.consume(HOST, 10);
    await store.consume(HOST, 10);
    await store.consume(HOST, 10);

    expect(redis.log.filter((l) => l.startsWith('expire'))).toHaveLength(1);
  });

  it('el TTL apunta a la medianoche UTC siguiente', async () => {
    const redis = new FakeRedis();
    // 12:00 UTC -> quedan 12 h = 43.200 s
    await new RedisQuotaStore(redis, new FixedClock(MEDIODIA)).consume(HOST, 10);
    expect(redis.ttls.get('tcg:quota:api.pokemontcg.io:2026-08-25')).toBe(43_200);
  });

  it('nunca fija un TTL de 0, que borraria la clave al instante', async () => {
    const redis = new FakeRedis();
    // Un milisegundo antes de medianoche.
    const casiMedianoche = Date.parse('2026-08-25T23:59:59.999Z');
    await new RedisQuotaStore(redis, new FixedClock(casiMedianoche)).consume(HOST, 10);

    const ttl = redis.ttls.get('tcg:quota:api.pokemontcg.io:2026-08-25')!;
    expect(ttl).toBeGreaterThanOrEqual(1);
  });

  it('cada host lleva su propio contador', async () => {
    const redis = new FakeRedis();
    const store = new RedisQuotaStore(redis, new FixedClock(MEDIODIA));

    await store.consume('api.pokemontcg.io', 1);
    expect(await store.consume('api.pokemontcg.io', 1)).toBe(false);
    // Otro host no se ve afectado.
    expect(await store.consume('api.scryfall.com', 1)).toBe(true);
  });

  it('tolera un prefijo propio', async () => {
    const redis = new FakeRedis();
    await new RedisQuotaStore(redis, new FixedClock(MEDIODIA), 'otro').consume(HOST, 5);
    expect([...redis.values.keys()][0]).toBe('otro:api.pokemontcg.io:2026-08-25');
  });
});
