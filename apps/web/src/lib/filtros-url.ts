import type { FacetKey, GameCode } from '@tcg/shared';
import { FACET_PROFILES } from '@tcg/shared';

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
  rarity: string;
  owned: Tenencia;
  /** Las facetas del perfil del juego (H9f): clave -> valor. */
  facetas: Partial<Record<FacetKey, string>>;
}

export type ClaveFiltro = 'set' | 'q' | 'rarity' | 'owned' | FacetKey;

export const SIN_FILTROS: FiltrosCatalogo = { set: '', q: '', rarity: '', owned: '', facetas: {} };

/**
 * Las claves de un juego, en el orden en que se escriben: una URL estable se
 * comparte mejor. Las facetas van en el orden del perfil.
 */
export function clavesDe(juego: GameCode): ClaveFiltro[] {
  return ['set', 'q', ...FACET_PROFILES[juego].facets.map((f) => f.key), 'rarity', 'owned'];
}

export function valorDe(filtros: FiltrosCatalogo, clave: ClaveFiltro): string {
  switch (clave) {
    case 'set': return filtros.set;
    case 'q': return filtros.q;
    case 'rarity': return filtros.rarity;
    case 'owned': return filtros.owned;
    default: return filtros.facetas[clave] ?? '';
  }
}

function conValor(filtros: FiltrosCatalogo, clave: ClaveFiltro, crudo: string): FiltrosCatalogo {
  // Se recorta al entrar: lo que se guarda es lo que se escribe en la URL y lo
  // que se manda a la API, asi que la clave de cache y la peticion coinciden.
  // Un valor en blanco es un filtro quitado.
  const valor = crudo.trim();
  switch (clave) {
    case 'set': return { ...filtros, set: valor };
    case 'q': return { ...filtros, q: valor };
    case 'rarity': return { ...filtros, rarity: valor };
    // Un valor desconocido se descarta en vez de mandarse: la API lo
    // rechazaria con un 400 y el catalogo se quedaria en blanco.
    case 'owned': return { ...filtros, owned: valor === 'yes' || valor === 'no' ? valor : '' };
    default: {
      const facetas = { ...filtros.facetas };
      if (valor === '') delete facetas[clave];
      else facetas[clave] = valor;
      return { ...filtros, facetas };
    }
  }
}

/** Solo se leen las claves del juego: una de otro juego en la URL se ignora. */
export function leerFiltros(params: URLSearchParams, juego: GameCode): FiltrosCatalogo {
  return clavesDe(juego).reduce((f, clave) => conValor(f, clave, params.get(clave) ?? ''), SIN_FILTROS);
}

export function escribirFiltros(filtros: FiltrosCatalogo, juego: GameCode): URLSearchParams {
  const params = new URLSearchParams();
  for (const clave of clavesDe(juego)) {
    const valor = valorDe(filtros, clave).trim();
    if (valor !== '') params.set(clave, valor);
  }
  return params;
}

/**
 * Pulsar un filtro que ya esta puesto lo QUITA: la misma fila del rail que pone
 * "Planta" la quita, sin buscar otro boton.
 */
export function alternar(filtros: FiltrosCatalogo, clave: ClaveFiltro, valor: string): FiltrosCatalogo {
  return conValor(filtros, clave, valorDe(filtros, clave) === valor ? '' : valor);
}

export function quitar(filtros: FiltrosCatalogo, clave: ClaveFiltro): FiltrosCatalogo {
  return conValor(filtros, clave, '');
}

/**
 * Lo que se pinta como chip borrable: todo menos el set, que es el CONTEXTO --
 * el titulo de la pagina y el ambito de los recuentos --, no un filtro mas.
 */
export function filtrosActivos(
  filtros: FiltrosCatalogo,
  juego: GameCode,
): Array<{ clave: ClaveFiltro; valor: string }> {
  return clavesDe(juego)
    .filter((c) => c !== 'set' && valorDe(filtros, c) !== '')
    .map((c) => ({ clave: c, valor: valorDe(filtros, c) }));
}

/** Quita todos los filtros y conserva el set, por lo mismo que arriba. */
export function limpiar(filtros: FiltrosCatalogo): FiltrosCatalogo {
  return { ...SIN_FILTROS, set: filtros.set };
}
