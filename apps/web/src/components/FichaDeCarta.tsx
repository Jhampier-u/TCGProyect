import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameCode, MtgGameData, PtcgGameData } from '@tcg/shared';
import { api, imageUrl, type CardDetail } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { consultaRarezas } from '../lib/consultas.js';
import { addCard, fromDeckDetail, toPayload } from '../lib/deck-draft.js';
import { estiloDeTipo } from '../lib/tipos-pokemon.js';
import { nivelDe } from '../lib/rareza.js';
import { ES } from '../i18n/es.js';
import { CartaConBrillo } from './apertura/CartaConBrillo.js';
import { Mana } from './Mana.js';

/**
 * Primer dia con marca de regulacion: el de Sword & Shield. Una carta sin marca
 * publicada antes no tiene un hueco de datos -- el concepto no existia -- y la
 * ficha lo dice asi (spec, seccion 2).
 */
const INICIO_DE_LAS_MARCAS = '2019-11-15';

interface Props {
  printId: number;
  juego: GameCode;
  /**
   * Lo que la fila sabia de la tenencia. La ficha viene de `findCard`, que no
   * tiene usuario y devuelve `owned: null`; la fila si lo sabia.
   */
  owned: boolean | null;
  onCerrar: () => void;
}

/**
 * Ficha de carta (T-094).
 *
 * UN `<dialog>` NATIVO CON `showModal()`, y es la decision importante. Trae de
 * serie lo que `SelectorDeSet` tuvo que reimplementar a mano en T-066: el resto
 * de la pagina queda inerte -- el foco no se escapa por detras --, `Escape`
 * cierra, y el lector de pantalla lo anuncia como dialogo. Lo unico que no trae
 * es devolver el foco a quien lo abrio, y eso se hace aqui.
 *
 * Se abre y se cierra por la URL (`?carta=`), asi que la ficha se comparte con
 * un enlace y el boton de atras la cierra en vez de sacarte del catalogo.
 */
export function FichaDeCarta({ printId, juego, owned, onCerrar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  const carta = useQuery({
    queryKey: ['carta', printId],
    queryFn: () => api.card(printId).then((r) => r.data),
  });

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    // Quien tenia el foco al abrir lo recupera al cerrar: sin esto, tras cerrar
    // con Escape el foco cae al principio del documento y quien navega con
    // teclado pierde el sitio en una tabla de 300 filas.
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) d.showModal();
    return () => {
      if (d.open) d.close();
      previo?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogo}
      className="ficha"
      aria-labelledby={idTitulo}
      // `cancel` es el Escape nativo. Se intercepta para que el cierre pase
      // por la URL, que es la fuente de verdad; si no, el dialogo se cerraria y
      // la URL seguiria diciendo que esta abierto.
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      // Clic en el fondo: el `<dialog>` ocupa la pantalla y su contenido esta
      // en `.ficha-cuerpo`, asi que un clic cuyo destino es el propio dialogo
      // es un clic fuera de la ficha.
      onClick={(e) => {
        if (e.target === dialogo.current) onCerrar();
      }}
    >
      <div className="ficha-cuerpo">
        <button type="button" className="ficha-cerrar" onClick={onCerrar} aria-label={ES.ficha.cerrar}>
          <span aria-hidden="true">{ES.simbolo.cerrar}</span>
        </button>

        {carta.isPending && <p className="vacio" id={idTitulo}>{ES.ficha.cargando}</p>}
        {carta.isError && <p className="aviso error" id={idTitulo}>{ES.ficha.error}</p>}
        {carta.data && <Contenido carta={carta.data} juego={juego} owned={owned} idTitulo={idTitulo} />}
      </div>
    </dialog>
  );
}

/**
 * La ficha de cada juego, en tres piezas (H9f). El armazon -- dialogo, URL,
 * foco, detalles comunes, mazo -- es comun; cada juego pone:
 *  - `cabecera`: lo que va DENTRO de `<header>`, bajo la linea de tipo
 *    (insignias, "evoluciona de", el coste de Magic);
 *  - `cuerpo`: lo que va entre la cabecera y los detalles (ataques, reglas...);
 *  - `detalles`: filas propias al principio de la lista de detalles (la marca
 *    de regulacion de Pokemon).
 * Con tres piezas el DOM de Pokemon queda EXACTAMENTE en el orden de T-094.
 */
type Pieza = (p: { carta: CardDetail }) => ReactElement | null;

interface PiezasDeFicha {
  cabecera: Pieza;
  cuerpo: Pieza;
  detalles: Pieza;
}

