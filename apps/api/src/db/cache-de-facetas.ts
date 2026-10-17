import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Cache de los recuentos BASE del rail de facetas.
 *
 * POR QUE. `listFacets` lanza una consulta por faceta mas la de rareza, y en
 * Magic sin set cada una cuesta 0,2-0,25 s. Esos recuentos no dependen de
 * quien pregunta: son los mismos para todos hasta la proxima ingesta. Con
 * sesion se suman sus parejas de tenencia, y el rail de Yu-Gi-Oh! ocupa 12 de
 * las 16 conexiones del pool; un segundo usuario simultaneo hace cola. Cachear
 * la parte base deja en el pool solo la tenencia, que es barata (~0,02 s) y
 * tiene que seguir viva.
 *
 * Detras de una interfaz minima para que el repositorio se pruebe con un
 * doble y para que, el dia que la API tenga cliente de Redis, se pueda
 * cambiar el almacen sin tocar la consulta.
 */
export interface CacheDeRecuentos {
  /** Devuelve lo cacheado bajo `clave` o lo calcula. Lo devuelto NO se muta. */
  obtener<T>(clave: string, calcular: () => Promise<T>): Promise<T>;
}

/** Sin cache: el comportamiento de siempre. Es el defecto del repositorio. */
export const SIN_CACHE: CacheDeRecuentos = {
  obtener: (_clave, calcular) => calcular(),
};

export interface OpcionesCacheEnMemoria {
  /** Vida de una entrada. 0 desactiva la cache. */
  ttlMs: number;
  ahora?: () => number;
  /**
   * Lee la generacion del catalogo. Si cambia respecto a la de la entrada, la
   * entrada no vale aunque no haya caducado: asi una ingesta, que corre en
   * otro proceso, invalida la cache sin hablar con la API.
   */
  generacion?: () => Promise<string>;
  /** Tope de entradas. Hay una por juego y set mirado; sin tope, crece sin fin. */
  maxEntradas?: number;
}

interface Entrada {
  valor: Promise<unknown>;
  caduca: number;
  generacion: string;
}

const GENERACION_FIJA = async (): Promise<string> => '';

export class CacheEnMemoria implements CacheDeRecuentos {
  readonly #ttlMs: number;
  readonly #ahora: () => number;
  readonly #generacion: () => Promise<string>;
  readonly #maxEntradas: number;
  readonly #entradas = new Map<string, Entrada>();

  constructor(opciones: OpcionesCacheEnMemoria) {
    this.#ttlMs = opciones.ttlMs;
    this.#ahora = opciones.ahora ?? Date.now;
    this.#generacion = opciones.generacion ?? GENERACION_FIJA;
    this.#maxEntradas = opciones.maxEntradas ?? 500;
  }

  async obtener<T>(clave: string, calcular: () => Promise<T>): Promise<T> {
    if (this.#ttlMs <= 0) return calcular();

    // La generacion se lee ANTES de calcular: si una ingesta acaba a mitad del
    // calculo, la entrada queda etiquetada con la vieja y la siguiente
    // peticion la descarta, en vez de dar por nuevos unos recuentos viejos.
    const generacion = await this.#generacion();
    const ahora = this.#ahora();
    const previa = this.#entradas.get(clave);
    if (previa && previa.caduca > ahora && previa.generacion === generacion) {
      return previa.valor as Promise<T>;
    }

    // Se guarda la PROMESA, no el valor: dos peticiones que llegan en frio a
    // la vez comparten un solo calculo, que es justo cuando el pool sufre.
    // Y el valor se congela: mezclar la tenencia de un usuario en sitio sobre
    // filas compartidas la filtraria al siguiente anonimo; congelado, ese
    // error revienta en el primer test en vez de pasar inadvertido.
    const valor = calcular().then(congelar);
    const entrada: Entrada = { valor, caduca: ahora + this.#ttlMs, generacion };
    this.#entradas.delete(clave);
    this.#hacerSitio(ahora);
    this.#entradas.set(clave, entrada);
    // Un fallo no se cachea: la siguiente peticion lo reintenta.
    valor.catch(() => {
      if (this.#entradas.get(clave) === entrada) this.#entradas.delete(clave);
    });
    return valor;
  }

  #hacerSitio(ahora: number): void {
    if (this.#entradas.size < this.#maxEntradas) return;
    for (const [k, e] of this.#entradas) if (e.caduca <= ahora) this.#entradas.delete(k);
    // El Map recuerda el orden de insercion: la primera es la mas antigua.
    while (this.#entradas.size >= this.#maxEntradas) {
      const primera = this.#entradas.keys().next().value;
      if (primera === undefined) break;
      this.#entradas.delete(primera);
    }
  }
}

function congelar<T>(valor: T): T {
  if (valor !== null && typeof valor === 'object' && !Object.isFrozen(valor)) {
    Object.freeze(valor);
    for (const v of Object.values(valor)) congelar(v);
  }
  return valor;
}

/**
 * INVALIDACION ENTRE PROCESOS. La ingesta es un CLI aparte: no puede vaciar
 * un Map que vive en la API. Lo que si comparten los dos es STORAGE_PATH --
 * la ingesta escribe ahi las imagenes que la API sirve, y en compose es el
 * mismo volumen (P-036) --, asi que la ingesta deja ahi una marca nueva al
 * terminar y la API la lee en cada consulta del rail (un fichero de 36 bytes,
 * fracciones de milisegundo).
 *
 * No en Redis: la API todavia no tiene cliente (`RedisLike` es solo una
 * interfaz) y anadir uno es una dependencia nueva. No en MySQL: seria una
 * migracion nueva solo para un contador. Si la marca no se puede leer o
 * escribir, el TTL sigue acotando cuanto dura un recuento viejo.
 *
 * Fichero con punto delante: @fastify/static no sirve ficheros ocultos.
 */
export function rutaDeLaMarca(storagePath: string): string {
  return join(storagePath, '.catalogo-generacion');
}

export function generacionEnFichero(ruta: string): () => Promise<string> {
  return async () => {
    try {
      return (await readFile(ruta, 'utf8')).trim();
    } catch {
      return '';
    }
  };
}

/** La llama la ingesta al terminar: cualquier valor nuevo invalida la cache. */
export async function marcarCatalogoCambiado(storagePath: string): Promise<void> {
  await mkdir(storagePath, { recursive: true });
  await writeFile(rutaDeLaMarca(storagePath), `${randomUUID()}\n`, 'utf8');
}
