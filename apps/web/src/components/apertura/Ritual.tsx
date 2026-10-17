import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { GameCode } from '@tcg/shared';
import type { OpenedCard, SetSummary } from '../../lib/api.js';
import { acabadoDe, type Nivel } from '../../lib/rareza.js';
import { avanzar, iniciar, NIVEL_CON_ANTICIPACION, prepararSobre } from '../../lib/ritual.js';
import { CartaConBrillo } from './CartaConBrillo.js';
import { CapaDeEfectos } from './CapaDeEfectos.js';
import { Sobre } from './Sobre.js';
import { ES } from '../../i18n/es.js';

/** Duraciones del spec (seccion 7). */
const MS_RASGAR = 600;
const MS_ANTICIPACION = 1200;
const MS_RAPIDO = 140;
/** Distancia de un gesto de deslizar sobre la carta del foco para avanzar, en px. */
const PX_DESLIZAR = 60;

export interface RitualProps {
  game: GameCode;
  cards: OpenedCard[];
  tiers: Map<string, number>;
  openingId: number;
  seed: string;
  /** El set del sobre: arte, paleta, icono. Null si la lista aun no ha llegado. */
  set: SetSummary | null;
  /** Varios sobres: del segundo en adelante, solo se para en niveles 4 y 5. */
  rapido: boolean;
  /** code -> nombre legible de la rareza, para lo que oye el lector de pantalla. */
  etiquetas: Map<string, string>;
  /**
   * Hay un sobre anterior aun en curso: este espera sellado y quieto, sin
   * avanzar solo. Los sobres van de uno en uno (spec, seccion 7).
   */
  enEspera: boolean;
  /** Se llama una vez, al llegar al resumen: deja paso al sobre siguiente. */
  onTerminado: () => void;
  /** Abre otro sobre del mismo set y cantidad. Sin el, no hay boton. */
  onAbrirOtro?: (() => void) | undefined;
  /** Hay una apertura en curso: "Abrir otro" sigue montado, pero inerte. */
  abriendo?: boolean;
}

/**
 * El ritual de apertura (H9e-4): sustituye a `PackReveal`.
 *
 * LO QUE NO SE NEGOCIA, heredado de H5 y T-095:
 *  - cada carta es un `button` con `aria-pressed`, dentro de la region
 *    "Sobre #N"; la de arriba del mazo se voltea con clic, Enter o Espacio;
 *  - movimiento reducido = todo revelado y sin lienzo;
 *  - el orden lo decide `prepararSobre`, no el servidor ni la animacion.
 *
 * La pagina lo monta con `key={openingId}`: cada apertura es un componente
 * nuevo, y con el el reductor arranca de cero.
 */
