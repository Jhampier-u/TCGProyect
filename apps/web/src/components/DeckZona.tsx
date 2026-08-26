import type { DeckZone } from '@tcg/shared';
import type { Draft } from '../lib/deck-draft.js';

export interface DeckZonaProps {
  etiqueta: string;
  objetivo: string;
  zone: DeckZone;
  draft: Draft;
  /** true si esta zona tiene algun problema de validacion. */
  mal: boolean;
  onCantidad: (printId: number, zone: DeckZone, n: number) => void;
  onMover: (printId: number, from: DeckZone, to: DeckZone) => void;
}

export function DeckZona(props: DeckZonaProps) {
  const { etiqueta, objetivo, zone, draft, mal, onCantidad, onMover } = props;
  const filas = draft.filter((e) => e.zone === zone);
  const total = filas.reduce((n, e) => n + e.quantity, 0);

  return (
    <section className="zona">
      <div className="zona-cabecera">
        <strong>{etiqueta}</strong>
        <span className={`cifras ${mal ? 'mal' : ''}`}>
          {total} / {objetivo}
        </span>
      </div>

      {filas.length === 0 && <div className="vacio">Vacia.</div>}

      {filas.map((fila) => (
        <div className="linea-carta" key={`${fila.printId}-${fila.zone}`}>
          <div className="cantidad">
            <button
              aria-label={`Quitar una copia de ${fila.name}`}
              onClick={() => onCantidad(fila.printId, zone, fila.quantity - 1)}
            >
              -
            </button>
            <span className="valor">{fila.quantity}</span>
            <button
              aria-label={`Anadir una copia de ${fila.name}`}
              onClick={() => onCantidad(fila.printId, zone, fila.quantity + 1)}
            >
              +
            </button>
          </div>

          <div>
            <div>{fila.name}</div>
            <div className="tipo">
              {fila.setCode} {fila.collectorNumber}
              {/* RN-03: se avisa, no se impide. */}
              {fila.owned < fila.quantity && (
                <span className="no-poseida"> · tienes {fila.owned}</span>
              )}
            </div>
          </div>

          <div>
            <button onClick={() => onMover(fila.printId, zone, zone === 'side' ? 'main' : 'side')}>
              {zone === 'side' ? 'Al mazo' : 'Al Side'}
            </button>
            <button onClick={() => onCantidad(fila.printId, zone, 0)}>Quitar</button>
          </div>
        </div>
      ))}
    </section>
  );
}
