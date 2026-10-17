import { motion, useReducedMotion, type MotionStyle } from 'framer-motion';
import type { GameCode } from '@tcg/shared';
import { imageUrl, type SetSummary } from '../../lib/api.js';
import { rutaDeArte } from '../../lib/arte-sobres.js';
import { ES } from '../../i18n/es.js';

interface Props {
  juego: GameCode;
  set: SetSummary;
  rasgando: boolean;
  onRasgar: () => void;
}

/**
 * El sobre sellado (H9e-2): el arte de su epoca, tenido con la paleta del set,
 * con su icono y su nombre estampados.
 *
 * ES UN BOTON: Enter o Espacio lo rasgan, igual que un clic. El gesto de
 * arrastrar por el borde es una via MAS, no la unica, y por eso la tira es un
 * elemento aparte, decorativo para el lector de pantalla.
 *
 * Sin arte (la ilustracion todavia no ha llegado) o sin paleta (el comando no
 * se ha lanzado), hay reserva: nada se rompe sin las imagenes.
 */
export function Sobre({ juego, set, rasgando, onRasgar }: Props) {
  const reducido = useReducedMotion();
  const arte = rutaDeArte(juego, set.artKey);
  const icono = imageUrl(set.iconPath);

  const estilo = {
    '--paleta-1': set.palette?.primario ?? 'var(--dorso-1)',
    '--paleta-2': set.palette?.secundario ?? 'var(--dorso-3)',
    ...(arte ? { '--arte': `url("${arte}")` } : {}),
  } as MotionStyle;

  return (
    <div className="sobre-armazon">
      <motion.div
        className="sobre-tira"
        aria-hidden="true"
        drag={rasgando ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={(_e, info) => {
          // Pasada la mitad, se rasga; antes, vuelve a su sitio sola.
          if (info.offset.x > 90) onRasgar();
        }}
        animate={reducido ? {} : rasgando ? { y: -60, rotate: 8, opacity: 0 } : { y: 0, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.45 }}
      />
      <motion.button
        type="button"
        className={arte ? 'sobre-sellado con-arte' : 'sobre-sellado'}
        style={estilo}
        data-art-key={set.artKey ?? ''}
        aria-label={ES.ritual.rasgar(set.name)}
        onClick={onRasgar}
        disabled={rasgando}
        animate={reducido ? {} : rasgando ? { y: 140, opacity: 0.2 } : { y: [0, -6, 0] }}
        transition={rasgando ? { duration: 0.6 } : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="sobre-marca">ProyectoTCG</span>
        {icono ? <img className="sobre-icono" src={icono} alt="" /> : <span className="sobre-icono" />}
        <span className="sobre-nombre">{set.name}</span>
      </motion.button>
    </div>
  );
}
