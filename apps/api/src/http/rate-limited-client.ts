import { CircuitOpenError, HttpError, QuotaExhaustedError } from './errors.js';
import { RETRYABLE_STATUSES, resolvePolicy } from './policies.js';
import { InMemoryQuotaStore, type QuotaStore } from './quota.js';
import { systemClock, type Clock, type FetchLike, type HostPolicy, type HttpRequestInit, type HttpResponse } from './types.js';

/** Estado vivo de un host. Uno por host, creado bajo demanda. */
interface HostState {
  readonly host: string;
  readonly policy: HostPolicy;
  /** Peticiones en vuelo ahora mismo. */
  active: number;
  /** Instante mas temprano en que puede ARRANCAR la siguiente peticion. */
  nextSlotAt: number;
  /** Cola FIFO de esperas por concurrencia. */
  waiters: Array<() => void>;
  consecutiveFailures: number;
  circuitOpenUntil: number;
}

export interface RateLimitedClientOptions {
  /**
   * User-Agent saliente. OBLIGATORIO y sin valor por defecto: Scryfall exige uno
   * propio y descriptivo, y usar el generico del cliente HTTP es motivo de bloqueo.
   */
  userAgent: string;
  policies?: Record<string, Partial<HostPolicy>>;
  fetch?: FetchLike;
  clock?: Clock;
  /** Fuente de aleatoriedad del jitter. Inyectable para tests deterministas. */
  random?: () => number;
  quota?: QuotaStore;
  onEvent?: (event: ClientEvent) => void;
}

export type ClientEvent =
  | { type: 'retry'; host: string; url: string; attempt: number; delayMs: number; reason: string }
  | { type: 'circuit_open'; host: string; openUntil: number }
  | { type: 'circuit_closed'; host: string }
  | { type: 'quota_exhausted'; host: string; limit: number };

/**
 * Cliente HTTP con limite de tasa por host, backoff y cortocircuito. (T-009)
 *
 * Es la unica puerta de salida hacia las tres APIs externas. Ningun adaptador
 * debe llamar a `fetch` por su cuenta: perderiamos el control del ritmo, que es
 * justo lo que provoca los bloqueos de IP (P-002).
 *
 * Garantias:
 *  - Dos peticiones al mismo host nunca arrancan a menos de `minIntervalMs`.
 *  - El presupuesto de un host no se ve afectado por el trafico de otro.
 *  - Se respeta `Retry-After` cuando el servidor lo envia.
 *  - Tras `circuitThreshold` fallos consecutivos, el host se deja en paz.
 *  - El User-Agent va en TODAS las peticiones salientes.
 */
export class RateLimitedClient {
  readonly #states = new Map<string, HostState>();
  readonly #userAgent: string;
  readonly #policies: Record<string, Partial<HostPolicy>>;
  readonly #fetch: FetchLike;
  readonly #clock: Clock;
  readonly #random: () => number;
  readonly #quota: QuotaStore;
  readonly #onEvent: (event: ClientEvent) => void;

  constructor(options: RateLimitedClientOptions) {
    const userAgent = options.userAgent?.trim();
    if (!userAgent) {
      throw new Error(
        'RateLimitedClient requiere un userAgent descriptivo: Scryfall bloquea a quien no lo envia.',
      );
    }
    this.#userAgent = userAgent;
    this.#policies = options.policies ?? {};
    this.#clock = options.clock ?? systemClock;
    this.#fetch = options.fetch ?? defaultFetch;
    this.#random = options.random ?? Math.random;
    this.#quota = options.quota ?? new InMemoryQuotaStore(this.#clock);
    this.#onEvent = options.onEvent ?? (() => {});
  }

