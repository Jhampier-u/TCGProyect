import type { GameCode } from '@tcg/shared';
import { FACET_PROFILES } from '@tcg/shared';
import type { CardSummary } from '../lib/api.js';
import { CELDAS } from './celdas.js';

interface Props {
  carta: CardSummary;
  juego: GameCode;
  /** Abre la ficha (T-094). */
  onAbrir: () => void;
  rareza: string;
  /** Con sesion se pinta la columna "Tienes". Sin ella, ni la columna. */
  conSesion: boolean;
}

/**
 * Una fila del catalogo «Consulta» (T-093; por perfil desde H9f).
 *
 * Es una fila de TABLA, no una tarjeta: son datos tabulares y un lector de
 * pantalla anuncia cada celda con su cabecera. Que celdas tiene, y en que
 * orden, lo dice el perfil del juego; como se pinta cada una, `celdas.tsx`.
 */
export function FilaDeCarta({ carta, juego, rareza, conSesion, onAbrir }: Props) {
  return (
    <tr className={carta.owned === false ? 'fila-carta fila-falta' : 'fila-carta'}>
      {FACET_PROFILES[juego].cells
        .filter((c) => conSesion || c !== 'owned')
        .map((c) => {
          const Celda = CELDAS[c];
          return <Celda key={c} carta={carta} rareza={rareza} onAbrir={onAbrir} />;
        })}
    </tr>
  );
}
