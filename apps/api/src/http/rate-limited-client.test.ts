import { describe, it, expect } from 'vitest';
import { RateLimitedClient, parseRetryAfter } from './rate-limited-client.js';
import { CircuitOpenError, HttpError, QuotaExhaustedError } from './errors.js';
import { InMemoryQuotaStore } from './quota.js';
import type { Clock, FetchLike, HttpResponse } from './types.js';

/** Reloj virtual: el tiempo avanza sin que la suite espere de verdad. */
class VirtualClock implements Clock {
  t = 0;
  now(): number {
    return this.t;
  }
  async sleep(ms: number): Promise<void> {
    this.t += ms;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function res(status: number, body: unknown = {}, headers: Record<string, string> = {}): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

/** Registra cada llamada con el instante virtual en que ocurrio. */
function recordingFetch(clock: VirtualClock, responder: (url: string, n: number) => HttpResponse) {
  const calls: Array<{ url: string; at: number; headers: Record<string, string> }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, at: clock.now(), headers: (init?.headers ?? {}) as Record<string, string> });
    const response = responder(url, calls.length);
    if (response.status === 0) throw new Error('ECONNRESET simulado');
    return response;
  };
  return { calls, fetch };
}

const UA = 'ProyectoTCG/0.1 (+mailto:test@example.com)';

function makeClient(clock: VirtualClock, fetch: FetchLike, extra = {}) {
  return new RateLimitedClient({
    userAgent: UA,
    clock,
    fetch,
    random: () => 0.5, // jitter fijo a 1.0x -> backoff determinista
    quota: new InMemoryQuotaStore(clock),
    ...extra,
  });
}

describe('User-Agent', () => {
  it('exige un User-Agent descriptivo en el constructor', () => {
    // Scryfall bloquea a quien no lo envia; fallar pronto es mejor que ser bloqueado.
    expect(() => new RateLimitedClient({ userAgent: '' })).toThrow(/userAgent/);
    expect(() => new RateLimitedClient({ userAgent: '   ' })).toThrow(/userAgent/);
  });

  it('lo envia en TODAS las peticiones y no se puede sobreescribir', () => {
    const clock = new VirtualClock();
    const { calls, fetch } = recordingFetch(clock, () => res(200));
    const client = makeClient(clock, fetch);

    return client
      .request('https://api.scryfall.com/sets', { headers: { 'user-agent': 'pirata/1.0' } })
      .then(() => {
        expect(calls[0]!.headers['user-agent']).toBe(UA);
      });
  });
});

describe('limite de tasa por host', () => {
  it('separa peticiones consecutivas al menos minIntervalMs (Scryfall: 120 ms)', async () => {
    const clock = new VirtualClock();
    const { calls, fetch } = recordingFetch(clock, () => res(200));
    const client = makeClient(clock, fetch);

    for (let i = 0; i < 4; i += 1) {
      await client.request(`https://api.scryfall.com/cards/${i}`);
    }

    expect(calls).toHaveLength(4);
    for (let i = 1; i < calls.length; i += 1) {
      expect(calls[i]!.at - calls[i - 1]!.at).toBeGreaterThanOrEqual(120);
    }
  });

  it('NO mezcla presupuestos entre hosts (motivo de que la cola sea por host)', async () => {
    const clock = new VirtualClock();
    const { calls, fetch } = recordingFetch(clock, () => res(200));
    const client = makeClient(clock, fetch);

    // Una peticion a Scryfall consume su hueco...
    await client.request('https://api.scryfall.com/sets');
    const scryfallAt = calls[0]!.at;

    // ...y la siguiente a YGOPRODeck no debe esperar por culpa de aquella.
    await client.request('https://db.ygoprodeck.com/api/v7/cardinfo.php');
    expect(calls[1]!.at).toBe(scryfallAt);
  });

  it('con concurrency > 1 sigue gastando el intervalo por peticion (YGO: 100 ms)', async () => {
    // NOTA SOBRE ESTE TEST: con varias peticiones en vuelo no se puede afirmar
    // nada sobre el hueco ENTRE dos llamadas concretas, porque el reloj virtual
    // tiene un unico `t` global y los sleeps de peticiones distintas se solapan.
    // Lo que si es invariante y observable: N peticiones al mismo host no pueden
    // haberse despachado todas antes de (N-1) * minIntervalMs.
    const clock = new VirtualClock();
    const { calls, fetch } = recordingFetch(clock, () => res(200));
    const client = makeClient(clock, fetch);

    await Promise.all(
      [0, 1, 2, 3].map((i) => client.request(`https://db.ygoprodeck.com/api/v7/card/${i}`)),
    );

    expect(calls).toHaveLength(4);
    const ultima = Math.max(...calls.map((c) => c.at));
    expect(ultima).toBeGreaterThanOrEqual(3 * 100);
  });

  it('nunca supera el limite de peticiones simultaneas', async () => {
    const clock = new VirtualClock();
    let enVuelo = 0;
    let maximo = 0;
    const fetch: FetchLike = async () => {
      enVuelo += 1;
      maximo = Math.max(maximo, enVuelo);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      enVuelo -= 1;
      return res(200);
    };
    const client = makeClient(clock, fetch, {
      policies: { 'db.ygoprodeck.com': { concurrency: 2, minIntervalMs: 0 } },
    });

    await Promise.all(
      [0, 1, 2, 3, 4, 5].map((i) => client.request(`https://db.ygoprodeck.com/api/v7/card/${i}`)),
    );

    expect(maximo).toBeLessThanOrEqual(2);
    expect(maximo).toBeGreaterThan(0);
  });
});

