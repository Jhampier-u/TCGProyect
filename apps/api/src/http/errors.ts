/** Error HTTP con estado. Se lanza cuando la respuesta no es 2xx y no procede reintentar. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body?: string,
  ) {
    super(`HTTP ${status} en ${url}`);
    this.name = 'HttpError';
  }
}

/**
 * El cortocircuito de este host esta abierto: ni se intenta la peticion.
 *
 * Existe para que, cuando un origen esta caido o nos ha bloqueado, dejemos de
 * golpearlo. Insistir contra un host que ya nos bloqueo solo alarga el bloqueo.
 */
export class CircuitOpenError extends Error {
  constructor(
    readonly host: string,
    readonly openUntil: number,
  ) {
    super(`Cortocircuito abierto para ${host}; reintentar despues de ${new Date(openUntil).toISOString()}`);
    this.name = 'CircuitOpenError';
  }
}

/** Cuota diaria agotada para este host (caso de Pokemon TCG). */
export class QuotaExhaustedError extends Error {
  constructor(
    readonly host: string,
    readonly limit: number,
  ) {
    super(`Cuota diaria agotada para ${host} (limite ${limit})`);
    this.name = 'QuotaExhaustedError';
  }
}