export function Ritual({
  game, cards, tiers, openingId, seed, set, rapido, etiquetas, enEspera, onTerminado, onAbrirOtro,
  abriendo = false,
}: RitualProps) {
  // Se lee al montar y el estado inicial sale de aqui. Cambiar la preferencia a
  // mitad de un sobre no rehace ese sobre; el siguiente (otra `key`) ya la toma.
  const reducido = useReducedMotion() ?? false;
  const idTitulo = useId();
  // Orden y niveles de UNA sola llamada: lo que se ve y lo que decide la
  // anticipacion no pueden divergir (T-104). Se calculan UNA vez, al montar, como
  // el estado inicial del reductor: si se recalcularan (la pagina rehace el Map
  // de tiers en cada render, o los tiers llegan tarde), el orden pintado podria
  // cambiar a mitad del ritual y separarse de los niveles que ya tiene la maquina.
  const [{ orden, niveles }] = useState(() => prepararSobre(cards, tiers, game));
  const [estado, despachar] = useReducer(avanzar, undefined, () => iniciar(niveles, reducido, rapido));
  const [disparo, setDisparo] = useState(0);
  /** Si se llego al resumen con "Saltar": entonces se anuncia una sola linea. */
  const [saltado, setSaltado] = useState(false);

  // Los tiempos son del componente; la secuencia, de la maquina.
  useEffect(() => {
    if (estado.fase === 'rasgando') {
      const t = setTimeout(() => despachar({ tipo: 'rasgado' }), MS_RASGAR);
      return () => clearTimeout(t);
    }
    if (estado.fase === 'anticipacion') {
      const t = setTimeout(() => despachar({ tipo: 'anticipado' }), MS_ANTICIPACION);
      return () => clearTimeout(t);
    }
    // En espera, nada avanza solo: el sobre anterior aun no ha terminado.
    if (enEspera) return undefined;
    // Sin set (la lista aun no ha llegado) no hay sobre que pintar: se rasga solo
    // en vez de dejar al usuario ante una escena vacia sin nada que pulsar.
    if ((rapido || !set) && estado.fase === 'sellado') despachar({ tipo: 'rasgar' });
    // Con una carta en el foco el mazo espera al usuario, tambien en modo rapido.
    if (rapido && estado.fase === 'mazo' && estado.foco === null && (niveles[estado.reveladas] ?? 5) < 4) {
      const t = setTimeout(() => despachar({ tipo: 'siguiente' }), MS_RAPIDO);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [estado.fase, estado.reveladas, estado.foco, rapido, niveles, set, enEspera]);

  // Al llegar al resumen se avisa UNA vez a la pagina, que da paso al siguiente.
  // La funcion va por ref: la pagina la rehace en cada render.
  const alTerminar = useRef(onTerminado);
  useLayoutEffect(() => { alTerminar.current = onTerminado; }, [onTerminado]);
  const avisado = useRef(false);
  useEffect(() => {
    if (estado.fase !== 'resumen' || avisado.current) return;
    avisado.current = true;
    alTerminar.current();
  }, [estado.fase]);

  // Cada revelado de nivel 3 o mas dispara la capa de efectos. Saltar no es un
  // revelado: quien salta no quiere el estallido de la ultima carta.
  const ultimoNivel = estado.reveladas > 0 ? niveles[estado.reveladas - 1]! : 1;
  useEffect(() => {
    if (saltado) return;
    if (estado.reveladas > 0 && ultimoNivel >= 3) setDisparo((d) => d + 1);
  }, [estado.reveladas, ultimoNivel, saltado]);

  // ---------------------------------------------------------------- el foco
  //
  // El ritual QUITA del DOM el elemento con el foco: el sobre al rasgarse, la
  // carta de arriba al voltearse, el boton Saltar al acabar. Sin nada mas, el
  // foco caeria en <body> y quien va con teclado tendria que volver a tabular
  // desde el principio de la pagina.
  //
  // Regla: el foco se recoloca SOLO si se perdio desde DENTRO de esta seccion,
  // es decir, si el ultimo elemento enfocado aqui dentro ya no esta en el DOM y
  // el foco esta en <body>. Si el usuario esta en otra parte de la pagina, o en
  // un elemento de aqui que sigue vivo (Saltar en un sobre rapido), no se toca.
  const seccion = useRef<HTMLElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  // Contenedores, no cartas: Framer Motion no reengancha una `ref` que cambia de
  // elemento (la de "la carta de arriba" pasaria de uno a otro), asi que la
  // carta se busca dentro del contenedor en el momento de mover el foco.
  const mazoRef = useRef<HTMLDivElement>(null);
  const bandejaRef = useRef<HTMLDivElement>(null);
  const focoRef = useRef<HTMLDivElement>(null);
  /** El ultimo elemento de esta seccion que tuvo el foco; null si se fue fuera. */
  const ultimoFoco = useRef<HTMLElement | null>(null);

  // Un sobre en espera no se toca: ni clic ni tabulador ni lector de pantalla.
  // `inert` va por la ref porque React 18 no conoce el atributo. Al pasar a ser
  // el activo de un lote, se trae a la vista (sin deslizar con movimiento reducido).
  const estabaEnEspera = useRef(enEspera);
  useLayoutEffect(() => {
    const el = seccion.current;
    if (!el) return;
    el.inert = enEspera;
    if (estabaEnEspera.current && !enEspera) {
      el.scrollIntoView({ block: 'nearest', behavior: reducido ? 'auto' : 'smooth' });
    }
    estabaEnEspera.current = enEspera;
  }, [enEspera, reducido]);

  const alEnfocar = (e: FocusEvent<HTMLElement>) => {
    ultimoFoco.current = e.target;
  };
  const alDesenfocar = (e: FocusEvent<HTMLElement>) => {
    // Solo cuenta como "se fue" si se fue a OTRO elemento de fuera. Sin destino
    // (relatedTarget null) puede ser que el elemento se haya quitado del DOM, y
    // eso es justo lo que hay que poder detectar despues.
    const destino = e.relatedTarget;
    if (destino instanceof Node && !seccion.current?.contains(destino)) ultimoFoco.current = null;
  };

  useEffect(() => {
    const previo = ultimoFoco.current;
    const activo = document.activeElement;
    const perdido = previo !== null && !previo.isConnected && (activo === null || activo === document.body);
    if (!perdido) return;
    // Orden de preferencia: la carta de arriba del mazo (la accion que sigue),
    // la del foco (la ultima del sobre: avanzar desde ella lleva al resumen), la
    // ultima de la bandeja y, como ultimo recurso, el titulo.
    const cima = mazoRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    const enFoco = focoRef.current?.querySelector<HTMLButtonElement>('button');
    const enBandeja = bandejaRef.current?.querySelectorAll<HTMLButtonElement>('button');
    const ultimaRevelada = enBandeja && enBandeja.length > 0 ? enBandeja[enBandeja.length - 1] : undefined;
    const destino = cima ?? enFoco ?? ultimaRevelada ?? titulo.current;
    destino?.focus();
  }, [estado.fase, estado.reveladas, estado.foco]);

  // ------------------------------------------------------------ el foco visual
  //
  // La carta en grande. En la anticipacion es la de arriba del mazo, aun boca
  // abajo, que sube al centro y tiembla; al revelarse es LA MISMA (misma `key`)
  // y se voltea alli. Asi el elemento no cambia y, si tenia el foco del
  // teclado, lo conserva.
  const anticipando = estado.fase === 'anticipacion';
  const indiceFoco = anticipando ? estado.reveladas : estado.foco;
  const cartaFoco = indiceFoco !== null ? orden[indiceFoco] : undefined;
  const nivelFoco: Nivel = indiceFoco !== null ? niveles[indiceFoco] ?? 1 : 1;
  const focoRevelado = cartaFoco !== undefined && !anticipando;
  /**
   * El foco del render anterior. Una carta que entra en la bandeja desde el
   * foco ya llega boca arriba: solo vuela. Las que entran sin pasar por el
   * (modo rapido, Saltar) se voltean en la bandeja como antes.
   */
  const focoPrevio = useRef<number | null>(null);
  useLayoutEffect(() => { focoPrevio.current = estado.foco; }, [estado.foco]);
  /**
   * Un deslizamiento que YA avanzo acaba en un clic: ese clic no debe avanzar
   * otra vez. Solo se marca cuando el gesto avanzo de verdad: un temblor del
   * raton al hacer clic tambien es un "pan", y no debe tragarse el clic.
   */
  const deslizado = useRef(false);
  /**
   * Una pulsacion fisica, un avance. Mantener Intro en un boton repite el
   * keydown y cada repeticion es un clic: las cartas pasarian solas. Se anula
   * la repeticion (Espacio no la necesita: su clic llega al soltar). No hay
   * ademas un plazo minimo entre avances: quien pulsa rapido, tecla a tecla,
   * debe poder hacerlo, y la prueba del teclado lo hace.
   */
  const sinRepeticion = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
  };
  const avanzarFoco = () => {
    if (focoRevelado) despachar({ tipo: 'siguiente' });
  };

  // La que esta en el foco no esta en la bandeja; la que se anticipa ya no esta en el mazo.
  const reveladas = orden.slice(0, estado.foco ?? estado.reveladas);
  const inicioMazo = estado.reveladas + (anticipando ? 1 : 0);
  const mazo = orden.slice(inicioMazo);
  const nuevas = cards.filter((c) => c.isNew).length;
  const sellado = estado.fase === 'sellado' || estado.fase === 'rasgando';

  // Lo que oye un lector de pantalla. El foco salta a la siguiente "Carta N sin
  // revelar", asi que sin esto nunca sabria que ha salido.
  //  - Ritual completo: carta a carta.
  //  - Modo rapido: solo las de nivel 4 o 5 (en las que el mazo se para y el
  //    usuario voltea) y, al final, una linea de resumen. Diez sobres carta a
  //    carta serian ruido.
  //  - Saltar o movimiento reducido: solo la linea de resumen.
  // La region nace VACIA y se llena tras montar: un lector de pantalla solo
  // anuncia cambios, y con movimiento reducido el resumen existe desde el
  // primer render.
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  const ultima = estado.reveladas > 0 ? orden[estado.reveladas - 1] : undefined;
  const nivelUltima = estado.reveladas > 0 ? niveles[estado.reveladas - 1]! : 1;
  const resumen = estado.fase === 'resumen' ? ES.ritual.resumen(orden.length, nuevas) : '';
  let anuncio = '';
  if (montado && ultima !== undefined) {
    const carta = ES.ritual.revelada(ultima.name, etiquetas.get(ultima.rarity) ?? ultima.rarity.replace(/_/g, ' '));
    if (reducido || saltado) anuncio = resumen;
    else if (!rapido) anuncio = carta;
    else if (nivelUltima >= NIVEL_CON_ANTICIPACION) anuncio = resumen ? `${carta}. ${resumen}` : carta;
    else anuncio = resumen;
  }

  return (
    <section
      ref={seccion}
      className="sobre ritual"
      aria-labelledby={idTitulo}
      // Los tokens de dorso y el acento del juego cuelgan de este atributo: sin
      // el, el sobre sin paleta y los reversos se quedan sin color en /sobres.
      data-juego={game.toLowerCase()}
      data-fase={estado.fase}
      onFocus={alEnfocar}
      onBlur={alDesenfocar}
    >
      <div className="sobre-cabecera">
        {/* tabIndex -1: enfocable por programa (ultimo recurso del foco), no por tabulador. */}
        <h2 ref={titulo} tabIndex={-1} style={{ margin: 0 }} id={idTitulo}>{ES.ritual.titulo(openingId)}</h2>
        <span className="semilla" title={ES.ritual.semilla}>{seed}</span>
        {/* Solo en el resumen: antes, cuantas nuevas hay destriparia el sobre. */}
        {estado.fase === 'resumen' && <span className="etiqueta nueva">{ES.ritual.nuevas(nuevas)}</span>}
        {estado.fase !== 'resumen' && (
          <button
            type="button"
            onClick={() => { setSaltado(true); despachar({ tipo: 'saltar' }); }}
            style={{ marginLeft: 'auto' }}
          >
            {ES.ritual.saltar}
          </button>
        )}
        {estado.fase === 'resumen' && onAbrirOtro && (
          // aria-disabled y no disabled: mientras se pide, el boton conserva el
          // foco en vez de soltarlo a <body>.
          <button
            type="button"
            className="primario"
            aria-disabled={abriendo}
            onClick={() => { if (!abriendo) onAbrirOtro(); }}
            style={{ marginLeft: 'auto' }}
          >
            {ES.ritual.abrirOtro}
          </button>
        )}
      </div>
      <p className="sr-solo" aria-live="polite">{anuncio}</p>

      <div className="ritual-escena">
        {/* El estallido sale del marco del foco (quieto, a diferencia de la carta,
            que aun vuela y gira) o, en modo rapido, del hueco de la bandeja. */}
        <CapaDeEfectos
          disparo={disparo}
          nivel={ultimoNivel}
          cartaRevelada={() => focoRef.current?.querySelector('.foco-marco') ?? bandejaRef.current?.lastElementChild ?? null}
        />

        {sellado && set && (
          <>
            <Sobre juego={game} set={set} rasgando={estado.fase === 'rasgando'} onRasgar={() => despachar({ tipo: 'rasgar' })} />
            <p className="ritual-pista">{ES.ritual.pista}</p>
          </>
        )}

        {/* LA BANDEJA VA ANTES QUE EL FOCO Y EL MAZO EN EL DOM: lo exige la prueba
            de T-040 (mira el primer `button[aria-pressed]` de la region). A la
            vista va debajo del escenario: lo ordena `order` en CSS. */}
        <div className="ritual-bandeja" ref={bandejaRef}>
          {reveladas.map((carta, i) => (
            // El hueco da la perspectiva: con ella el rotateY se lee como un volteo
            // y no como un aplastamiento, y el `transform` del boton no la lleva
            // (la prueba de T-040 lee su m11). Por lo mismo, nada de `scale`.
            <div className="ritual-hueco" key={carta.slotIndex}>
              <motion.button
                layoutId={`carta-${openingId}-${carta.slotIndex}`}
                type="button"
                className="volteador revelada"
                aria-pressed={true}
                aria-label={carta.name}
                // La que llega desde el foco ya viene boca arriba: solo vuela.
                initial={reducido || focoPrevio.current === i ? false : { rotateY: 180 }}
                animate={{ rotateY: 0 }}
                transition={{
                  rotateY: { duration: niveles[i]! >= 4 ? 0.7 : 0.35 },
                  layout: { type: 'spring', stiffness: 240, damping: 30 },
                }}
              >
                <CartaConBrillo imagePath={carta.imagePath} nombre={carta.name} nivel={niveles[i]!} acabado={acabadoDe(carta.finish)} />
              </motion.button>
              <div className="ritual-pie">
                {/* El nombre ya lo dice el boton: aqui es solo para la vista. */}
                <span className="ritual-nombre" aria-hidden="true" title={carta.name}>{carta.name}</span>
                {carta.isNew && <span className="etiqueta nueva">{ES.ritual.nueva}</span>}
              </div>
            </div>
          ))}
        </div>

        {!sellado && (cartaFoco !== undefined || mazo.length > 0) && (
          <div className="ritual-escenario">
            {cartaFoco !== undefined && (
              <div
                className="ritual-foco"
                ref={focoRef}
                key={cartaFoco.slotIndex}
                data-nivel={nivelFoco}
                data-revelada={focoRevelado}
              >
                <div className="foco-marco">
                  <span className="foco-aura" aria-hidden="true" />
                  <span className="foco-destello" aria-hidden="true" />
                  <motion.button
                    layoutId={`carta-${openingId}-${cartaFoco.slotIndex}`}
                    type="button"
                    className={anticipando ? `volteador foco-carta anticipando nivel-${nivelFoco}` : 'volteador foco-carta'}
                    // La del foco cuenta como revelada en cuanto se voltea: los
                    // `aria-pressed="true"` siguen siendo las cartas reveladas.
                    aria-pressed={focoRevelado}
                    aria-label={focoRevelado ? cartaFoco.name : ES.ritual.sinRevelar(estado.reveladas + 1)}
                    // Sin `scale`, como en la bandeja: lo grande es la caja, y el
                    // transform solo lleva el giro (y el viaje de `layoutId`).
                    initial={{ rotateY: 180 }}
                    animate={{ rotateY: focoRevelado ? 0 : 180 }}
                    transition={{
                      rotateY: { duration: nivelFoco >= 4 ? 0.8 : 0.55, ease: [0.2, 0.7, 0.2, 1] },
                      layout: { type: 'spring', stiffness: 220, damping: 26 },
                    }}
                    onKeyDown={sinRepeticion}
                    onPointerDown={() => { deslizado.current = false; }}
                    // Solo en horizontal: con `touch-action: pan-y` el vertical es
                    // desplazar la pagina en un tactil, y con raton seria un gesto
                    // que nadie descubre.
                    onPanEnd={(_e, info) => {
                      if (Math.abs(info.offset.x) > PX_DESLIZAR) {
                        deslizado.current = true;
                        avanzarFoco();
                      }
                    }}
                    onClick={() => {
                      if (deslizado.current) {
                        deslizado.current = false;
                        return;
                      }
                      avanzarFoco();
                    }}
                  >
                    <span className="foco-cara foco-frente">
                      <CartaConBrillo
                        imagePath={cartaFoco.imagePath}
                        nombre={cartaFoco.name}
                        nivel={nivelFoco}
                        acabado={acabadoDe(cartaFoco.finish)}
                      />
                    </span>
                    <span className={`foco-cara foco-dorso reverso-${game.toLowerCase()}`} aria-hidden="true" />
                  </motion.button>
                </div>
                {/* Solo para la vista: el nombre lo dice el boton, y la rareza la region en vivo. */}
                <div className="foco-leyenda" aria-hidden="true">
                  {focoRevelado && (
                    <>
                      <span className="foco-nombre">{cartaFoco.name}</span>
                      <span className="foco-rareza">
                        <span className="foco-rareza-texto">
                          {etiquetas.get(cartaFoco.rarity) ?? cartaFoco.rarity.replace(/_/g, ' ')}
                        </span>
                        {cartaFoco.isNew && <span className="etiqueta nueva">{ES.ritual.nueva}</span>}
                      </span>
                      <span className="foco-pista">{mazo.length > 0 ? ES.ritual.pistaFoco : ES.ritual.pistaFinal}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {mazo.length > 0 && (
              <motion.div
                className="ritual-mazo"
                ref={mazoRef}
                layout="position"
                transition={{ type: 'spring', stiffness: 220, damping: 28 }}
              >
                {mazo.map((carta, i) => (
                  <motion.button
                    key={carta.slotIndex}
                    layoutId={`carta-${openingId}-${carta.slotIndex}`}
                    type="button"
                    className={`volteador reverso-${game.toLowerCase()}`}
                    aria-pressed={false}
                    aria-label={ES.ritual.sinRevelar(inicioMazo + i + 1)}
                    // Las de debajo son el canto del mazo, no controles: el lector
                    // de pantalla solo ve la de arriba. Durante la anticipacion
                    // pulsarla no hace nada: la maquina lo ignora.
                    aria-hidden={i !== 0 ? true : undefined}
                    disabled={i !== 0}
                    onKeyDown={sinRepeticion}
                    onClick={() => despachar({ tipo: 'siguiente' })}
                    style={{ zIndex: mazo.length - i, translate: `${i * 2}px ${i * -2}px` }}
                  />
                ))}
                {estado.reveladas === 0 && !anticipando && (
                  <p className="ritual-pista mazo-pista" aria-hidden="true">{ES.ritual.pistaMazo}</p>
                )}
              </motion.div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
