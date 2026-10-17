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
 * Fichero con punto delante y `dotfiles: 'ignore'` en el registro de
 * @fastify/static (server.ts): su defecto es 'allow', asi que sin esa opcion
 * /images/.catalogo-generacion se serviria, y con la cache de un ano.
 */
export function rutaDeLaMarca(storagePath: string): string {
  return join(storagePath, '.catalogo-generacion');
}

/**
 * La API crea UN lector al arrancar, asi que "una vez por lector" es una vez
 * por proceso. Que no exista la marca es normal (nunca se ha ingestado con
 * esta version) y calla. Que exista y no se pueda leer -- permisos, un
 * directorio con ese nombre -- deja la invalidacion muerta en silencio y solo
 * quedaria el TTL: eso se avisa, pero una vez, que se lee en cada peticion.
 */
export function generacionEnFichero(
  ruta: string,
  avisar: (mensaje: string) => void = (m) => console.warn(m),
): () => Promise<string> {
  let avisado = false;
  return async () => {
    try {
      return (await readFile(ruta, 'utf8')).trim();
    } catch (error) {
      const codigo = (error as NodeJS.ErrnoException).code;
      if (codigo !== 'ENOENT' && !avisado) {
        avisado = true;
        avisar(`[facetas] la marca ${ruta} existe pero no se puede leer (${codigo ?? String(error)}): ` +
          'las ingestas no invalidaran la cache, solo caducara por TTL.');
      }
      return '';
    }
  };
}

/** La llama la ingesta al terminar: cualquier valor nuevo invalida la cache. */
export async function marcarCatalogoCambiado(storagePath: string): Promise<void> {
  await mkdir(storagePath, { recursive: true });
  await writeFile(rutaDeLaMarca(storagePath), `${randomUUID()}\n`, 'utf8');
}

/**
 * Envuelve la parte de la ingesta que escribe el catalogo. El trabajo llama a
 * `tocar()` cuando puede haber cambiado algo, y al salir -- bien o MAL -- se
 * deja la marca. Por eso un `finally`: una ingesta que cae a medias ya ha
 * escrito sets, y sin marca la API seguiria enseniando los recuentos de antes
 * hasta el TTL. Si el trabajo no toco nada (`--images-only` sin sets
 * reclasificados) no se marca: vaciar la cache de todos para nada es coste.
 *
 * Un fallo al marcar se avisa y no se propaga: no debe tapar ni el resultado
 * ni el error original de la ingesta, que es el que hay que leer.
 */
export async function conMarcaAlTerminar<T>(
  marcar: () => Promise<void>,
  trabajo: (tocar: () => void) => Promise<T>,
  avisar: (mensaje: string) => void = (m) => console.warn(m),
): Promise<T> {
  let tocado = false;
  try {
    return await trabajo(() => { tocado = true; });
  } finally {
    if (tocado) {
      try {
        await marcar();
      } catch (error) {
        avisar(`[facetas] no se pudo marcar el catalogo como cambiado: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