  /** Peticion con todas las garantias. Lanza si se agotan los reintentos. */
  async request(url: string, init: HttpRequestInit = {}): Promise<HttpResponse> {
    const host = new URL(url).host;
    const state = this.#stateFor(host);

    this.#assertCircuitClosed(state);

    let lastFailure: Error | undefined;

    for (let attempt = 0; attempt <= state.policy.maxRetries; attempt += 1) {
      // La cuota se consume POR INTENTO, no por peticion logica: un reintento
      // gasta cuota real en el servidor de destino igual que el primer intento.
      if (state.policy.dailyQuota !== undefined) {
        const allowed = await this.#quota.consume(host, state.policy.dailyQuota);
        if (!allowed) {
          this.#onEvent({ type: 'quota_exhausted', host, limit: state.policy.dailyQuota });
          throw new QuotaExhaustedError(host, state.policy.dailyQuota);
        }
      }

      let response: HttpResponse | undefined;
      let networkError: Error | undefined;

      await this.#acquire(state);
      try {
        response = await this.#fetch(url, { ...init, headers: this.#buildHeaders(init.headers) });
      } catch (error) {
        networkError = error instanceof Error ? error : new Error(String(error));
      } finally {
        this.#release(state);
      }

      if (response?.ok) {
        this.#recordSuccess(state);
        return response;
      }

      // 4xx que no son 429 son respuestas legitimas del servidor, no averias.
      // Un 404 no debe acercar el cortocircuito ni gastar reintentos: lo que
      // esta mal es la peticion, no el host.
      if (response && !RETRYABLE_STATUSES.has(response.status)) {
        throw new HttpError(response.status, url, await safeText(response));
      }

      lastFailure = networkError ?? new HttpError(response!.status, url, await safeText(response!));

      if (attempt === state.policy.maxRetries) break;

      const delayMs = this.#backoffFor(state, attempt, response);
      this.#onEvent({
        type: 'retry',
        host,
        url,
        attempt: attempt + 1,
        delayMs,
        reason: networkError ? networkError.message : `HTTP ${response!.status}`,
      });
      await this.#clock.sleep(delayMs);
    }

    this.#recordFailure(state);
    throw lastFailure ?? new Error(`Fallo la peticion a ${url}`);
  }

  /** Atajo tipado. El llamante asume la forma; validarla es del adaptador. */
  async json<T>(url: string, init: HttpRequestInit = {}): Promise<T> {
    const response = await this.request(url, init);
    return (await response.json()) as T;
  }

  /** Consumo de cuota del host. Para observabilidad. */
  async quotaUsed(host: string): Promise<number> {
    return this.#quota.used(host);
  }

  // ------------------------------------------------------------------
  // Interno
  // ------------------------------------------------------------------

  #stateFor(host: string): HostState {
    const existing = this.#states.get(host);
    if (existing) return existing;
    const state: HostState = {
      host,
      policy: resolvePolicy(host, this.#policies[host]),
      active: 0,
      nextSlotAt: 0,
      waiters: [],
      consecutiveFailures: 0,
      circuitOpenUntil: 0,
    };
    this.#states.set(host, state);
    return state;
  }

  #assertCircuitClosed(state: HostState): void {
    if (state.circuitOpenUntil === 0) return;
    if (this.#clock.now() < state.circuitOpenUntil) {
      throw new CircuitOpenError(state.host, state.circuitOpenUntil);
    }
    // Enfriamiento cumplido: se cierra y se da otra oportunidad al host.
    state.circuitOpenUntil = 0;
    state.consecutiveFailures = 0;
    this.#onEvent({ type: 'circuit_closed', host: state.host });
  }

  /**
   * Reserva un hueco respetando concurrencia e intervalo minimo.
   *
   * El calculo de `nextSlotAt` es SINCRONO (sin await entre leer y escribir), asi
   * que dos llamadas concurrentes no pueden reservar el mismo instante. Es lo que
   * mantiene la separacion incluso con concurrency > 1.
   */
  async #acquire(state: HostState): Promise<void> {
    while (state.active >= state.policy.concurrency) {
      await new Promise<void>((resolve) => state.waiters.push(resolve));
    }
    state.active += 1;

    const now = this.#clock.now();
    const startAt = Math.max(now, state.nextSlotAt);
    state.nextSlotAt = startAt + state.policy.minIntervalMs;

    const wait = startAt - now;
    if (wait > 0) await this.#clock.sleep(wait);
  }

  #release(state: HostState): void {
    state.active -= 1;
    const next = state.waiters.shift();
    if (next) next();
  }

  #recordSuccess(state: HostState): void {
    state.consecutiveFailures = 0;
  }

  #recordFailure(state: HostState): void {
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= state.policy.circuitThreshold) {
      state.circuitOpenUntil = this.#clock.now() + state.policy.circuitCooldownMs;
      this.#onEvent({ type: 'circuit_open', host: state.host, openUntil: state.circuitOpenUntil });
    }
  }

  /** Backoff exponencial con jitter, respetando `Retry-After` si viene. */
  #backoffFor(state: HostState, attempt: number, response: HttpResponse | undefined): number {
    const exponential = Math.min(
      state.policy.maxBackoffMs,
      state.policy.baseBackoffMs * 2 ** attempt,
    );
    // Jitter 0,5x - 1,5x: evita que varios workers reintenten a la vez y
    // vuelvan a tumbar al origen justo cuando se recupera.
    const jittered = Math.min(state.policy.maxBackoffMs, exponential * (0.5 + this.#random()));

    const retryAfter = parseRetryAfter(response?.headers.get('retry-after') ?? null, this.#clock.now());
    // Si el servidor dice cuanto esperar, se obedece. Nunca menos.
    return retryAfter === null ? jittered : Math.max(retryAfter, jittered);
  }

  #buildHeaders(extra: Record<string, string> | undefined): Record<string, string> {
    return {
      accept: 'application/json',
      ...extra,
      // El User-Agent va el ultimo: no es negociable ni sobreescribible.
      'user-agent': this.#userAgent,
    };
  }
}

/**
 * Cabecera `Retry-After`. Admite las dos formas del estandar: segundos y
 * HTTP-date. La forma fecha se compara contra `now`, que en produccion es el
 * reloj de pared.
 */
export function parseRetryAfter(value: string | null, now: number): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;

  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;

  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - now);

  return null;
}

async function safeText(response: HttpResponse): Promise<string | undefined> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return undefined;
  }
}

const defaultFetch: FetchLike = (url, init) =>
  (globalThis as { fetch: (u: string, i?: unknown) => Promise<HttpResponse> }).fetch(url, init);
