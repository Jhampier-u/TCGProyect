import type { GameCode, IngestWarningSink } from '@tcg/shared';
import { generateSeed, pickIndex, pickWeighted, rngFromSeed, type Rng } from './prng.js';
import type {
  OpenedCard,
  PackOpening,
  PackRepository,
  PoolEntry,
  SetPool,
  SlotConfig,
  TemplateConfig,
} from './types.js';

export interface PackServiceOptions {
  repository: PackRepository;
  onWarning?: IngestWarningSink;
  /** Inyectable para tests. Por defecto, semilla criptografica. */
  seedFactory?: () => string;
}

export class EmptyPoolError extends Error {
  constructor(readonly setId: number) {
    super(`El set ${setId} no tiene ninguna impresion elegible para sobres (in_boosters = 1)`);
    this.name = 'EmptyPoolError';
  }
}

export class NoTemplateError extends Error {
  constructor(readonly setId: number) {
    super(`El set ${setId} no tiene plantilla de sobre ni existe una por defecto para su juego`);
    this.name = 'NoTemplateError';
  }
}

/**
 * Ese usuario ya tiene una apertura con esa semilla.
 *
 * El esquema tiene `UNIQUE (user_id, seed)` en `pack_openings` como guarda de
 * idempotencia: si un cliente reintenta la misma peticion, no se registran dos
 * aperturas. Se traduce a un error de dominio para que la capa HTTP pueda
 * devolver un 409 en vez de dejar escapar un error del driver de MySQL.
 */
export class DuplicateSeedError extends Error {
  constructor(readonly seed: string) {
    super(`Ya existe una apertura de este usuario con la semilla ${seed}`);
    this.name = 'DuplicateSeedError';
  }
}

/**
 * Motor de apertura de sobres. Implementa el hito H4 sobre ADR-005.
 *
 * NO CONTIENE NI UNA REGLA DE NINGUN JUEGO. Lee `pack_templates`/`pack_slots` y
 * resuelve pesos. Afinar la fidelidad de un sobre de Magic es un UPDATE en la
 * base de datos, no un despliegue.
 *
 * ORDEN DE CONSUMO DEL PRNG. Es parte del contrato de reproducibilidad y no
 * puede cambiarse sin invalidar todas las aperturas anteriores. Por cada slot,
 * en orden de `slot_index`:
 *   1. una llamada para elegir la rareza,
 *   2. una llamada para elegir la impresion dentro de esa rareza,
 *   3. una llamada para decidir el acabado foil.
 * Siempre las tres, aunque `foil_chance` sea 0: saltarse la tercera cuando no
 * hace falta desalinearia el flujo y haria que dos sobres con la misma semilla
 * divergieran segun la plantilla.
 */
/**
 * Una impresion candidata CON la rareza que se registrara si sale elegida.
 *
 * Van juntas porque un grupo de candidatos puede mezclar rarezas -- ocurre en
 * cuanto la carta viene de otro set (T-085) -- y separarlas fue exactamente el
 * fallo que la prueba de reparto uniforme destapo: se entregaba una carta y se
 * apuntaba la rareza de otra.
 */
interface Candidato {
  entry: PoolEntry;
  rarityCode: string;
}

/** Un grupo de candidatos que comparten rareza, que es el caso de siempre. */
function conRareza(grupo: { rarityCode: string; entries: PoolEntry[] }): Candidato[] {
  return grupo.entries.map((entry) => ({ entry, rarityCode: grupo.rarityCode }));
}

export class PackService {
  readonly #repo: PackRepository;
  readonly #warn: IngestWarningSink;
  readonly #seedFactory: () => string;

  constructor(options: PackServiceOptions) {
    this.#repo = options.repository;
    this.#warn = options.onWarning ?? (() => {});
    this.#seedFactory = options.seedFactory ?? generateSeed;
  }

