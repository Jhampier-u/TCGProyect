import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { GameCode } from '@tcg/shared';
import { imageUrl, type OpenedCard } from '../lib/api.js';

export interface PackRevealProps {
  game: GameCode;
  cards: OpenedCard[];
  /** code -> tier. Sirve para dejar la carta mas rara para el final. */
  tiers: Map<string, number>;
  openingId: number;
  seed: string;
}

/** Retardo entre cartas al revelar todas. */
const ESCALONADO_MS = 260;

/**
 * Orden de revelado: de menos a mas escaso.
 *
 * La gracia de abrir un sobre real esta en el ORDEN — primero lo previsible y la
 * carta buena al final. Por eso NO se respeta el orden de los slots: en
 * Yu-Gi-Oh! el "hit" ya es el ultimo, pero en Magic la rara esta en el slot 10 y
 * los comodines en el 12 y 13, asi que revelar por posicion destriparia el final.
 *
 * Se exporta aparte de la vista porque es la decision de diseno que hace que la
 * animacion funcione, y merece un test que no dependa de un navegador.
 */
export function ordenarPorEscasez<T extends { rarity: string; slotIndex: number }>(
  cards: readonly T[],
  tiers: Map<string, number>,
): T[] {
  return [...cards].sort((a, b) => {
    // Una rareza desconocida (insertada al vuelo con tier 50 por el contrato de
    // P-007) no debe colarse al final como si fuera lo mejor del sobre: sin
    // dato, se trata como la mas comun.
    const ta = tiers.get(a.rarity) ?? 0;
    const tb = tiers.get(b.rarity) ?? 0;
    if (ta !== tb) return ta - tb;
    return a.slotIndex - b.slotIndex;
  });
}

/**
 * Revelado de un sobre, carta a carta.
 *
 * `01_Producto.md` describe la apertura como el nucleo de la experiencia, y la
 * gracia de abrir un sobre real es el ORDEN: primero lo previsible, y la carta
 * buena al final. Por eso las cartas se ordenan por escasez ascendente en vez de
 * por su posicion en el sobre.
 *
 * Los reversos son formas dibujadas en CSS, deliberadamente genericas. No se
 * reproducen los reversos reales de cada juego: son obra protegida, y ademas
 * exigiria descargar y re-hospedar mas imagenes de terceros.
 */
export function PackReveal({ game, cards, tiers, openingId, seed }: PackRevealProps) {
  const sinMovimiento = useReducedMotion();
  const [reveladas, setReveladas] = useState<Set<number>>(new Set());

  const orden = useMemo(() => ordenarPorEscasez(cards, tiers), [cards, tiers]);

  // Cada apertura empieza de cero. Sin esto, abrir un segundo sobre mostraria
  // las cartas ya reveladas del anterior.
  useEffect(() => {
    // Con movimiento reducido no hay revelado progresivo: se muestra todo. La
    // animacion es adorno; el contenido no puede depender de ella.
    setReveladas(sinMovimiento ? new Set(cards.map((c) => c.slotIndex)) : new Set());
  }, [openingId, cards, sinMovimiento]);

  const revelar = useCallback((slotIndex: number) => {
    setReveladas((previas) => new Set(previas).add(slotIndex));
  }, []);

  const revelarTodas = useCallback(() => {
    orden.forEach((carta, i) => {
      setTimeout(() => revelar(carta.slotIndex), i * ESCALONADO_MS);
    });
  }, [orden, revelar]);

  const pendientes = orden.length - reveladas.size;
  const destacada = orden[orden.length - 1];
  const nuevas = cards.filter((c) => c.isNew).length;

  return (
    <section className="sobre">
      <div className="sobre-cabecera">
        <h2 style={{ margin: 0 }}>Sobre #{openingId}</h2>
        <span className="semilla" title="Semilla de la apertura: la hace reproducible">
          {seed}
        </span>
        <span className="etiqueta nueva">{nuevas} nuevas</span>
        {pendientes > 0 && (
          <button onClick={revelarTodas} style={{ marginLeft: 'auto' }}>
            Revelar las {pendientes} restantes
          </button>
        )}
      </div>

      <div className="rejilla">
        {orden.map((carta, indice) => (
          <CartaRevelable
            key={`${openingId}-${carta.slotIndex}`}
            carta={carta}
            game={game}
            revelada={reveladas.has(carta.slotIndex)}
            esDestacada={carta === destacada && orden.length > 1}
            posicion={indice}
            sinMovimiento={Boolean(sinMovimiento)}
            onRevelar={() => revelar(carta.slotIndex)}
          />
        ))}
      </div>
    </section>
  );
}

interface CartaRevelableProps {
  carta: OpenedCard;
  game: GameCode;
  revelada: boolean;
  esDestacada: boolean;
  posicion: number;
  sinMovimiento: boolean;
  onRevelar: () => void;
}

function CartaRevelable({
  carta,
  game,
  revelada,
  esDestacada,
  posicion,
  sinMovimiento,
  onRevelar,
}: CartaRevelableProps) {
  const src = imageUrl(carta.imagePath);
  const esFoil = carta.finish === 'foil';

  return (
    <div className="revelable">
      <motion.button
        type="button"
        className="volteador"
        onClick={revelada ? undefined : onRevelar}
        aria-label={revelada ? carta.name : `Carta ${posicion + 1} sin revelar`}
        // `disabled` no: una carta ya revelada sigue siendo enfocable para poder
        // leer su nombre con lector de pantalla.
        aria-pressed={revelada}
        initial={sinMovimiento ? false : { rotateY: 180, opacity: 0, y: 12 }}
        animate={{
          rotateY: revelada ? 0 : 180,
          opacity: 1,
          y: 0,
          // La carta destacada crece un poco al salir. Es el unico momento en
          // que la interfaz dice "esta importa".
          scale: revelada && esDestacada ? 1.04 : 1,
        }}
        transition={
          sinMovimiento
            ? { duration: 0 }
            : {
                rotateY: { type: 'spring', stiffness: 120, damping: 16 },
                opacity: { duration: 0.25, delay: posicion * 0.04 },
                y: { duration: 0.3, delay: posicion * 0.04 },
                scale: { type: 'spring', stiffness: 200, damping: 12, delay: 0.35 },
              }
        }
      >
        {/* Cara visible: la carta. */}
        <span className={`cara frente ${esFoil ? 'foil' : ''}`}>
          {src ? (
            <img src={src} alt={carta.name} draggable={false} />
          ) : (
            <span className="sin-imagen">{carta.name}</span>
          )}
          {esFoil && <span className="brillo" aria-hidden="true" />}
        </span>

        {/* Cara oculta: el reverso, dibujado en CSS. */}
        <span className={`cara reverso reverso-${game.toLowerCase()}`} aria-hidden="true">
          <span className="reverso-marca" />
        </span>
      </motion.button>

      <div className="carta-pie">
        {revelada ? (
          <motion.div
            initial={sinMovimiento ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: sinMovimiento ? 0 : 0.3 }}
          >
            <div className="carta-nombre" title={carta.name}>{carta.name}</div>
            <div className="carta-meta">
              <span className="etiqueta">{carta.rarity.replace(/_/g, ' ')}</span>
              <span>
                {esFoil && <span className="etiqueta foil">foil</span>}
                {carta.isNew && <span className="etiqueta nueva">nueva</span>}
              </span>
            </div>
          </motion.div>
        ) : (
          <div className="carta-nombre oculto">Sin revelar</div>
        )}
      </div>
    </div>
  );
}
