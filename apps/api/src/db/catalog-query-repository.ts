import type { FacetKey, FacetValues, GameCode, RowFacets, RowField } from '@tcg/shared';
import { FACET_PROFILES, GAME_IDS, ROW_FIELD_KIND, facetOf, isGameCode, rowFieldsOf } from '@tcg/shared';
import {
  COLUMNAS_DE_FILA, FACET_SQL, condicionDeFaceta, repartir, type FacetCount, type FilaDeRecuento,
} from './facetas-sql.js';
import type { Database } from './connection.js';
import { SIN_CACHE, type CacheDeRecuentos } from './cache-de-facetas.js';
import type { Paleta } from '../images/paleta.js';
import { ORDEN_DE_PLANTILLA, PLANTILLA_DE_EPOCA_O_LINEA, artKeyDe } from './plantilla-sql.js';

/**
 * Longitud minima para usar busqueda FULLTEXT.
 *
 * InnoDB ignora por defecto los tokens de menos de 3 caracteres
 * (`innodb_ft_min_token_size = 3`), asi que un MATCH con "ra" no devolveria
 * nada. Por debajo de ese umbral se cae a un LIKE por prefijo, que para dos
 * letras es ademas lo que el usuario espera mientras teclea.
 */
export const MIN_FULLTEXT_LENGTH = 3;

/**
 * "Esta impresion la tiene este usuario", con cualquier acabado (T-093).
 *
 * Una sola condicion para las dos preguntas -- las que tengo y las que me
 * faltan -- y para los recuentos del rail, para que no puedan discrepar. Se
 * apoya en `uq_collection_entry (user_id, card_print_id, finish)`, cuyo prefijo
 * es exactamente este par. `quantity > 0` porque una fila a cero existe tras
 * vaciar una entrada y no es tenerla.
 */
const TENENCIA =
  'EXISTS (SELECT 1 FROM user_collection uc WHERE uc.user_id = ? AND uc.card_print_id = p.id AND uc.quantity > 0)';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 40;

export interface CardSummary {
  /**
   * Id de la CARTA, no de la impresion. Se llama `cardId` y no `id` porque
   * conviven los dos en la misma respuesta y `id` a secas es ambiguo — y sobre
   * todo porque es el nombre que declara el esquema de la API: si no coinciden,
   * Fastify descarta el campo sin decir nada (P-024).
   */
  cardId: number;
  /**
   * Identidad de la carta en su origen: `oracle_id` en Magic, passcode en
   * Yu-Gi-Oh!, `set-numero` en Pokemon. El cliente la necesita para exportar
   * un `.ydk`, cuyo contenido son passcodes (T-048).
   */
  oracleKey: string;
  game: GameCode;
  name: string;
  typeLine: string | null;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  /** Ruta LOCAL. Nunca una URL externa (P-001). */
  imagePath: string | null;
  printId: number;
  /**
   * Los datos que pintan las celdas de la fila de SU juego (H9f): PS, tipo y
   * marca en Pokemon; coste, tipo y F/R en Magic; atributo, nivel, ATK/DEF en
   * Yu-Gi-Oh!. Salen del perfil (`rowFieldsOf`), y el esquema de la API declara
   * la union de los tres: la prueba de P-024 compara las dos cosas.
   */
  facetas: RowFacets;
  /**
   * Si quien mira tiene esta impresion (T-093). `null` cuando nadie mira -- sin
   * sesion, o en la ficha --, que no es lo mismo que `false`: "no lo se" no
   * puede pintarse como "no la tienes".
   */
  owned: boolean | null;
}

export interface CardDetail extends CardSummary {
  rulesText: string | null;
  gameData: Record<string, unknown>;
  releasedAt: string | null;
  finishes: string[];
  inBoosters: boolean;
}

export interface CardQuery {
  game?: GameCode;
  set?: string;
  rarity?: string;
  q?: string;
  /**
   * Facetas del perfil del juego (H9f): clave -> valor. Exigen `game`. Una clave
   * que no es del juego no llega aqui -- el servidor contesta 400 --, y si
   * llegara el repositorio lanza en vez de ignorarla.
   */
  facetas?: FacetValues;
  /**
   * Tener o no tener la impresion, contra la coleccion de UN usuario (T-093).
   * El `userId` lo pone la ruta a partir del token, nunca la query: si viniera
   * de fuera, cualquiera podria mirar la coleccion de otro.
   */
  owner?: { userId: number; owned: boolean };
  /** Quien mira, si hay sesion: cada fila dira si la tiene (T-093). */
  viewerId?: number;
  /** Cursor opaco de paginacion keyset. */
  cursor?: string;
  limit?: number;
}

