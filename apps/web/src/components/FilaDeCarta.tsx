import type { CellKey } from '@tcg/shared';
import type { CardSummary } from '../lib/api.js';
import { CELDAS } from './celdas.js';

interface Props {
  carta: CardSummary;
  /** Las celdas visibles, en orden (`celdasDe`): las mismas que la cabecera. */
  celdas: readonly CellKey[];
  /** Abre la ficha (T-094). */
  onAbrir: () => void;
  rareza: string;
}

/**
 * Una fila del catalogo «Consulta» (T-093; por perfil desde H9f).
 *
 * Es una fila de TABLA, no una tarjeta: son datos tabulares y un lector de
 * pantalla anuncia cada celda con su cabecera. Que celdas tiene, y en que
 * orden, lo dice el perfil del juego; como se pinta cada una, `celdas.tsx`.
 */
export function FilaDeCarta({ carta, celdas, rareza, onAbrir }: Props) {
  return (
    <tr className={carta.owned === false ? 'fila-carta fila-falta' : 'fila-carta'}>
      {celdas.map((c) => {
        const Celda = CELDAS[c];
        return <Celda key={c} carta={carta} rareza={rareza} onAbrir={onAbrir} />;
      })}
    </tr>
  );
}
