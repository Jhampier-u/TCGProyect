import type { SlotConfig } from './types.js';

/**
 * Rarezas presentes en el pool que NINGUNA slot de la plantilla pide (T-034).
 *
 * Cada una es un trozo del set que el usuario no puede obtener jamas, por
 * mucho que abra. `01_Producto.md` define al coleccionista como uno de los tres
 * usuarios objetivo, asi que una lista no vacia aqui es una promesa incumplida,
 * no una imprecision de fidelidad.
 *
 * POR QUE NO SE LE ACREDITA NADA AL RESPALDO DEL MOTOR. `#poolFor` actua cuando
 * la rareza PEDIDA esta vacia en el set: entonces entrega otra. Nunca anade una
 * rareza que ninguna slot nombra. Contar aqui lo que el respaldo podria llegar a
 * entregar haria el informe optimista justo donde tiene que ser pesimista.
 *
 * El caso contrario -- la plantilla pide algo que el set no tiene -- NO se
 * reporta: es normal y el respaldo lo resuelve. Reportarlo llenaria de ruido
 * cada set y el informe dejaria de leerse, que es como se pierden los avisos
 * (T-019).
 */
export function rarezasInalcanzables(
  slots: ReadonlyArray<SlotConfig>,
  rarezasDelPool: Iterable<string>,
): string[] {
  const pedidas = new Set<string>();
  for (const slot of slots) {
    for (const d of slot.distribution) pedidas.add(d.rarity);
  }

  const fuera = new Set<string>();
  for (const rareza of rarezasDelPool) {
    if (!pedidas.has(rareza)) fuera.add(rareza);
  }
  return [...fuera].sort();
}

/** Lo que una slot pide y nadie en el juego puede entregar. */
export interface SlotSinDestino {
  slotIndex: number;
  /** Rarezas que la slot nombra y que ningun set del juego tiene. */
  rarezas: string[];
  /** Fraccion del peso de la slot que va a parar ahi, de 0 a 1. */
  fraccion: number;
}

/**
 * Peso que una plantilla dedica a rarezas que NINGUN set del juego tiene
 * (T-070).
 *
 * Es el otro lado de `rarezasInalcanzables`, y hay que medirlo aparte porque el
 * informe de cobertura mira SET A SET: que una plantilla pida algo que un set
 * concreto no tiene es normal -- el respaldo entrega otra carta -- y reportarlo
 * por set seria ruido. Pero que lo pida algo que NO EXISTE EN TODO EL JUEGO no
 * es normal: es una plantilla que describe una epoca que ya paso, o una errata.
 *
 * POR QUE IMPORTA. El respaldo del motor entrega la alternativa de MAYOR PESO
 * del slot, no una proporcional. En Pokemon eso significaba que `rare_holo`
 * (267) y `hyper_rare` (18) -- cero impresiones en todo el catalogo -- caian
 * enteras sobre `rare`, que pasaba del 40% previsto al 72,3% medido. La
 * plantilla decia una cosa y el sobre entregaba otra, sin un solo error.
 *
 * NO ES SIEMPRE UN FALLO, y por eso esto informa en vez de romper: una
 * plantilla generica puede describir sets legitimos que todavia no se han
 * ingestado. Lo que no puede es pasar desapercibida.
 */
export function pesoSinDestino(
  slots: ReadonlyArray<SlotConfig>,
  rarezasExistentes: ReadonlySet<string>,
): SlotSinDestino[] {
  const salida: SlotSinDestino[] = [];

  for (const slot of slots) {
    let total = 0;
    let perdido = 0;
    const rarezas = new Set<string>();

    for (const d of slot.distribution) {
      total += d.weight;
      if (!rarezasExistentes.has(d.rarity)) {
        perdido += d.weight;
        rarezas.add(d.rarity);
      }
    }

    // Un slot con todos los pesos a cero no reparte nada: no hay fraccion que
    // calcular y dividir daria NaN, que se colaria en el informe como un numero.
    if (perdido === 0 || total === 0) continue;

    salida.push({ slotIndex: slot.slotIndex, rarezas: [...rarezas].sort(), fraccion: perdido / total });
  }

  return salida;
}