function Contenido({
  carta, juego, owned, idTitulo,
}: { carta: CardDetail; juego: GameCode; owned: boolean | null; idTitulo: string }) {
  const src = imageUrl(carta.imagePath);
  // Misma clave que el catalogo: llega de la cache, no hace otra peticion.
  const rarezas = useQuery(consultaRarezas(juego));
  const rareza = rarezas.data?.find((r) => r.code === carta.rarity)?.label ?? carta.rarity;
  const tier = rarezas.data?.find((r) => r.code === carta.rarity)?.tier ?? 0;
  const { cabecera: Cabecera, cuerpo: Cuerpo, detalles: Detalles } = FICHAS[juego];

  return (
    <div className="ficha-rejilla">
      <figure className="ficha-imagen">
        {src
          ? <CartaConBrillo imagePath={carta.imagePath} nombre={carta.name} nivel={nivelDe(juego, tier)} acabado="normal" />
          : <div className="miniatura-hueco" />}
      </figure>

      <div className="ficha-datos">
        <header className="ficha-cabecera">
          <p className="ficha-contexto">
            {ES.ficha.numeroEnSet(carta.setName, carta.collectorNumber)}
          </p>
          <h2 id={idTitulo}>{carta.name}</h2>
          {carta.typeLine && <p className="ficha-linea">{carta.typeLine}</p>}
          <Cabecera carta={carta} />
        </header>

        <Cuerpo carta={carta} />

        <dl className="ficha-detalles">
          <Detalles carta={carta} />
          {carta.releasedAt && (
            <div>
              <dt>{ES.ficha.publicadaEtiqueta}</dt>
              <dd>{carta.releasedAt}</dd>
            </div>
          )}
          <div>
            <dt>{ES.catalogo.columnas.rareza}</dt>
            <dd>{rareza}{ES.simbolo.separador}{carta.inBoosters ? ES.ficha.enSobres : ES.ficha.fueraDeSobres}</dd>
          </div>
          {carta.finishes.length > 0 && (
            <div>
              <dt>{ES.ficha.acabados}</dt>
              <dd>{carta.finishes.join(ES.simbolo.separador)}</dd>
            </div>
          )}
        </dl>

        {owned !== null && (
          <p className={owned ? 'ficha-tenencia tienes-si' : 'ficha-tenencia'}>
            {owned ? ES.ficha.laTienes : ES.ficha.noLaTienes}
          </p>
        )}

        <AnadirAMazo carta={carta} juego={juego} />
      </div>
    </div>
  );
}

/** El texto de la carta, linea a linea, con el titulo que le toque. */
function Reglas({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <section className="ficha-seccion">
      <h3>{titulo}</h3>
      {texto.split('\n').map((linea, i) => (
        <p key={i} className="ficha-texto">{linea}</p>
      ))}
    </section>
  );
}

/** Una pieza vacia: el juego no pone nada en ese hueco. */
function Nada(): null {
  return null;
}

const nombreDeTipo = (t: string) => ES.pokemon.tipo[t] ?? t;

/** Pokemon, dentro de la cabecera: los tipos, los PS y de quien evoluciona. Igual que en T-094. */
function CabeceraPtcg({ carta }: { carta: CardDetail }) {
  const datos = carta.gameData as PtcgGameData;
  const tipos = datos.types ?? [];
  return (
    <>
      <div className="ficha-insignias">
        {tipos.map((t) => (
          <span key={t} className="chip-tipo" style={estiloDeTipo(t)}>{nombreDeTipo(t)}</span>
        ))}
        {typeof datos.hp === 'number' && (
          <span className="ficha-ps"><strong>{datos.hp}</strong> {ES.ficha.ps}</span>
        )}
      </div>
      {datos.evolves_from && <p className="ficha-linea">{ES.ficha.evolucionaDe(datos.evolves_from)}</p>}
    </>
  );
}

