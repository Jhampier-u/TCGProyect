/**
 * Tipos de la capa HTTP saliente.
 *
 * Se definen interfaces propias (`HttpResponse`, `FetchLike`) en vez de usar los
 * globales `Response` / `fetch` de forma directa por dos motivos:
 *  1. `apps/api` compila con `lib: ES2022` sin DOM; depender de los globales
 *     ataria el paquete a una configuracion concreta de tipos.
 *  2. Hace trivial inyectar un doble en los tests. Toda la suite de T-009 corre
 *     sin tocar la red y sin esperar en tiempo real.
 */

/** Subconjunto de Response que este cliente necesita. */
export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface HttpRequestInit {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export type FetchLike = (url: string, init?: HttpRequestInit) => Promise<HttpResponse>;

/**
 * Reloj inyectable. En produccion envuelve `Date.now` y `setTimeout`; en los
 * tests, un reloj virtual que avanza sin esperar. Sin esta abstraccion, probar
 * un backoff de 60 segundos costaria 60 segundos.
 */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Politica de trato hacia un host concreto.
 *
 * Es POR HOST y no global a proposito: los tres origenes castigan de forma
 * distinta y un unico cubo compartido haria que la ingesta de MTG consumiese el
 * presupuesto de YGO. Ver 004Arquitectura/01_Estrategia_APIs.md y P-002.
 */
export interface HostPolicy {
  /** Separacion minima entre el inicio de dos peticiones al mismo host. */
  minIntervalMs: number;
  /** Peticiones simultaneas permitidas contra este host. */
  concurrency: number;
  /** Reintentos ADICIONALES tras el primer intento fallido. */
  maxRetries: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  /** Fallos consecutivos que abren el cortocircuito. */
  circuitThreshold: number;
  /** Cuanto permanece abierto el cortocircuito. */
  circuitCooldownMs: number;
  /** Cuota diaria de peticiones, si el host la impone (Pokemon TCG). */
  dailyQuota?: number;
}