  /**
   * Abre un sobre del set indicado.
   *
   * @param seed Semilla explicita. Sirve para reproducir un resultado en tests;
   *             en produccion se genera una nueva en cada apertura.
   */
  async open(userId: number, setId: number, seed?: string): Promise<PackOpening> {
    const template = await this.#repo.findTemplate(setId);
    if (!template) throw new NoTemplateError(setId);

    const pool = await this.#repo.loadPool(setId);
    if (pool.size === 0) throw new EmptyPoolError(setId);

    const tiers = await this.#repo.rarityTiers(template.game);
    const semilla = seed ?? this.#seedFactory();
    const rng = rngFromSeed(semilla);

    const cards: OpenedCard[] = [];
    for (const slot of [...template.slots].sort((a, b) => a.slotIndex - b.slotIndex)) {
      // Secuencial a proposito: el PRNG es un flujo y paralelizar
      // los slots entregaria cartas distintas en cada ejecucion.
      // eslint-disable-next-line no-await-in-loop
      const card = await this.#resolveSlot(slot, pool, tiers, rng, setId, template.game);
      if (card) cards.push(card);
    }

    // El "es nueva" se calcula ANTES de persistir: despues, la propia apertura
    // ya habria incrementado la coleccion y todas parecerian repetidas.
    const owned = await this.#repo.ownedQuantities(
      userId,
      cards.map((c) => c.printId),
    );
    for (const card of cards) {
      card.isNew = (owned.get(`${card.printId}:${card.finish}`) ?? 0) === 0;
      // Dos copias de la misma carta en el MISMO sobre: solo la primera es nueva.
      owned.set(`${card.printId}:${card.finish}`, 1);
    }

