import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type FocusEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { GameCode } from '@tcg/shared';
import type { OpenedCard, SetSummary } from '../../lib/api.js';
import { acabadoDe } from '../../lib/rareza.js';
import { avanzar, iniciar, NIVEL_CON_ANTICIPACION, prepararSobre } from '../../lib/ritual.js';
import { CartaConBrillo } from './CartaConBrillo.js';
import { CapaDeEfectos } from './CapaDeEfectos.js';
import { Sobre } from './Sobre.js';
import { ES } from '../../i18n/es.js';

/** Duraciones del spec (seccion 7). */
const MS_RASGAR = 600;
const MS_ANTICIPACION = 1200;
const MS_RAPIDO = 140;

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
  const [estado, despachar] = useReducer(avanzar, undefined, () => iniciar(niveles, reducido));
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
    if (rapido && estado.fase === 'mazo' && (niveles[estado.reveladas] ?? 5) < 4) {
      const t = setTimeout(() => despachar({ tipo: 'siguiente' }), MS_RAPIDO);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [estado.fase, estado.reveladas, rapido, niveles, set, enEspera]);

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
    const cima = mazoRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    const enBandeja = bandejaRef.current?.querySelectorAll<HTMLButtonElement>('button');
    const ultimaRevelada = enBandeja && enBandeja.length > 0 ? enBandeja[enBandeja.length - 1] : undefined;
    const destino = cima ?? ultimaRevelada ?? titulo.current;
    destino?.focus();
  }, [estado.fase, estado.reveladas]);

  const reveladas = orden.slice(0, estado.reveladas);
  const mazo = orden.slice(estado.reveladas);
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
        <CapaDeEfectos disparo={disparo} nivel={ultimoNivel} />

        {sellado && set && (
          <>
            <Sobre juego={game} set={set} rasgando={estado.fase === 'rasgando'} onRasgar={() => despachar({ tipo: 'rasgar' })} />
            <p className="ritual-pista">{ES.ritual.pista}</p>
          </>
        )}

        {/* LA BANDEJA VA ANTES QUE EL MAZO EN EL DOM: lo exige la prueba de T-040. */}
        <div className="ritual-bandeja" ref={bandejaRef}>
          {reveladas.map((carta, i) => (
            // El hueco da la perspectiva: con ella el rotateY se lee como un volteo
            // y no como un aplastamiento, y el `transform` del boton no la lleva
            // (la prueba de T-040 lee su m11).
            <div className="ritual-hueco" key={carta.slotIndex}>
              <motion.button
                layoutId={`carta-${openingId}-${carta.slotIndex}`}
                type="button"
                className="volteador revelada"
                aria-pressed={true}
                aria-label={carta.name}
                initial={reducido ? false : { rotateY: 180 }}
                animate={{ rotateY: 0 }}
                transition={{ duration: niveles[i]! >= 4 ? 0.7 : 0.35 }}
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

        {!sellado && mazo.length > 0 && (
          <div className="ritual-mazo" ref={mazoRef}>
            {mazo.map((carta, i) => (
              <motion.button
                key={carta.slotIndex}
                layoutId={`carta-${openingId}-${carta.slotIndex}`}
                type="button"
                className={
                  i === 0 && estado.fase === 'anticipacion'
                    ? `volteador reverso-${game.toLowerCase()} anticipando nivel-${niveles[estado.reveladas]}`
                    : `volteador reverso-${game.toLowerCase()}`
                }
                aria-pressed={false}
                aria-label={ES.ritual.sinRevelar(estado.reveladas + i + 1)}
                // Las de debajo son el canto del mazo, no controles: el lector
                // de pantalla solo ve la de arriba.
                aria-hidden={i !== 0 ? true : undefined}
                disabled={i !== 0}
                onClick={() => despachar({ tipo: 'siguiente' })}
                style={{ zIndex: mazo.length - i, translate: `${i * 2}px ${i * -2}px` }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
