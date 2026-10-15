/**
 * El estado de los filtros del catalogo, en la URL (T-093).
 *
 * POR QUE EN LA URL Y NO EN `useState`. Es lo que hace que un filtro se pueda
 * compartir -- "mira, las de Planta de 151 que me faltan" es un enlace -- y que
 * el boton de atras deshaga el ultimo filtro en vez de sacarte del catalogo.
 * Con estado local las dos cosas se pierden y ninguna prueba lo nota.
 *
 * Funciones puras a proposito: leer y escribir no tocan el router, asi que se
 * prueban sin montar nada.
 */

export type Tenencia = '' | 'yes' | 'no';

export interface FiltrosCatalogo {
  /** `externalId` del set. Vacio = todo el juego. */
  set: string;
  q: string;
  type: string;
  supertype: string;
  rarity: string;
  /** Marca de regulacion, o `SIN_MARCA` para las anteriores a 2019. */
  mark: string;
  owned: Tenencia;
}

/** Las claves, en el orden en que se escriben: una URL estable se comparte mejor. */
export const CLAVES = ['set', 'q', 'type', 'supertype', 'rarity', 'mark', 'owned'] as const;
export type ClaveFiltro = (typeof CLAVES)[number];

export const SIN_FILTROS: FiltrosCatalogo = {
  set: '', q: '', type: '', supertype: '', rarity: '', mark: '', owned: '',
};

export function leerFiltros(params: URLSearchParams): FiltrosCatalogo {
  const owned = params.get('owned');
  return {
    set: params.get('set') ?? '',
    q: params.get('q') ?? '',
    type: params.get('type') ?? '',
    supertype: params.get('supertype') ?? '',
    rarity: params.get('rarity') ?? '',
    mark: params.get('mark') ?? '',
    // Un valor desconocido se descarta en vez de mandarse: la API lo
    // rechazaria con un 400 y el catalogo se quedaria en blanco por un enlace
    // mal copiado.
    owned: owned === 'yes' || owned === 'no' ? owned : '',
  };
}

export function escribirFiltros(filtros: FiltrosCatalogo): URLSearchParams {
  const params = new URLSearchParams();
  for (const clave of CLAVES) {
    const valor = filtros[clave].trim();
    if (valor !== '') params.set(clave, valor);
  }
  return params;
}

/**
 * Pulsar un filtro que ya esta puesto lo QUITA.
 *
 * Es lo que hace que el rail funcione como un interruptor: la misma fila que
 * pone "Planta" la quita, sin buscar otro boton.
 */
export function alternar(filtros: FiltrosCatalogo, clave: ClaveFiltro, valor: string): FiltrosCatalogo {
  return { ...filtros, [clave]: filtros[clave] === valor ? '' : valor };
}

export function quitar(filtros: FiltrosCatalogo, clave: ClaveFiltro): FiltrosCatalogo {
  return { ...filtros, [clave]: '' };
}

/**
 * Lo que se pinta como chip borrable: todo menos el set.
 *
 * El set no es un filtro mas, es el CONTEXTO -- el titulo de la pagina y el
 * ambito de los recuentos del rail --, y quitarlo con una cruz pequena entre
 * "Planta" y "Comun" seria facil de hacer sin querer.
 */
export function filtrosActivos(filtros: FiltrosCatalogo): Array<{ clave: ClaveFiltro; valor: string }> {
  return CLAVES.filter((c) => c !== 'set' && filtros[c] !== '').map((c) => ({ clave: c, valor: filtros[c] }));
}

/** Quita todos los filtros y conserva el set, por lo mismo que arriba. */
export function limpiar(filtros: FiltrosCatalogo): FiltrosCatalogo {
  return { ...SIN_FILTROS, set: filtros.set };
}
