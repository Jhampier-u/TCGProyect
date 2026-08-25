import type { HostPolicy } from './types.js';

/**
 * Valores por defecto conservadores.
 *
 * `maxRetries: 5` con backoff exponencial desde 1 s y techo de 60 s.
 * `circuitThreshold: 5` fallos consecutivos abren 15 minutos, tal como fija
 * 004Arquitectura/01_Estrategia_APIs.md.
 */
export const BASE_POLICY: HostPolicy = {
  minIntervalMs: 250,
  concurrency: 1,
  maxRetries: 5,
  baseBackoffMs: 1_000,
  maxBackoffMs: 60_000,
  circuitThreshold: 5,
  circuitCooldownMs: 15 * 60_000,
};

/**
 * Politicas por host.
 *
 * TODOS los intervalos son MAS LENTOS que el limite publicado, deliberadamente:
 *  - Scryfall documenta 50-100 ms entre peticiones; aqui van 120 ms.
 *  - YGOPRODeck permite 20 req/s (50 ms); aqui van 100 ms.
 * El coste de ir lento se mide en minutos. El coste de que nos bloqueen se mide
 * en horas, y en el caso de YGOPRODeck puede ser permanente (P-001, P-002).
 */
export const DEFAULT_HOST_POLICIES: Readonly<Record<string, Partial<HostPolicy>>> = {
  // MTG. La doc exige User-Agent propio y 50-100 ms de espera. Serie estricta.
  'api.scryfall.com': { minIntervalMs: 120, concurrency: 1 },

  // YGO. 20 req/s permitidos, pero excederlo bloquea la IP UNA HORA.
  'db.ygoprodeck.com': { minIntervalMs: 100, concurrency: 2 },

  // Pokemon. No limita por segundo sino por CUOTA DIARIA. Se deja margen bajo
  // los ~20.000/dia con API key para no agotarla con reintentos.
  // maxRetries 8 y no 5: en el muestreo del 2026-08-25 solo ~30% de las
  // peticiones respondieron 200, con 500 y 502 intercalados sin patron (P-016).
  // Con 9 intentos la probabilidad de perder una pagina baja del 12% al 4%.
  'api.pokemontcg.io': { minIntervalMs: 250, concurrency: 2, dailyQuota: 18_000, maxRetries: 8 },

  // Host de los volcados masivos de Scryfall. Es un HOST DISTINTO de
  // api.scryfall.com (CDN estatico tras Cloudflare) y por tanto tiene su propia
  // cola: descargar el volcado no debe consumir el presupuesto de la API.
  // Concurrencia 1: son ficheros de decenas de MB, no tiene sentido paralelizar.
  'data.scryfall.io': { minIntervalMs: 1_000, concurrency: 1 },

  // Hosts de imagenes: siempre mas lentos. Descargar imagenes es lo que dispara
  // las listas negras, no consultar datos.
  'images.ygoprodeck.com': { minIntervalMs: 300, concurrency: 1 },
  'cards.scryfall.io': { minIntervalMs: 200, concurrency: 1 },
  'images.pokemontcg.io': { minIntervalMs: 300, concurrency: 1 },
};

/** Estados HTTP que merecen reintento. El resto de 4xx son respuestas legitimas. */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

export function resolvePolicy(host: string, overrides?: Partial<HostPolicy>): HostPolicy {
  return {
    ...BASE_POLICY,
    ...(DEFAULT_HOST_POLICIES[host] ?? {}),
    ...(overrides ?? {}),
  };
}
