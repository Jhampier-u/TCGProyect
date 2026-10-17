import { useEffect, useId, useReducer, useRef, useState, type FocusEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { GameCode } from '@tcg/shared';
import type { OpenedCard, SetSummary } from '../../lib/api.js';
import { acabadoDe } from '../../lib/rareza.js';
import { avanzar, iniciar, prepararSobre } from '../../lib/ritual.js';
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
export function Ritual({ game, cards, tiers, openingId, seed, set, rapido }: RitualProps) {
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
    // Sin set (la lista aun no ha llegado) no hay sobre que pintar: se rasga solo
    // en vez de dejar al usuario ante una escena vacia sin nada que pulsar.
    if ((rapido || !set) && estado.fase === 'sellado') despachar({ tipo: 'rasgar' });
    if (rapido && estado.fase === 'mazo' && (niveles[estado.reveladas] ?? 5) < 4) {
      const t = setTimeout(() => despachar({ tipo: 'siguiente' }), MS_RAPIDO);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [estado.fase, estado.reveladas, rapido, niveles, set]);

  // Cada revelado de nivel 3 o mas dispara la capa de efectos.
  const ultimoNivel = estado.reveladas > 0 ? niveles[estado.reveladas - 1]! : 1;
  useEffect(() => {
    if (estado.reveladas > 0 && ultimoNivel >= 3) setDisparo((d) => d + 1);
  }, [estado.reveladas, ultimoNivel]);

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
    const ultimaRevelada = bandejaRef.current?.lastElementChild;
    const destino = cima ?? (ultimaRevelada instanceof HTMLElement ? ultimaRevelada : null) ?? titulo.current;
    destino?.focus();
  }, [estado.fase, estado.reveladas]);

  const reveladas = orden.slice(0, estado.reveladas);
  const mazo = orden.slice(estado.reveladas);
  const nuevas = cards.filter((c) => c.isNew).length;
  const sellado = estado.fase === 'sellado' || estado.fase === 'rasgando';

  return (
    <section
      ref={seccion}
      className="sobre ritual"
      aria-labelledby={idTitulo}
      data-fase={estado.fase}
      onFocus={alEnfocar}
      onBlur={alDesenfocar}
    >
      <div className="sobre-cabecera">
        {/* tabIndex -1: enfocable por programa (ultimo recurso del foco), no por tabulador. */}
        <h2 ref={titulo} tabIndex={-1} style={{ margin: 0 }} id={idTitulo}>Sobre #{openingId}</h2>
        <span className="semilla" title={ES.ritual.semilla}>{seed}</span>
        <span className="etiqueta nueva">{ES.ritual.nuevas(nuevas)}</span>
        {estado.fase !== 'resumen' && (
          <button type="button" onClick={() => despachar({ tipo: 'saltar' })} style={{ marginLeft: 'auto' }}>
            {ES.ritual.saltar}
          </button>
        )}
      </div>

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
            <motion.button
              key={carta.slotIndex}
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