export interface CardPage {
  items: CardSummary[];
  /** Cursor para la siguiente pagina, o null si no hay mas. */
  nextCursor: string | null;
}

export type { FacetCount } from './facetas-sql.js';

export interface FacetCounts {
  /** Una lista por faceta del perfil, en el orden del perfil. */
  facetas: Partial<Record<FacetKey, FacetCount[]>>;
  rarities: FacetCount[];
  /** Impresiones del contexto -- el set, o el juego entero -- y cuantas tiene. */
  total: number;
  ownedTotal: number | null;
}

/** Una epoca de sobre, tal como la describe su plantilla (T-090). */
export interface EraSummary {
  name: string;
  /** `YYYY-MM-DD`, o null si no tiene limite por ese lado. */
  from: string | null;
  to: string | null;
  /** La epoca vigente: la que recoge lo que ninguna ventana cubre. */
  isDefault: boolean;
}

export type { Paleta } from '../images/paleta.js';

/** `listSets` es su unico productor: un campo nuevo solo necesita esa consulta (P-024/T-092). */
export interface SetSummary {
  /**
   * Id numerico. Se expone porque `POST /api/packs/open` lo necesita y es lo
   * unico que identifica un set de forma global: `externalId` solo es unico
   * DENTRO de un juego. Sin esto, el frontend no puede enlazar el selector de
   * set con la apertura de sobres.
   */
  id: number;
  externalId: string;
  code: string;
  name: string;
  releasedAt: string | null;
  cardCount: number;
  /**
   * URL del ORIGEN. NO sale de aqui: exponerla es hotlinking y en S016 se
   * filtraron 1032 (P-022). Se conserva en el tipo porque la ingesta la usa.
   */
  iconUrl: string | null;
  /** Ruta LOCAL del icono ya cosechado (T-035). Es la unica que se sirve. */
  iconPath: string | null;
  /** Impresiones que pueden salir en sobre. 0 significa que no se puede abrir. */
  poolSize: number;
  /** Dos colores para tenir el sobre (0028). Null hasta `npm run sobres:paleta`. */
  palette: Paleta | null;
  /** La plantilla de epoca o linea, como clave de fichero de arte (H9e). */
  artKey: string | null;
}

/**
 * Consultas de lectura del catalogo (H3).
 *
 * Separada de `CatalogRepository`, que es de escritura: la ingesta y la API
 * tienen patrones de acceso opuestos y mezclarlas complicaria las dos.
 */
export class CatalogQueryRepository {
  /**
   * `recuentosBase` cachea los recuentos del rail que no dependen del usuario
   * (ver `cache-de-facetas.ts`). Por defecto no cachea: los tests y los CLI
   * ven siempre la base tal cual, y solo la API lo enchufa.
   */
  constructor(
    private readonly db: Database,
    private readonly recuentosBase: CacheDeRecuentos = SIN_CACHE,
  ) {}

  async listGames(): Promise<Array<{ code: string; name: string }>> {
    return this.db.select(`SELECT code, name FROM games ORDER BY id`);
  }