/** Pokemon, entre la cabecera y los detalles: habilidades, ataques, la tira y las reglas. */
function CuerpoPtcg({ carta }: { carta: CardDetail }) {
  const datos = carta.gameData as PtcgGameData;
  return (
    <>
      {datos.abilities && datos.abilities.length > 0 && (
        <section className="ficha-seccion">
          <h3>{ES.ficha.habilidades}</h3>
          {datos.abilities.map((h) => (
            <div key={h.name} className="ficha-ataque">
              <p className="ficha-ataque-nombre">
                {h.type && <span className="ficha-habilidad-tipo">{h.type}</span>} {h.name}
              </p>
              {h.text && <p className="ficha-texto">{h.text}</p>}
            </div>
          ))}
        </section>
      )}

      {datos.attacks && datos.attacks.length > 0 && (
        <section className="ficha-seccion">
          <h3>{ES.ficha.ataques}</h3>
          {datos.attacks.map((a, i) => (
            <div key={`${a.name}-${i}`} className="ficha-ataque">
              <p className="ficha-ataque-nombre">
                <Coste tipos={a.cost ?? []} nombre={nombreDeTipo} />
                <span>{a.name}</span>
                {a.damage && <span className="ficha-dano">{a.damage}</span>}
              </p>
              {a.text && <p className="ficha-texto">{a.text}</p>}
            </div>
          ))}
        </section>
      )}

      {/* Debilidad, resistencia y retirada son de los Pokemon: un Entrenador o
          una Energia no las tienen. El valor se compara con el de `i18n`
          porque lleva tilde y el codigo es ASCII. */}
      {datos.supertype !== undefined && ES.pokemon.ordenSupertipo[0] === datos.supertype && (
        <dl className="ficha-tira">
          <div>
            <dt>{ES.ficha.debilidad}</dt>
            <dd>{lista(datos.weaknesses, nombreDeTipo)}</dd>
          </div>
          <div>
            <dt>{ES.ficha.resistencia}</dt>
            <dd>{lista(datos.resistances, nombreDeTipo)}</dd>
          </div>
          <div>
            <dt>{ES.ficha.retirada}</dt>
            <dd>
              {datos.retreat_cost && datos.retreat_cost.length > 0
                ? <Coste tipos={datos.retreat_cost} nombre={nombreDeTipo} />
                : ES.ficha.ninguna}
            </dd>
          </div>
        </dl>
      )}

      <Reglas titulo={ES.ficha.reglas} texto={carta.rulesText} />
    </>
  );
}

/** Pokemon, primera fila de los detalles: la marca de regulacion, donde estaba. */
function DetallesPtcg({ carta }: { carta: CardDetail }) {
  const marca = typeof carta.facetas.mark === 'string' ? carta.facetas.mark : null;
  return (
    <div>
      <dt>{ES.ficha.marca}</dt>
      <dd>{textoDeMarca(marca, carta.releasedAt)}</dd>
    </div>
  );
}

/** Scryfall separa en el texto de reglas las dos caras con una linea "//". */
const OTRA_CARA_EN_REGLAS = '\n//\n';

/**
 * Magic, dentro de la cabecera (H9f): coste, F/R o lealtad, y una nota si hay
 * otra cara. La otra cara completa queda fuera del spec: se avisa y se ensena
 * la primera.
 */
function CabeceraMtg({ carta }: { carta: CardDetail }) {
  const datos = carta.gameData as MtgGameData;
  const dosCaras = (carta.typeLine ?? '').includes(' // ');
  return (
    <>
      <div className="ficha-insignias">
        {datos.mana_cost && <Mana coste={datos.mana_cost} />}
        {datos.power !== undefined && datos.toughness !== undefined && (
          <span className="ficha-ps">
            <strong>{ES.ficha.fr(datos.power, datos.toughness)}</strong> {ES.ficha.fuerzaResistencia}
          </span>
        )}
        {datos.loyalty !== undefined && (
          <span className="ficha-ps"><strong>{datos.loyalty}</strong> {ES.ficha.lealtad}</span>
        )}
      </div>
      {dosCaras && <p className="ficha-linea">{ES.ficha.otraCara}</p>}
    </>
  );
}

/** Magic, el cuerpo: las reglas de la primera cara. */
function CuerpoMtg({ carta }: { carta: CardDetail }) {
  const reglas = carta.rulesText ? carta.rulesText.split(OTRA_CARA_EN_REGLAS)[0] ?? null : null;
  return <Reglas titulo={ES.ficha.reglas} texto={reglas} />;
}

/** Yu-Gi-Oh! hasta T-113: el texto de la carta, sin mas. */
function ReglasDeLaCarta({ carta }: { carta: CardDetail }) {
  return <Reglas titulo={ES.ficha.reglas} texto={carta.rulesText} />;
}

const FICHAS: Readonly<Record<GameCode, PiezasDeFicha>> = {
  PTCG: { cabecera: CabeceraPtcg, cuerpo: CuerpoPtcg, detalles: DetallesPtcg },
  MTG: { cabecera: CabeceraMtg, cuerpo: CuerpoMtg, detalles: Nada },
  YGO: { cabecera: Nada, cuerpo: ReglasDeLaCarta, detalles: Nada },
};

