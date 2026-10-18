import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { GameCode } from '@tcg/shared';
import { imageUrl, type SetSummary } from '../../lib/api.js';
import { rutaDeArte } from '../../lib/arte-sobres.js';
import { ES } from '../../i18n/es.js';

/**
 * Talla del nombre segun su longitud. Los nombres van de "151" a 65 caracteres
 * ("THE CHRONICLES DECK: ... (All-Foil Edition)"), y a una sola talla los largos
 * ocupaban cuatro lineas y se montaban sobre la ilustracion. Los cortes estan
 * medidos con los 757 sets abribles en el navegador: ninguno pasa de tres lineas.
 */
export function tallaDelNombre(nombre: string): 'corto' | 'medio' | 'largo' | 'muy-largo' {
  if (nombre.length <= 18) return 'corto';
  if (nombre.length <= 28) return 'medio';
  if (nombre.length <= 42) return 'largo';
  return 'muy-largo';
}

interface Props {
  juego: GameCode;
  set: SetSummary;
  rasgando: boolean;
  onRasgar: () => void;
}

/**
 * El sobre sellado (H9e-2): el arte de su epoca, tenido con la paleta del set,
 * con su emblema (el icono, o la sigla en texto) y su nombre estampados.
 *
 * ES UN BOTON: Enter o Espacio lo rasgan, igual que un clic. El gesto de
 * arrastrar por el borde es una via MAS, no la unica, y por eso la tira es un
 * elemento aparte, decorativo para el lector de pantalla.
 *
 * Sin arte (la ilustracion todavia no ha llegado) o sin paleta (el comando no
 * se ha lanzado), hay reserva: nada se rompe sin las imagenes.
 */
export function Sobre({ juego, set, rasgando, onRasgar }: Props) {
  const reducido = useReducedMotion() ?? false;
  const arte = rutaDeArte(juego, set.artKey);
  // Los "iconos" de set de Yu-Gi-Oh! son fotos del producto (la caja, el sobre):
  // sobre el arte parecen pegatinas. En YGO, y en cualquier set sin icono, el
  // emblema es la sigla del set en texto.
  const icono = juego === 'YGO' ? null : imageUrl(set.iconPath);

  const estilo = {
    // Los tokens de dorso cuelgan de `data-juego` (lo pone el ritual); la segunda
    // reserva es por si el sobre se pinta fuera de el: sin ella, una variable sin
    // definir anula el fondo entero y el sobre sale transparente.
    '--paleta-1': set.palette?.primario ?? 'var(--dorso-1, var(--superficie))',
    '--paleta-2': set.palette?.secundario ?? 'var(--dorso-3, var(--superficie))',
    ...(arte ? { '--arte': `url("${arte}")` } : {}),
  } as CSSProperties;

  return (
    <div className="sobre-armazon" style={estilo}>
      <motion.div
        className="sobre-tira"
        aria-hidden="true"
        drag={rasgando ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onTap={onRasgar}
        onDragEnd={(_e, info) => {
          // Pasada la mitad (105 de 210), se rasga; antes, vuelve a su sitio sola.
          if (info.offset.x > 105) onRasgar();
        }}
        animate={reducido ? {} : rasgando ? { y: -60, rotate: 8, opacity: 0 } : { y: 0, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.45 }}
      />
      <motion.button
        type="button"
        className={arte ? 'sobre-sellado con-arte' : 'sobre-sellado'}
        data-art-key={set.artKey ?? undefined}
        aria-label={ES.ritual.rasgar(set.name)}
        onClick={() => {
          if (!rasgando) onRasgar();
        }}
        aria-disabled={rasgando}
        animate={reducido ? {} : rasgando ? { y: 140, opacity: 0.2 } : { y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <span className="sobre-marca">{ES.navegacion.marca}</span>
        {icono ? (
          <img className="sobre-icono" src={icono} alt="" />
        ) : (
          // Decorativa: el nombre accesible del boton ya dice el set. La talla
          // sale del largo de la sigla, para que de 2 a 6 o mas quepan en el circulo.
          <span
            className="sobre-icono sobre-sigla"
            aria-hidden="true"
            style={{ '--sigla-largo': Math.max(set.code.length, 1) } as CSSProperties}
          >
            {set.code}
          </span>
        )}
        <span className="sobre-nombre" data-talla={tallaDelNombre(set.name)}>
          {set.name}
        </span>
      </motion.button>
    </div>
  );
}
