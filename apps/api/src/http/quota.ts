import type { Clock } from './types.js';

/**
 * Contador de cuota diaria.
 *
 * La implementacion de produccion ira sobre Redis con TTL a medianoche UTC, para
 * que el contador sobreviva a un reinicio del worker: si se pierde la cuenta y
 * se reinicia a cero, se puede agotar la cuota real del dia sin enterarse.
 * De momento basta la version en memoria y el contrato queda fijado aqui.
 */
export interface QuotaStore {
  /**
   * Intenta consumir una unidad de cuota.
   * @returns true si habia cuota disponible, false si esta agotada.
   */
  consume(key: string, limit: number): Promise<boolean>;
  /** Consumo actual del dia. Para observabilidad. */
  used(key: string): Promise<number>;
}

/** Implementacion en memoria con vuelco automatico de dia (UTC). */
export class InMemoryQuotaStore implements QuotaStore {
  readonly #counters = new Map<string, { day: number; count: number }>();

  constructor(private readonly clock: Clock) {}

  #dayOf(now: number): number {
    return Math.floor(now / 86_400_000);
  }

  #bucket(key: string): { day: number; count: number } {
    const today = this.#dayOf(this.clock.now());
    const existing = this.#counters.get(key);
    if (existing && existing.day === today) return existing;
    const fresh = { day: today, count: 0 };
    this.#counters.set(key, fresh);
    return fresh;
  }

  async consume(key: string, limit: number): Promise<boolean> {
    const bucket = this.#bucket(key);
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }

  async used(key: string): Promise<number> {
    return this.#bucket(key).count;
  }
}
