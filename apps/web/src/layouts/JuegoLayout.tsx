import { Outlet } from 'react-router-dom';
import type { GameCode } from '@tcg/shared';

/**
 * El contenedor de una seccion de juego (T-090).
 *
 * Su unico trabajo es poner `data-juego`, y eso basta: `tokens.css` cuelga de
 * ese atributo el acento y los colores de dorso de cada juego (T-088). El resto
 * de la interfaz no se entera de en que juego esta -- lee tokens -- que es
 * exactamente lo que hace posible compartir las primitivas (D-1 del spec).
 */
const ATRIBUTO: Record<GameCode, string> = { MTG: 'mtg', YGO: 'ygo', PTCG: 'ptcg' };

export function JuegoLayout({ juego }: { juego: GameCode }) {
  return (
    <div className="seccion-juego" data-juego={ATRIBUTO[juego]}>
      <Outlet context={{ juego }} />
    </div>
  );
}