  async listSets(game: GameCode): Promise<SetSummary[]> {
    const rows = await this.db.select<{
      id: number; external_id: string; code: string; name: string; released_at: string | null;
      card_count: number; is_openable: number; icon_url: string | null; icon_local_path: string | null;
      pool_size: number; palette: unknown; plantilla: string | null;
    }>(
      `SELECT s.id, s.external_id, s.code, s.name, s.released_at, s.card_count, s.is_openable, s.icon_url,
              s.icon_local_path,
              s.palette,
              (SELECT t2.name FROM pack_templates t2
                WHERE t2.game_id = s.game_id AND ${PLANTILLA_DE_EPOCA_O_LINEA('t2', 's')}
                ORDER BY ${ORDEN_DE_PLANTILLA('t2', 's')}
                LIMIT 1) AS plantilla,
              COUNT(p.id) AS pool_size
       FROM sets s
       LEFT JOIN card_prints p ON p.set_id = s.id AND p.in_boosters = 1 AND p.withdrawn_at IS NULL
       WHERE s.game_id = ?
       GROUP BY s.id
       ORDER BY s.released_at DESC, s.id DESC`,
      [GAME_IDS[game]],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      externalId: r.external_id,
      code: r.code,
      name: r.name,
      releasedAt: r.released_at,
      cardCount: Number(r.card_count),
      isOpenable: Number(r.is_openable) === 1,
      iconUrl: r.icon_url,
      iconPath: r.icon_local_path,
      poolSize: Number(r.pool_size),
      palette: paletaValida(parseJson(r.palette, null)),
      artKey: r.plantilla ? artKeyDe(r.plantilla) || null : null,
    }));
  }

  /**
   * Busqueda paginada por KEYSET, no por OFFSET.
   *
   * Con `LIMIT ? OFFSET ?`, pedir la pagina 500 obliga a MySQL a leer y descartar
   * 20.000 filas. Sobre 116.752 impresiones de Magic eso degrada hasta ser
   * inusable. El keyset usa la ultima clave vista como punto de corte, asi que
   * la pagina 500 cuesta lo mismo que la primera.
   *
   * EL DESEMPATE ES `card_prints.id`, NO `cards.id`.
   *
   * Cada fila del resultado es una IMPRESION, y varias impresiones comparten la
   * misma carta conceptual: en Yu-Gi-Oh! la misma carta sale en dos rarezas
   * dentro del mismo set (P-013). Con `cards.id` como desempate, el cursor
   * `(name, cards.id)` no identifica una fila sino un grupo, y al pedir "lo que
   * va despues" se salta el resto de impresiones de esa carta.
   *
   * Medido antes de corregirlo: 723 de 733 impresiones devueltas. **Diez filas
   * desaparecidas del catalogo, en silencio.** Con `card_prints.id` el par es
   * unico por fila y la cobertura es completa.
   */
  async searchCards(query: CardQuery): Promise<CardPage> {
    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const where: string[] = [];
    const params: unknown[] = [];

    if (query.game) {
      where.push('c.game_id = ?');
      params.push(GAME_IDS[query.game]);
    }
    if (query.set) {
      where.push('s.external_id = ?');
      params.push(query.set);
    }
    if (query.rarity) {
      where.push('r.code = ?');
      params.push(query.rarity);
    }
    for (const [clave, valor] of Object.entries(query.facetas ?? {})) {
      if (valor === undefined || valor === '') continue;
      const def = query.game ? facetOf(query.game, clave) : undefined;
      if (!def) {
        // El servidor ya contesta 400 a esto. Si llega, es un fallo de codigo
        // propio, y una condicion inventada lo esconderia.
        throw new Error(`La faceta "${clave}" no es de ${query.game ?? 'ningun juego indicado'}`);
      }
      const condicion = condicionDeFaceta(def, valor);
      where.push(condicion.sql);
      params.push(...condicion.params);
    }
    if (query.owner) {
      where.push(query.owner.owned ? TENENCIA : `NOT ${TENENCIA}`);
      params.push(query.owner.userId);
    }

    const texto = (query.q ?? '').trim();
    if (texto.length >= MIN_FULLTEXT_LENGTH) {
      where.push('MATCH(c.name, c.rules_text) AGAINST(? IN BOOLEAN MODE)');
      params.push(toBooleanQuery(texto));
    } else if (texto.length > 0) {
      where.push('c.name LIKE ?');
      params.push(`${escapeLike(texto)}%`);
    }

    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      // El par (name, id) es la clave de orden: se pide estrictamente lo que va
      // despues del ultimo elemento visto.
      where.push('(c.name > ? OR (c.name = ? AND p.id > ?))');
      params.push(cursor.name, cursor.name, cursor.id);
    }

    // La tenencia de cada fila, si alguien mira. Su `?` esta en el SELECT, asi
    // que su valor va DELANTE de los del WHERE.
    const mira = query.viewerId !== undefined;
    const columnaTengo = mira ? `,
              ${TENENCIA} AS tengo` : '';
    if (mira) params.unshift(query.viewerId);

    // Se piden `limit + 1` filas: si llega la extra, hay pagina siguiente. Evita
    // un COUNT(*) aparte, que sobre un catalogo grande cuesta tanto como la
    // propia consulta.
    const rows = await this.db.select<CardRow>(
      `SELECT c.id, c.oracle_key, c.game_id, c.name, c.type_line,
              s.code AS set_code, s.name AS set_name,
              p.id AS print_id, p.collector_number, p.image_local_path,
              r.code AS rarity,
              ${COLUMNAS_DE_FILA}${columnaTengo}
       FROM cards c
       JOIN card_prints p ON p.card_id = c.id AND p.withdrawn_at IS NULL
       JOIN sets s ON s.id = p.set_id
       JOIN rarities r ON r.id = p.rarity_id
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY c.name ASC, p.id ASC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const hayMas = rows.length > limit;
    const visibles = hayMas ? rows.slice(0, limit) : rows;
    const ultimo = visibles[visibles.length - 1];

    return {
      items: visibles.map(toSummary),
      // El cursor lleva el id de la IMPRESION, que es lo unico unico por fila.
      nextCursor: hayMas && ultimo ? encodeCursor(ultimo.name, Number(ultimo.print_id)) : null,
    };
  }

  /**
   * Detalle de UNA impresion, por su id.
   *
   * NO filtra por `withdrawn_at`, y es deliberado (T-083). La busqueda de arriba
   * si lo hace: el catalogo navegable es lo que el origen ofrece hoy, y una
   * impresion retirada ya no lo es. Pero aqui se llega desde una coleccion o
   * desde una apertura, y esas si contienen retiradas -- por eso no se borran
   * (P-005). Ocultarla aqui convertiria en 404 la ficha de una carta que el
   * usuario tiene delante.
   */
  async findCard(printId: number): Promise<CardDetail | null> {
    const rows = await this.db.select<CardRow & {
      rules_text: string | null; game_data: unknown; released_at: string | null;
      finishes: unknown; in_boosters: number;
    }>(
      `SELECT c.id, c.oracle_key, c.game_id, c.name, c.type_line, c.rules_text, c.game_data,
              s.code AS set_code, s.name AS set_name, s.released_at,
              p.id AS print_id, p.collector_number, p.image_local_path,
              p.finishes, p.in_boosters,
              r.code AS rarity,
              -- Las mismas facetas que la busqueda: las dos consultas comparten
              -- el mismo mapeador, asi que omitirlas aqui no da un campo vacio
              -- sino NaN, que el esquema rechaza y convierte la ficha en un 500.
              -- Paso exactamente eso al declararlas en T-092.
              ${COLUMNAS_DE_FILA}
       FROM card_prints p
       JOIN cards c ON c.id = p.card_id
       JOIN sets s ON s.id = p.set_id
       JOIN rarities r ON r.id = p.rarity_id
       WHERE p.id = ?`,
      [printId],
    );
    const row = rows[0];
    if (!row) return null;

    return {
      ...toSummary(row),
      rulesText: row.rules_text,
      gameData: parseJson(row.game_data, {}) as Record<string, unknown>,
      releasedAt: row.released_at,
      finishes: parseJson(row.finishes, []) as string[],
      inBoosters: Number(row.in_boosters) === 1,
    };
  }

  /** Rarezas de un juego, para poblar el filtro del frontend. */
  /**
   * Las epocas de sobre del juego, que es como se navega un catalogo (T-090).
   *
   * Salen de `pack_templates`, que es donde ya estaban: se modelaron para el
   * motor de sobres y resulta que en Pokemon coinciden con los bloques reales
   * -- Diamond & Pearl, Black & White / XY, Sun & Moon, Sword & Shield,
   * Scarlet & Violet -- que es exactamente como piensa el catalogo un jugador.
   *
   * SE EXCLUYEN las de linea de producto (`product_line`): son otro eje. Gold
   * Series no es una epoca, es una coleccion paralela, y mezclarlas daria una
   * lista sin sentido cronologico.
   *
   * LA POR DEFECTO ENTRA, con sus dos fechas nulas. No es un caso raro: es la
   * epoca vigente, la que recoge lo que todavia no tiene ventana propia.
   *
   * EL ORDEN NO PUEDE SER `valid_from` A SECAS. Un `NULL` en `valid_from`
   * significa dos cosas opuestas segun la fila: en la epoca clasica es "desde
   * siempre" -- la mas ANTIGUA -- y en la por defecto es "sin ventana" -- la
   * VIGENTE. Ordenando por la columna cruda las dos caian juntas al final, y la
   * portada pintaba el Base Set justo detras de Scarlet & Violet. Por eso la
   * por defecto se aparta primero y el resto se ordena con `NULL` como la fecha
   * mas temprana posible.
   */
  async listEras(game: GameCode): Promise<EraSummary[]> {
    const rows = await this.db.select<{
      name: string; valid_from: string | null; valid_to: string | null; is_default: number;
    }>(
      `SELECT name, valid_from, valid_to, is_default
         FROM pack_templates
        WHERE game_id = ? AND product_line IS NULL AND set_id IS NULL
          AND name NOT LIKE '%(retirada)'
        ORDER BY is_default, COALESCE(valid_from, '0001-01-01')`,
      [GAME_IDS[game]],
    );
    return rows.map((r) => ({
      name: r.name,
      from: r.valid_from,
      to: r.valid_to,
      isDefault: Number(r.is_default) === 1,
    }));
  }

  /**
   * Cuantas cartas hay de cada faceta, para el rail del catalogo (T-092/T-093).
   *
   * ES LO QUE HACE QUE EL FILTRO NO HAYA QUE EXPLICARLO. Un desplegable con
   * once tipos obliga a probar uno a uno para descubrir cuales tienen algo; una
   * lista que dice "Planta 11, Fuego 3, Agua 0" ya ha contestado antes de que
   * nadie pulse. Un filtro que informa se entiende solo, que es el requisito de
   * usabilidad del spec.
   *
   * SE RESPETA EL SET SI SE PIDE: los recuentos son del contexto que se esta
   * mirando, no del catalogo entero. Enseniar "Agua 2436" mientras se navega un
   * set que tiene cuatro seria mentir con un numero.
   */
  async listFacets(game: GameCode, set?: string, userId?: number): Promise<FacetCounts> {
    const where = ['c.game_id = ?', 'p.withdrawn_at IS NULL'];
    const params: unknown[] = [GAME_IDS[game]];
    if (set) {
      where.push('s.external_id = ?');
      params.push(set);
    }
    const filtro = where.join(' AND ');

    // Con sesion, cada fila dice ademas cuantas tiene (T-093): "Planta 12/23"
    // contesta la pregunta del criterio de aceptacion antes de pulsar nada.
    //
    // LA TENENCIA VA EN UNA CONSULTA APARTE QUE PARTE DE LA COLECCION. Un
    // EXISTS por impresion obligaba a mirar `user_collection` 117.152 veces en
    // Magic sin set: 0,43-0,51 s por recuento con una coleccion de 8.406
    // entradas (medido en T-110). Partiendo de la coleccion se recorren solo
    // las impresiones que el usuario tiene, y el resultado es el mismo:
    // DISTINCT porque la entrada es unica por (usuario, impresion, acabado) y
    // una carta en normal y en foil es UNA impresion tenida, como con EXISTS.
    const conTenencia = userId !== undefined;
    const DESDE_EL_CATALOGO = `FROM cards c
           JOIN card_prints p ON p.card_id = c.id
           JOIN sets s ON s.id = p.set_id`;
    const DESDE_LA_COLECCION = `FROM (SELECT DISTINCT uc.card_print_id FROM user_collection uc WHERE uc.user_id = ? AND uc.quantity > 0) u
           JOIN card_prints p ON p.id = u.card_print_id
           JOIN cards c ON c.id = p.card_id
           JOIN sets s ON s.id = p.set_id`;

    const contar = (expresion: string, desde: string, medida: 'n' | 'tengo') =>
      `SELECT ${expresion} AS valor, COUNT(*) AS ${medida}
           ${desde}
          WHERE ${filtro}
          GROUP BY valor`;

    // La rareza se agrupa por id y solo despues se une a su codigo: una
    // subconsulta correlacionada por impresion costaba 0,40 s en Magic sin set
    // (el presupuesto entero del rail); asi son 0,19 s (medido en T-110).
    const contarRarezas = (desde: string, medida: 'n' | 'tengo') =>
      `SELECT r.code AS valor, x.${medida}
           FROM (SELECT p.rarity_id, COUNT(*) AS ${medida}
                   ${desde}
                  WHERE ${filtro}
                  GROUP BY p.rarity_id) x
           JOIN rarities r ON r.id = x.rarity_id`;

    // Una consulta por faceta del perfil, mas la de rareza, en paralelo: cuatro
    // en Pokemon y en Magic, seis en Yu-Gi-Oh!, el doble con sesion. El orden
    // ya no lo pone MySQL: lo pone el perfil (`repartir`).
    const perfil = FACET_PROFILES[game];
    const consultas = [
      contarRarezas,
      ...perfil.facets.map((f) => (desde: string, medida: 'n' | 'tengo') =>
        contar(FACET_SQL[f.key].grupo, desde, medida)),
    ];

    // LA PARTE BASE SE CACHEA, LA TENENCIA NO. Los recuentos base son iguales
    // para todos hasta la proxima ingesta y son lo caro (0,2-0,25 s cada uno
    // en Magic sin set); la tenencia es de cada usuario y barata. La clave es
    // juego y set: lo unico que entra en `filtro`. JSON y no una concatenacion
    // para que ningun id de set pueda fabricar la clave de otro.
    const clave = JSON.stringify(['facetas', game, set ?? null]);
    const [bases, mias] = await Promise.all([
      this.recuentosBase.obtener(clave, () =>
        Promise.all(consultas.map((c) => this.db.select<FilaDeRecuento>(c(DESDE_EL_CATALOGO, 'n'), params)))),
      conTenencia
        ? Promise.all(consultas.map((c) =>
            this.db.select<FilaDeRecuento>(c(DESDE_LA_COLECCION, 'tengo'), [userId, ...params])))
        : Promise.resolve(null),
    ]);

    /**
     * Se cruzan por el valor del grupo: la pareja solo trae los grupos donde
     * el usuario tiene algo, y uno ausente es un cero. SIEMPRE SOBRE COPIAS:
     * las filas base pueden venir de la cache y son compartidas; escribir
     * `tengo` en ellas filtraria la coleccion de un usuario al siguiente.
     */
    const cruzar = (filas: readonly FilaDeRecuento[], propias: readonly FilaDeRecuento[] | undefined) => {
      if (!propias) return filas;
      const deClave = (v: FilaDeRecuento['valor']) => (v === null ? '\u0000' : String(v));
      const tenidas = new Map(propias.map((f) => [deClave(f.valor), Number(f.tengo ?? 0)]));
      return filas.map((f) => ({ ...f, tengo: tenidas.get(deClave(f.valor)) ?? 0 }));
    };
    const [rarezas = [], ...porFaceta] = bases.map((filas, i) => cruzar(filas, mias?.[i]));

    const facetas: Partial<Record<FacetKey, FacetCount[]>> = {};
    perfil.facets.forEach((f, i) => {
      facetas[f.key] = repartir(porFaceta[i] ?? [], f, conTenencia);
    });

    // El total sale de la rareza: toda impresion tiene exactamente una, asi que
    // sus grupos son una particion. Ninguna faceta de Magic lo es (corrige el
    // calculo de T-093, que usaba la categoria de Pokemon).
    const total = rarezas.reduce((acc, f) => acc + Number(f.n), 0);
    const ownedTotal = conTenencia ? rarezas.reduce((acc, f) => acc + Number(f.tengo ?? 0), 0) : null;

    return {
      facetas,
      rarities: rarezas
        .filter((f) => f.valor !== null)
        .map((f) => ({
          value: String(f.valor),
          count: Number(f.n),
          owned: conTenencia ? Number(f.tengo ?? 0) : null,
        })),
      total,
      ownedTotal,
    };
  }

  async listRarities(game: GameCode): Promise<Array<{ code: string; label: string; tier: number }>> {
    const rows = await this.db.select<{ code: string; label: string; tier: number }>(
      `SELECT code, label, tier FROM rarities WHERE game_id = ? ORDER BY tier, code`,
      [GAME_IDS[game]],
    );
    return rows.map((r) => ({ code: r.code, label: r.label, tier: Number(r.tier) }));
  }
}

export type CardRow = {
  id: number; oracle_key: string; game_id: number; name: string; type_line: string | null;
  set_code: string; set_name: string; print_id: number;
  collector_number: string; image_local_path: string | null; rarity: string;
  /** Solo si alguien mira (T-093). Ausente en la ficha, que no tiene usuario. */
  tengo?: number | string | null;
} & {
  /** Los datos de fila, con el alias de `COLUMNAS_DE_FILA`. */
  [K in RowField as `ff_${K}`]?: string | number | null;
};

/**
 * Fila cruda -> resumen de carta.
 *
 * Se exporta para que un test pueda comparar los campos que produce con los que
 * declara el esquema de la API. No es cosmetico: el esquema es un literal JSON
 * y TypeScript no lo relaciona con `CardSummary`, asi que hasta P-024 nadie
 * comprobaba que los dos lados dijeran lo mismo — y Fastify descarta en
 * silencio lo que no cuadra.
 */
export function toSummary(row: CardRow): CardSummary {
  const game = gameCodeOf(Number(row.game_id));
  // Solo los datos de las celdas de SU juego: una fila de Magic no lleva
  // `hp: null` (H9f). El esquema declara la union de los tres.
  const facetas: RowFacets = {};
  for (const campo of rowFieldsOf(game)) {
    const crudo = row[`ff_${campo}`];
    facetas[campo] =
      crudo === undefined || crudo === null ? null : ROW_FIELD_KIND[campo] === 'int' ? Number(crudo) : String(crudo);
  }
  return {
    cardId: Number(row.id),
    oracleKey: row.oracle_key,
    game,
    name: row.name,
    typeLine: row.type_line,
    setCode: row.set_code,
    setName: row.set_name,
    collectorNumber: row.collector_number,
    rarity: row.rarity,
    // SOLO la ruta local. `image_source_url` ni se selecciona (P-001).
    imagePath: row.image_local_path,
    printId: Number(row.print_id),
    facetas,
    // Ausente -> null, explicitamente. `Number(undefined) === 1` daria `false`,
    // y una ficha diria "no la tienes" a quien si la tiene.
    owned: row.tengo === undefined || row.tengo === null ? null : Number(row.tengo) === 1,
  };
}

/**
 * Traduce texto libre a una consulta BOOLEAN MODE segura.
 *
 * Los operadores de MySQL (`+ - > < ( ) ~ * " @`) se eliminan en vez de
 * escaparse: dejarlos pasar permite que el usuario provoque errores de sintaxis
 * o consultas absurdamente caras. Cada token recibe un `*` final para que
 * buscar "light" encuentre "Lightning Bolt", que es lo que la gente espera.
 */
export function toBooleanQuery(raw: string): string {
  return raw
    .replace(/[+\-><()~*"@]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= MIN_FULLTEXT_LENGTH)
    .map((t) => `+${t}*`)
    .join(' ');
}

function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Cursor opaco. Se codifica para que nadie lo trate como un numero de pagina. */
export function encodeCursor(name: string, id: number): string {
  return Buffer.from(JSON.stringify([name, id]), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { name: string; id: number } | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [name, id] = parsed as [unknown, unknown];
    if (typeof name !== 'string' || typeof id !== 'number') return null;
    return { name, id };
  } catch {
    // Un cursor corrupto se ignora y se sirve la primera pagina. Es preferible a
    // un 500 por un enlace viejo o manipulado.
    return null;
  }
}

function parseJson(value: unknown, fallback: unknown): unknown {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

/** Una paleta con la forma de 0028, o null. Una a medias no se sirve. */
function paletaValida(v: unknown): Paleta | null {
  const p = v as Partial<Paleta> | null;
  const hex = /^#[0-9a-f]{6}$/i;
  return p && typeof p.primario === 'string' && hex.test(p.primario)
    && typeof p.secundario === 'string' && hex.test(p.secundario)
    ? { primario: p.primario, secundario: p.secundario }
    : null;
}

function gameCodeOf(id: number): GameCode {
  const entry = (Object.entries(GAME_IDS) as Array<[GameCode, number]>).find(([, v]) => v === id);
  if (!entry) throw new Error(`game_id desconocido: ${id}`);
  return entry[0];
}

export { isGameCode };
