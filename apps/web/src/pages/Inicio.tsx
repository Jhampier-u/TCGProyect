import { Link } from 'react-router-dom';
import type { GameCode } from '@tcg/shared';
import { ES } from '../i18n/es.js';
import { SEGMENTO } from '../lib/juegos.js';

/**
 * La raiz deja de ser un catalogo con filtro y pasa a ser una eleccion de juego
 * (T-090).
 *
 * Es el cambio que hace posible todo H9: mientras la raiz fuera un catalogo
 * comun con un desplegable de juego, ninguna seccion podia tener personalidad
 * propia porque no habia seccion.
 *
 * CADA TARJETA LLEVA SU `data-juego`, asi que el acento de cada una sale del
 * mismo sitio que el de su seccion. Se ve la diferencia antes de entrar.
 */
interface Juego {
  codigo: GameCode;
  listo: boolean;
}

/** El orden de las tarjetas. Ruta, `data-juego` y textos salen de `SEGMENTO`. */
const JUEGOS: Juego[] = [
  { codigo: 'PTCG', listo: true },
  { codigo: 'MTG', listo: true },
  { codigo: 'YGO', listo: true },
];

export function Inicio() {
  return (
    <section className="inicio">
      <h1>{ES.inicio.titulo}</h1>
      <p className="inicio-entradilla">{ES.inicio.entradilla}</p>

      <ul className="inicio-juegos">
        {JUEGOS.map((j) => {
          const segmento = SEGMENTO[j.codigo];
          const { nombre, resumen } = ES.juegos[segmento];
          return (
            <li key={j.codigo} data-juego={segmento}>
              {j.listo ? (
                <Link to={`/${segmento}`} className="tarjeta-juego">
                  <span className="tarjeta-juego-nombre">{nombre}</span>
                  <span className="tarjeta-juego-resumen">{resumen}</span>
                </Link>
              ) : (
                /* Sin enlace y dicho: un enlace a una seccion que no existe es
                   peor que no ofrecerla. Magic y Yu-Gi-Oh! llegan despues de que
                   Pokemon valide el diseno (D-2 del spec). */
                <div className="tarjeta-juego tarjeta-juego-pendiente" aria-disabled="true">
                  <span className="tarjeta-juego-nombre">{nombre}</span>
                  <span className="tarjeta-juego-resumen">{resumen}</span>
                  <span className="tarjeta-juego-pronto">{ES.inicio.enCamino}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
