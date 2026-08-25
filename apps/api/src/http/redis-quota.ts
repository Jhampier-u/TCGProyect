import type { QuotaStore } from './quota.js';
import type { Clock } from './types.js';

/**
 * Subconjunto de un cliente Redis que este contador necesita.
 *
 * Se define aqui en vez de depender de `ioredis` o `node-redis` por dos motivos:
 * no anade una dependencia (ni superficie de auditoria) a un paquete que aun no
 * ha elegido cliente, y permite probar la logica con un doble en memoria que
 * imita la semantica real de Redis. Ambos clientes populares satisfacen esta
 * forma tal cual.
 */
export interface RedisLike {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

const SECONDS_PER_DAY = 86_400;

/**
 * Contador de cuota diaria persistido en Redis. Implementa T-017 y cierra P-012.
 *
 * EL PROBLEMA QUE RESUELVE. `InMemoryQuotaStore` cuenta en un Map del proceso.
 * Si el worker se reinicia a mitad de una ingesta -- despliegue, OOM, un
 * cortocircuito que lo deja colgado -- el contador vuelve a cero mientras la
 * cuota real en el servidor de Pokemon sigue consumida. Con una ingesta de horas
 * y dos o tres reinicios, se agota la cuota del dia creyendo que sobran miles de
 * peticiones. El sintoma seria una avalancha de 429 sin causa visible en los logs.
 *
 * DOS DEFENSAS INDEPENDIENTES CONTRA EL VUELCO DE DIA:
 *  1. La fecha forma parte de la CLAVE. Al cambiar el dia UTC se empieza a contar
 *     en una clave nueva, aunque el TTL fallara.
 *  2. TTL hasta la medianoche UTC, para que las claves viejas no se acumulen.
 * La primera es la que garantiza la correccion; la segunda solo limpia. Si el
 * proceso muriera entre el INCR y el EXPIRE, la clave quedaria sin caducidad,
 * pero nadie volveria a leerla porque su fecha ya paso.
 */
export class RedisQuotaStore implements QuotaStore {
  readonly #redis: RedisLike;
  readonly #clock: Clock;
  readonly #prefix: string;

  constructor(redis: RedisLike, clock: Clock, prefix = 'tcg:quota') {
    this.#redis = redis;
    this.#clock = clock;
    this.#prefix = prefix;
  }

  async consume(key: string, limit: number): Promise<boolean> {
    const redisKey = this.#keyFor(key);

    // INCR es atomico: dos workers concurrentes obtienen valores distintos y
    // ninguno puede colarse por encima del limite. Ese es justo el motivo de
    // contar en Redis y no en cada proceso.
    const count = await this.#redis.incr(redisKey);

    // Solo el primero en llegar fija la caducidad.
    if (count === 1) {
      await this.#redis.expire(redisKey, this.#secondsUntilUtcMidnight());
    }

    if (count > limit) {
      // Se devuelve el incremento para que `used()` no se infle sin limite
      // cuando muchas peticiones chocan contra la cuota agotada.
      await this.#redis.decr(redisKey);
      return false;
    }

    return true;
  }

  async used(key: string): Promise<number> {
    const raw = await this.#redis.get(this.#keyFor(key));
    if (raw === null) return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }

  /** `tcg:quota:api.pokemontcg.io:2026-08-25` */
  #keyFor(key: string): string {
    return `${this.#prefix}:${key}:${this.#utcDate()}`;
  }

  #utcDate(): string {
    return new Date(this.#clock.now()).toISOString().slice(0, 10);
  }

  #secondsUntilUtcMidnight(): number {
    const now = this.#clock.now();
    const startOfDay = Math.floor(now / 1000 / SECONDS_PER_DAY) * SECONDS_PER_DAY * 1000;
    const nextMidnight = startOfDay + SECONDS_PER_DAY * 1000;
    // Minimo 1 s: un EXPIRE de 0 borraria la clave al instante.
    return Math.max(1, Math.ceil((nextMidnight - now) / 1000));
  }
}
