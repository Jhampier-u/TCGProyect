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
