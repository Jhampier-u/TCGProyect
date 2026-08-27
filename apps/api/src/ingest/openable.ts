import type { GameCode } from '@tcg/shared';

/**
 * Cartas que lleva un sobre de cada juego.
 *
 * Espejo del `card_count` de las plantillas por defecto sembradas en la
 * migracion 0003. Se duplica aqui para no consultar la base en cada set de la
 * ingesta, y un test comprueba que las dos copias dicen lo mismo -- misma
 * familia que la deriva de T-016. Sin ese test, cambiar el tamano de un sobre
 * en la migracion haria desaparecer sets legitimos del catalogo sin un error.
 */
export const CARTAS_POR_SOBRE: Record<GameCode, number> = {
  MTG: 14,
  YGO: 9,
  PTCG: 10,
};

/**
 * Patrones de nombre de productos que NO son de sobres (T-069).
 *
 * SON HEURISTICA, y por eso todo lo que descartan sale en
 * `npm run packs:cobertura`. Un patron demasiado ancho quitaria un set de
 * sobres real del catalogo, y eso es peor que el problema que arregla: por eso
 * se ven, en vez de perderse.
 *
 * Se han elegido contra los 1032 nombres reales de Yu-Gi-Oh! del catalogo, no
 * de memoria. Los casos que hay que dejar pasar son los que se parecen: `Duelist
 * Pack` y `Turbo Pack` SI son sobres, `Duelist League ... participation cards`
 * no; `OTS Tournament Pack` es un producto de sobres promocional y se deja.
 */
const NO_ES_SOBRE: ReadonlyArray<{ patron: RegExp; que: string }> = [
  { patron: /\bStructure Deck\b/i, que: 'Structure Deck' },
  { patron: /\bStarter Decks?\b/i, que: 'Starter Deck' },
  { patron: /\bDemo Deck\b/i, que: 'Demo Deck' },
  // "Legendary Arc-V Decks", "Legendary Hero Decks": cajas de mazos.
  { patron: /\bDecks\b/i, que: 'caja de mazos' },
  { patron: /promotional cards?\b/i, que: 'promocional' },
  // `Scarlet & Violet Black Star Promos`, `Magic Online Promos`, `War of the
  // Spark Promos`. Son 173 sets del catalogo y NINGUNO es un producto de
  // sobres: son la bolsa de promocionales de su bloque. `promotional cards` no
  // los cazaba, y colarse cuesta caro -- PR-SV son 200 impresiones, todas de
  // rareza `promo`, que ninguna plantilla nombra ni debe nombrar.
  { patron: /\bPromos\b/i, que: 'bolsa de promocionales' },
  { patron: /\bPrize Card\b/i, que: 'carta de premio' },
  { patron: /\bparticipation cards?\b/i, que: 'carta de participacion' },
  { patron: /\bParticipation Card\b/i, que: 'carta de participacion' },
  { patron: /\bCollector Box\b/i, que: 'caja de coleccionista' },
  { patron: /\bGift Box\b/i, que: 'caja regalo' },
  { patron: /\bValue Box\b/i, que: 'caja' },
  // Pokemon: `Lost Origin Trainer Gallery`, `Crown Zenith Galarian Gallery`.
  // No son productos: son el SUBCONJUNTO de galeria de su set padre, y sus
  // cartas salen en los sobres del padre. Se ingestan como set aparte y sin ni
  // una comun, asi que ni la aritmetica ni la fecha los cazan. El patron exige
  // las dos palabras para no llevarse por delante al padre (`Crown Zenith`).
  { patron: /\b(Trainer|Galarian) Gallery\b/i, que: 'galeria de un set padre' },
  // Misma figura: `Hidden Fates Shiny Vault` y `Shining Fates Shiny Vault` son
  // sets aparte -- con el MISMO codigo que su padre -- cuyas cartas salen en los
  // sobres del padre. Medido: la boveda de Hidden Fates son 94 impresiones de
  // las que 80 son shiny, y su techo era del 14,9%.
  { patron: /\bShiny Vault\b/i, que: 'boveda shiny de un set padre' },
];