    const openingId = await this.#repo.persistOpening({
      userId,
      templateId: template.templateId,
      setId,
      seed: semilla,
      templateSnapshot: template,
      cards,
    });

    return {
      openingId,
      seed: semilla,
      templateId: template.templateId,
      setId,
      openedAt: new Date().toISOString(),
      cards,
    };
  }

  /**
   * Reproduce una apertura ya realizada.
   *
   * LEE LO PERSISTIDO. No vuelve a ejecutar el PRNG, y eso es deliberado: la
   * salida del generador depende de `pack_slots`, que es editable a proposito.
   * Si alguien ajusta la distribucion de un sobre, reproducir por semilla
   * devolveria cartas distintas y RN-01 se rompería en silencio (P-005).
   *
   * La semilla queda como prueba de auditoria, no como mecanismo de reproduccion.
   */
  async replay(openingId: number, userId: number): Promise<PackOpening | null> {
    return this.#repo.findOpening(openingId, userId);
  }

  // ------------------------------------------------------------------

  /**
   * TRES VALORES DEL PRNG POR SLOT, SIEMPRE: entrada, impresion y acabado.
   *
   * Es la invariante que hace reproducible una apertura, y ninguna de las dos
   * cosas que T-085 anade puede romperla. Una entrada de otro set consume los
   * mismos tres que una normal, y un filtro de tipo que no deja candidatos
   * tampoco cambia la cuenta: se elige igual y se descarta despues.
   */
  async #resolveSlot(
    slot: SlotConfig,
    pool: SetPool,
    tiers: Map<string, number>,
    rng: Rng,
    setId: number,
    game: GameCode,
  ): Promise<OpenedCard | null> {
    // 1. Entrada del slot. Puede pedir una rareza de ESTE set o una carta de
    //    OTRO, y el peso decide igual en los dos casos.
    const entrada = pickWeighted(
      slot.distribution.map((d) => ({ item: d, weight: d.weight })),
      rng,
    );

    // La rareza ENTREGADA puede no ser la pedida: si el set no tiene esa rareza,
    // el respaldo entrega otra. Se devuelven ambas porque registrar la pedida
    // seria mentir sobre la carta.
    //
    // CADA CANDIDATO LLEVA SU PROPIA RAREZA, y no es un detalle: dentro de un
    // set ajeno conviven rarezas distintas -- The List tiene 2112 comunes y 4
    // `special` -- asi que una sola rareza para todo el grupo registraria una
    // carta con la rareza de otra, y `replay()`, que la lee de `card_prints`,
    // diria algo distinto. Es la misma exigencia de RN-01 de siempre.
    const candidatos = entrada.set
      ? await this.#poolDeOtroSet(entrada.set, slot, pool, tiers, setId, game)
      : conRareza(this.#poolFor(entrada.rarity ?? '', slot, pool, tiers, setId));

    // El filtro de tipo se aplica DESPUES de resolver la rareza y ANTES de
    // elegir: si no deja a nadie, se abre la mano al pool sin filtrar en vez de
    // devolver un hueco. 58 de los 135 sets de Magic con slot de tierra no traen
    // tierras basicas en el sobre, y un slot vacio ahi seria un sobre con una
    // carta menos.
    const finalistas = this.#filtrar(candidatos, slot, setId);

    // 2. Impresion. Se consume el valor SIEMPRE, incluso si no hay candidatos,
    //    para no desalinear el flujo del generador.
    const indice = pickIndex(Math.max(1, finalistas.length), rng);

    // 3. Acabado.
    const esFoil = rng() < slot.foilChance;

    if (finalistas.length === 0) return null;

    const elegido = finalistas[Math.min(indice, finalistas.length - 1)]!;
    return {
      slotIndex: slot.slotIndex,
      printId: elegido.entry.printId,
      // La rareza REAL de la impresion entregada, no la que pedia el slot.
      // Si se registrara la pedida, `open()` diria 'rare' para una carta que es
      // 'common', y `replay()` -- que lee la rareza de `card_prints` -- diria
      // 'common'. Las dos vias tienen que coincidir o RN-01 no significa nada.
      rarityCode: elegido.rarityCode,
      finish: esFoil ? 'foil' : 'nonfoil',
      isNew: false, // se calcula despues, con la coleccion delante
    };
  }

  /**
   * Deja solo los candidatos que cumplen el filtro de tipo del slot (T-085).
   *
   * SIN FILTRO, DEVUELVE LO QUE LE DAN. Y si el filtro no deja a nadie tambien:
   * un set sin tierras basicas en el sobre -- 58 de los 135 de Magic que tienen
   * slot de tierra -- lo tendria vacio, y eso es un sobre con catorce cartas en
   * vez de quince. Se avisa y se entrega una comun cualquiera, que es
   * exactamente lo que este slot hacia antes de que el filtro existiera.
   */
  #filtrar(candidatos: Candidato[], slot: SlotConfig, setId: number): Candidato[] {
    if (!slot.cardFilter) return candidatos;

    const cumplen = candidatos.filter((c) => c.entry.basicLand);
    if (cumplen.length > 0) return cumplen;

    this.#warn({
      game: 'MTG',
      subject: `set:${setId}`,
      code: 'malformed_field',
      message:
        `El set no tiene tierras basicas en el sobre; la slot ${slot.slotIndex} ` +
        'entrega una comun sin filtrar',
    });
    return candidatos;
  }

  /**
   * Pool de OTRO set, para una entrada que saca la carta de fuera (T-085).
   *
   * Es The List de Magic: uno de cada ocho Play Booster trae en su septimo
   * carton una carta de un set aparte. El motor solo sabia elegir dentro del
   * pool del set abierto, y por eso este 12,5% no era modelable (P-008.1).
   *
   * SE CARGA AQUI Y NO AL ABRIR, y es la razon de que este metodo sea `async`:
   * traer 5584 filas en CADA apertura para usarlas una de cada ocho veces seria
   * pagar el coste ocho veces de mas. El PRNG no se entera -- la entrada ya
   * esta elegida cuando se llega aqui.
   *
   * LA RAREZA QUE SE REGISTRA ES LA REAL DE LA CARTA, la del set de origen. Es
   * lo mismo que ya hacia `#poolFor`, y por el mismo motivo: `replay()` lee la
   * rareza de `card_prints`, asi que registrar cualquier otra cosa haria que las
   * dos vias discreparan y RN-01 dejara de significar nada.
   */
  async #poolDeOtroSet(
    code: string,
    slot: SlotConfig,
    pool: SetPool,
    tiers: Map<string, number>,
    setId: number,
    game: GameCode,
  ): Promise<Candidato[]> {
    const ajeno = await this.#repo.loadPoolByCode(game, code);
    const todas = ajeno ? [...ajeno.entries()].filter(([, e]) => e.length > 0) : [];

    if (todas.length === 0) {
      // El set de origen no existe o no tiene pool. Se cae a la entrada de mas
      // peso del propio slot, igual que hace el respaldo de rareza vacia.
      this.#warn({
        game,
        subject: `set:${setId}`,
        code: 'malformed_field',
        message: `La slot ${slot.slotIndex} saca de '${code}', que no tiene impresiones; se entrega del propio set`,
      });
      const mayor = [...slot.distribution]
        .filter((d) => d.rarity)
        .sort((a, b) => b.weight - a.weight)[0];
      return conRareza(this.#poolFor(mayor?.rarity ?? '', slot, pool, tiers, setId));
    }

    // Uniforme sobre TODAS las impresiones del set de origen, no sobre sus
    // rarezas: The List no publica una distribucion por rareza, y repartir a
    // partes iguales entre rarezas dispares -- 2112 comunes frente a 4
    // `special` -- inventaria una escasez que no existe.
    return todas.flatMap(([rarityCode, es]) => es.map((entry) => ({ entry, rarityCode })));
  }

  /**
   * Pool de la rareza elegida, con respaldo cuando esta vacio.
   *
   * NO ES UN CASO RARO. Muchos sets no tienen ninguna carta de las rarezas mas
   * altas: un set sin miticas existe, y la plantilla por defecto del juego sigue
   * pidiendo una mitica el 14% de las veces. Sin respaldo, ese sobre saldria con
   * una carta menos.
   *
   * Cadena de respaldo, en este orden:
   *   1. Las demas rarezas del propio slot, de mayor a menor peso. Es lo que mas
   *      se parece a lo que hace el producto real.
   *   2. Cualquier rareza presente en el set, de menos a mas escasa. Regalar una
   *      comun es mejor que dejar el hueco vacio.
   */
  #poolFor(
    pedida: string,
    slot: SlotConfig,
    pool: SetPool,
    tiers: Map<string, number>,
    setId: number,
  ): { rarityCode: string; entries: PoolEntry[] } {
    const directo = pool.get(pedida);
    if (directo && directo.length > 0) return { rarityCode: pedida, entries: directo };

    // Las entradas de OTRO set no valen como alternativa (T-085): la carta que
    // entregarian no esta en este pool, y el respaldo existe justamente para
    // rellenar con algo que el set SI tiene.
    const alternativas = [...slot.distribution]
      .filter((d): d is { rarity: string; weight: number } => !!d.rarity && d.rarity !== pedida)
      .sort((a, b) => b.weight - a.weight);

    for (const alt of alternativas) {
      const candidatos = pool.get(alt.rarity);
      if (candidatos && candidatos.length > 0) {
        this.#warn({
          game: 'MTG', // el juego real lo pone quien consume el aviso
          subject: `set:${setId}`,
          code: 'malformed_field',
          message: `El set no tiene impresiones de '${pedida}'; se entrega '${alt.rarity}' del mismo slot`,
        });
        return { rarityCode: alt.rarity, entries: candidatos };
      }
    }

    const porTier = [...pool.entries()]
      .filter(([, entries]) => entries.length > 0)
      .sort(([a], [b]) => (tiers.get(a) ?? 99) - (tiers.get(b) ?? 99));

    if (porTier.length > 0) {
      const [codigo, candidatos] = porTier[0]!;
      this.#warn({
        game: 'MTG',
        subject: `set:${setId}`,
        code: 'malformed_field',
        message: `El set no tiene ninguna rareza del slot; se entrega '${codigo}'`,
      });
      return { rarityCode: codigo, entries: candidatos };
    }

    return { rarityCode: pedida, entries: [] };
  }
}