describe('reintentos y backoff', () => {
  it('reintenta ante 500 con backoff exponencial', async () => {
    const clock = new VirtualClock();
    const { calls, fetch } = recordingFetch(clock, (_u, n) => (n < 3 ? res(500) : res(200)));
    const client = makeClient(clock, fetch);

    const response = await client.request('https://api.scryfall.com/sets');
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(3);

    // random fijo a 0.5 -> factor 1.0. Base 1000 ms: 1000, luego 2000.
    const gap1 = calls[1]!.at - calls[0]!.at;
    const gap2 = calls[2]!.at - calls[1]!.at;
    expect(gap1).toBeGreaterThanOrEqual(1_000);
    expect(gap2).toBeGreaterThanOrEqual(2_000);
    expect(gap2).toBeGreaterThan(gap1);
  });

  it('obedece Retry-After cuando supera al backoff calculado', async () => {
    const clock = new VirtualClock();
    const { calls, fetch } = recordingFetch(clock, (_u, n) =>
      n === 1 ? res(429, {}, { 'retry-after': '30' }) : res(200),
    );
    const client = makeClient(clock, fetch);

    await client.request('https://db.ygoprodeck.com/api/v7/cardinfo.php');
    // 30 s del servidor mandan sobre el backoff de 1 s.
    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(30_000);
  });

  it('reintenta ante error de red', async () => {
    const clock = new VirtualClock();
    const { calls, fetch } = recordingFetch(clock, (_u, n) => (n === 1 ? res(0) : res(200)));
    const client = makeClient(clock, fetch);

    const response = await client.request('https://api.scryfall.com/sets');
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('NO reintenta ante 404: es una respuesta legitima, no una averia', async () => {
    const clock = new VirtualClock();
    const { calls, fetch } = recordingFetch(clock, () => res(404));
    const client = makeClient(clock, fetch);

    await expect(client.request('https://api.scryfall.com/sets/noexiste')).rejects.toBeInstanceOf(
      HttpError,
    );
    expect(calls).toHaveLength(1);
  });

  it('respeta el techo maxBackoffMs', async () => {
    const clock = new VirtualClock();
    const { calls, fetch } = recordingFetch(clock, (_u, n) => (n < 8 ? res(503) : res(200)));
    const client = makeClient(clock, fetch, {
      policies: { 'api.scryfall.com': { maxRetries: 10, baseBackoffMs: 1_000, maxBackoffMs: 5_000 } },
    });

    await client.request('https://api.scryfall.com/sets');
    for (let i = 1; i < calls.length; i += 1) {
      expect(calls[i]!.at - calls[i - 1]!.at).toBeLessThanOrEqual(5_000 + 120);
    }
  });
});

describe('cortocircuito', () => {
  it('se abre tras circuitThreshold fallos consecutivos y deja de golpear al host', async () => {
    const clock = new VirtualClock();
    const { calls, fetch } = recordingFetch(clock, () => res(503));
    const events: string[] = [];
    const client = makeClient(clock, fetch, {
      policies: { 'api.scryfall.com': { maxRetries: 0, circuitThreshold: 3 } },
      onEvent: (e: { type: string }) => events.push(e.type),
    });

    for (let i = 0; i < 3; i += 1) {
      await expect(client.request('https://api.scryfall.com/sets')).rejects.toBeInstanceOf(HttpError);
    }
    expect(calls).toHaveLength(3);
    expect(events).toContain('circuit_open');

    // La cuarta ni sale a la red.
    await expect(client.request('https://api.scryfall.com/sets')).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    expect(calls).toHaveLength(3);
  });

  it('un exito reinicia el contador de fallos', async () => {
    const clock = new VirtualClock();
    const { fetch } = recordingFetch(clock, (_u, n) => (n === 3 ? res(200) : res(503)));
    const client = makeClient(clock, fetch, {
      policies: { 'api.scryfall.com': { maxRetries: 0, circuitThreshold: 3 } },
    });

    await expect(client.request('https://api.scryfall.com/a')).rejects.toBeInstanceOf(HttpError);
    await expect(client.request('https://api.scryfall.com/b')).rejects.toBeInstanceOf(HttpError);
    await client.request('https://api.scryfall.com/c'); // exito: contador a 0
    await expect(client.request('https://api.scryfall.com/d')).rejects.toBeInstanceOf(HttpError);

    // Solo 1 fallo consecutivo tras el exito: el circuito sigue cerrado.
    await expect(client.request('https://api.scryfall.com/e')).rejects.toBeInstanceOf(HttpError);
  });

  it('se cierra solo al cumplirse el enfriamiento', async () => {
    const clock = new VirtualClock();
    let fail = true;
    const { fetch } = recordingFetch(clock, () => (fail ? res(503) : res(200)));
    const events: string[] = [];
    const client = makeClient(clock, fetch, {
      policies: {
        'api.scryfall.com': { maxRetries: 0, circuitThreshold: 2, circuitCooldownMs: 900_000 },
      },
      onEvent: (e: { type: string }) => events.push(e.type),
    });

    await expect(client.request('https://api.scryfall.com/a')).rejects.toBeInstanceOf(HttpError);
    await expect(client.request('https://api.scryfall.com/b')).rejects.toBeInstanceOf(HttpError);
    await expect(client.request('https://api.scryfall.com/c')).rejects.toBeInstanceOf(
      CircuitOpenError,
    );

    clock.t += 900_001; // pasan los 15 minutos
    fail = false;
    const response = await client.request('https://api.scryfall.com/d');
    expect(response.status).toBe(200);
    expect(events).toContain('circuit_closed');
  });
});

describe('cuota diaria (Pokemon TCG)', () => {
  it('lanza QuotaExhaustedError al agotarse', async () => {
    const clock = new VirtualClock();
    const { calls, fetch } = recordingFetch(clock, () => res(200));
    const client = makeClient(clock, fetch, {
      policies: { 'api.pokemontcg.io': { dailyQuota: 3, minIntervalMs: 0 } },
    });

    for (let i = 0; i < 3; i += 1) {
      await client.request(`https://api.pokemontcg.io/v2/cards?page=${i}`);
    }
    await expect(client.request('https://api.pokemontcg.io/v2/cards?page=4')).rejects.toBeInstanceOf(
      QuotaExhaustedError,
    );
    expect(calls).toHaveLength(3);
    expect(await client.quotaUsed('api.pokemontcg.io')).toBe(3);
  });

  it('los reintentos TAMBIEN consumen cuota (gastan peticiones reales)', async () => {
    const clock = new VirtualClock();
    const { fetch } = recordingFetch(clock, (_u, n) => (n < 3 ? res(500) : res(200)));
    const client = makeClient(clock, fetch, {
      policies: { 'api.pokemontcg.io': { dailyQuota: 10, minIntervalMs: 0 } },
    });

    await client.request('https://api.pokemontcg.io/v2/cards');
    expect(await client.quotaUsed('api.pokemontcg.io')).toBe(3);
  });

  it('la cuota se renueva al cambiar de dia UTC', async () => {
    const clock = new VirtualClock();
    const { fetch } = recordingFetch(clock, () => res(200));
    const client = makeClient(clock, fetch, {
      policies: { 'api.pokemontcg.io': { dailyQuota: 1, minIntervalMs: 0 } },
    });

    await client.request('https://api.pokemontcg.io/v2/cards');
    await expect(client.request('https://api.pokemontcg.io/v2/cards')).rejects.toBeInstanceOf(
      QuotaExhaustedError,
    );

    clock.t += 86_400_000; // un dia
    const response = await client.request('https://api.pokemontcg.io/v2/cards');
    expect(response.status).toBe(200);
  });
});

describe('parseRetryAfter', () => {
  it('admite la forma en segundos', () => {
    expect(parseRetryAfter('30', 0)).toBe(30_000);
    expect(parseRetryAfter('0', 0)).toBe(0);
  });

  it('admite la forma HTTP-date', () => {
    const now = Date.parse('2026-08-25T12:00:00Z');
    expect(parseRetryAfter('Tue, 25 Aug 2026 12:00:30 GMT', now)).toBe(30_000);
  });

  it('nunca devuelve un valor negativo con una fecha pasada', () => {
    const now = Date.parse('2026-08-25T12:00:00Z');
    expect(parseRetryAfter('Tue, 25 Aug 2026 11:00:00 GMT', now)).toBe(0);
  });

  it('devuelve null ante ausencia o basura', () => {
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter('', 0)).toBeNull();
    expect(parseRetryAfter('pronto', 0)).toBeNull();
  });
});
