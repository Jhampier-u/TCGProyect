import type { IngestWarningSink } from '@tcg/shared';
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
      const card = this.#resolveSlot(slot, pool, tiers, rng, setId);
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

  #resolveSlot(
    slot: SlotConfig,
    pool: SetPool,
    tiers: Map<string, number>,
    rng: Rng,
    setId: number,
  ): OpenedCard | null {
    // 1. Rareza PEDIDA por el slot.
    const pedida = pickWeighted(
      slot.distribution.map((d) => ({ item: d.rarity, weight: d.weight })),
      rng,
    );

    // La rareza ENTREGADA puede no ser la pedida: si el set no tiene esa rareza,
    // el respaldo entrega otra. Se devuelven ambas porque registrar la pedida
    // seria mentir sobre la carta.
    const { rarityCode, entries } = this.#poolFor(pedida, slot, pool, tiers, setId);

    // 2. Impresion. Se consume el valor SIEMPRE, incluso si no hay candidatos,
    //    para no desalinear el flujo del generador.
    const indice = pickIndex(Math.max(1, entries.length), rng);

    // 3. Acabado.
    const esFoil = rng() < slot.foilChance;

    if (entries.length === 0) return null;

    const entry = entries[Math.min(indice, entries.length - 1)]!;
    return {
      slotIndex: slot.slotIndex,
      printId: entry.printId,
      // La rareza REAL de la impresion entregada, no la que pedia el slot.
      // Si se registrara la pedida, `open()` diria 'rare' para una carta que es
      // 'common', y `replay()` -- que lee la rareza de `card_prints` -- diria
      // 'common'. Las dos vias tienen que coincidir o RN-01 no significa nada.
      rarityCode,
      finish: esFoil ? 'foil' : 'nonfoil',
      isNew: false, // se calcula despues, con la coleccion delante
    };
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

    const alternativas = [...slot.distribution]
      .filter((d) => d.rarity !== pedida)
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