/** El coste como fila de puntos del color de cada tipo, con su lectura en texto. */
function Coste({ tipos, nombre }: { tipos: string[]; nombre: (t: string) => string }) {
  return (
    <span className="coste" role="img" aria-label={ES.ficha.coste(tipos.map(nombre))}>
      {tipos.map((t, i) => (
        <span key={i} className="coste-punto" style={estiloDeTipo(t)} />
      ))}
    </span>
  );
}

function lista(
  valores: Array<{ type: string; value: string }> | undefined,
  nombre: (t: string) => string,
): string {
  if (!valores || valores.length === 0) return ES.ficha.ninguna;
  return valores.map((v) => `${nombre(v.type)} ${v.value}`).join(ES.simbolo.separador);
}

function textoDeMarca(marca: string | null, publicada: string | null): string {
  if (marca) return ES.pokemon.marca(marca);
  if (publicada && publicada < INICIO_DE_LAS_MARCAS) return ES.ficha.marcaAnterior(publicada.slice(0, 4));
  return ES.ficha.marcaNinguna;
}

/**
 * Anadir a un mazo. Funciona ya, contra los mazos de H7.
 *
 * "Anadir a la coleccion" NO se pinta: la coleccion real llega en H9c y un
 * boton que no hace nada es peor que no tener boton (spec, T-094).
 *
 * Reutiliza el borrador del editor (`deck-draft.ts`), que ya sabe en que zona
 * va cada carta y donde sumar la copia. Lo unico nuevo aqui es leer el mazo,
 * anadir y guardarlo entero, que es como la API guarda un mazo.
 */
function AnadirAMazo({ carta, juego }: { carta: CardDetail; juego: GameCode }) {
  const { user, token } = useAuth();
  const cliente = useQueryClient();
  const [elegido, setElegido] = useState<number | null>(null);
  const idSelect = useId();

  const mazos = useQuery({
    queryKey: ['decks', juego, user?.id ?? null],
    queryFn: () => api.decks(token as string, juego).then((r) => r.data),
    enabled: token !== null,
  });

  const anadir = useMutation({
    mutationFn: async (deckId: number) => {
      const t = token as string;
      const mazo = (await api.deck(t, deckId)).data;
      const borrador = addCard(
        fromDeckDetail(mazo.cards),
        { ...carta, gameData: carta.gameData, owned: 0 },
        juego,
      );
      const guardado = (await api.putDeckCards(t, deckId, toPayload(borrador))).data;
      const copias = guardado.cards
        .filter((c) => c.printId === carta.printId)
        .reduce((acc, c) => acc + c.quantity, 0);
      return { nombre: guardado.name, copias };
    },
    onSuccess: (_r, deckId) => {
      // Las claves que usan las paginas de mazos: `['deck', id]` en el editor
      // y `['decks']` en la lista. Con otras, el editor seguiria ensenando el
      // mazo de antes de anadir.
      void cliente.invalidateQueries({ queryKey: ['deck', deckId] });
      void cliente.invalidateQueries({ queryKey: ['decks'] });
    },
  });

  if (!user || !token) {
    return (
      <p className="ficha-accion tenue">
        {ES.ficha.entraParaMazos} <Link to="/acceso">{ES.catalogo.entrar}</Link>
      </p>
    );
  }
  if (mazos.data && mazos.data.length === 0) {
    return (
      <p className="ficha-accion tenue">
        {ES.ficha.sinMazos} <Link to="/mazos">{ES.ficha.crearMazo}</Link>
      </p>
    );
  }

  const deckId = elegido ?? mazos.data?.[0]?.id ?? null;

  return (
    <form
      className="ficha-accion"
      onSubmit={(e) => {
        e.preventDefault();
        if (deckId !== null) anadir.mutate(deckId);
      }}
    >
      <h3>{ES.ficha.anadirAMazo}</h3>
      <div className="ficha-accion-fila">
        <label htmlFor={idSelect} className="sr-solo">{ES.ficha.elegirMazo}</label>
        <select
          id={idSelect}
          value={deckId ?? ''}
          onChange={(e) => setElegido(Number(e.target.value))}
          disabled={!mazos.data}
        >
          {(mazos.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button type="submit" className="primario" disabled={deckId === null || anadir.isPending}>
          {anadir.isPending ? ES.ficha.anadiendo : ES.ficha.anadir}
        </button>
      </div>
      <p className="ficha-estado" role="status">
        {anadir.isSuccess && ES.ficha.anadida(anadir.data.nombre, anadir.data.copias)}
        {anadir.isError && <span className="error">{ES.ficha.errorAnadir}</span>}
      </p>
    </form>
  );
}