/**
 * UN PATRON QUE NO SE ANADE, Y POR QUE.
 *
 * `Tin` parece obvio -- los tins de Yu-Gi-Oh! son latas de coleccionista, no
 * sobres -- y habria sido un error. Medido sobre los 50 sets del catalogo con
 * "Tin" en el nombre:
 *
 *   2025 Mega-Pack Tin                    450 cartas
 *   25th Anniversary Tin: Dueling Mirrors 398 cartas
 *   2014 Mega-Tin Mega Pack               247 cartas
 *
 * Los Mega Pack que vienen dentro de un tin SI son sobres sellados con su
 * distribucion de rareza. El patron habria quitado del catalogo mas contenido
 * real del que arregla. Los tins pequenos (9-15 cartas, las promocionales de la
 * lata) se cuelan, y es un mal menor asumido: producen un "sobre" tonto, no una
 * perdida.
 */

export interface SetAClasificar {
  game: GameCode;
  name: string;
  /** Cartas que el origen declara. 0 o negativo = no lo declara. */
  cardCount: number;
  /** `YYYY-MM-DD`, o nulo si el origen no la da. */
  releasedAt: string | null;
}

export interface Clasificacion {
  abrible: boolean;
  /** Por que no lo es. Vacio cuando si lo es. */
  motivo?: string;
}

/**
 * Decide si un set se puede abrir en sobres (T-069/T-067, corrige P-033).
 *
 * Tres reglas, y solo la segunda es heuristica:
 *
 *  1. ARITMETICA. Un set que declara menos cartas de las que lleva un sobre de
 *     su juego no puede ser un producto de sobres. Sobre el catalogo entero son
 *     937 de 2254 sets: 520 de Yu-Gi-Oh! y 417 de Magic.
 *  2. NOMBRE. Los patrones de arriba. Aqui si hay juicio, y por eso lo que
 *     descartan se publica en el informe de cobertura.
 *  3. FECHA DE SALIDA (T-067). Un set que aun no ha salido tiene la lista de
 *     cartas a medias, y eso NO se ve mirando su composicion: parece un
 *     producto raro. `Magnificent Maestros` sale dentro de 78 dias, el origen
 *     declara 24 cartas y el catalogo tiene 66 impresiones -- 24 ultra, 24
 *     starlight y 18 grand master, porque solo se han revelado los tratamientos
 *     premium. Abrirlo entrega 8,98 ultra rare por sobre, medido. No hay
 *     plantilla que arregle eso: faltan las cartas, no las probabilidades.
 *
 * ANTE LA DUDA, ABRIBLE. Un origen que no declara `cardCount` no descarta nada.
 * Equivocarse hacia "abrible" deja las cosas como estaban; equivocarse hacia
 * "no abrible" hace desaparecer contenido real sin que nadie se entere, y este
 * proyecto ya sabe lo que cuesta un fallo que no dice nada.
 */
export function clasificarSet(set: SetAClasificar, hoy: string): Clasificacion {
  for (const { patron, que } of NO_ES_SOBRE) {
    if (patron.test(set.name)) return { abrible: false, motivo: `nombre de ${que}` };
  }

  // Comparacion de cadenas `YYYY-MM-DD`, que ordena igual que las fechas y no
  // arrastra husos horarios: `new Date()` sobre una fecha suelta la interpreta
  // en UTC y el resultado cambia segun donde corra el proceso.
  if (set.releasedAt && set.releasedAt > hoy) {
    return { abrible: false, motivo: `no sale hasta el ${set.releasedAt}` };
  }

  const minimo = CARTAS_POR_SOBRE[set.game];
  if (set.cardCount > 0 && set.cardCount < minimo) {
    return {
      abrible: false,
      motivo: `declara ${set.cardCount} cartas y un sobre de ${set.game} lleva ${minimo}`,
    };
  }

  return { abrible: true };
}
