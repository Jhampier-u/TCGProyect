import { Link } from 'react-router-dom';
import type { GameCode } from '@tcg/shared';
import { ES } from '../i18n/es.js';

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
  atributo: string;
  ruta: string;
  nombre: string;
  /** Que hace distinto a este juego, en una linea. */
  resumen: string;
  listo: boolean;
}

const JUEGOS: Juego[] = [
  {
    codigo: 'PTCG', atributo: 'ptcg', ruta: '/ptcg',
    nombre: ES.juegos.ptcg.nombre, resumen: ES.juegos.ptcg.resumen, listo: true,
  },
  {
    codigo: 'MTG', atributo: 'mtg', ruta: '/mtg',
    nombre: ES.juegos.mtg.nombre, resumen: ES.juegos.mtg.resumen, listo: false,
  },
  {
    codigo: 'YGO', atributo: 'ygo', ruta: '/ygo',
    nombre: ES.juegos.ygo.nombre, resumen: ES.juegos.ygo.resumen, listo: false,
  },
];

export function Inicio() {
  return (
    <section className="inicio">
      <h1>{ES.inicio.titulo}</h1>
      <p className="inicio-entradilla">{ES.inicio.entradilla}</p>

      <ul className="inicio-juegos">
        {JUEGOS.map((j) => (
          <li key={j.codigo} data-juego={j.atributo}>
            {j.listo ? (
              <Link to={j.ruta} className="tarjeta-juego">
                <span className="tarjeta-juego-nombre">{j.nombre}</span>
                <span className="tarjeta-juego-resumen">{j.resumen}</span>
              </Link>
            ) : (
              /* Sin enlace y dicho: un enlace a una seccion que no existe es
                 peor que no ofrecerla. Magic y Yu-Gi-Oh! llegan despues de que
                 Pokemon valide el diseno (D-2 del spec). */
              <div className="tarjeta-juego tarjeta-juego-pendiente" aria-disabled="true">
                <span className="tarjeta-juego-nombre">{j.nombre}</span>
                <span className="tarjeta-juego-resumen">{j.resumen}</span>
                <span className="tarjeta-juego-pronto">{ES.inicio.enCamino}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
