import type { DeckIssue, DeckIssueCode, DeckValidation, DeckZone, GameCode } from '@tcg/shared';
import {
  MTG_MAX_SIDE,
  MTG_MIN_MAIN,
  PTCG_DECK_SIZE,
  YGO_MAX_EXTRA,
  YGO_MAX_MAIN,
  YGO_MAX_SIDE,
  YGO_MIN_MAIN,
} from '@tcg/shared';

/**
 * Los textos se construyen a partir del CODIGO del problema, no del `message`
 * que manda el servidor. El codigo es estable y traducible; el texto del
 * servidor queda de respaldo para un codigo que esta interfaz no conozca.
 */
const TEXTOS: Record<DeckIssueCode, (i: DeckIssue) => string> = {
  main_too_small: (i) =>
    `Faltan cartas en el mazo principal: hay ${i.actual} y el minimo son ${i.allowed}`,
  main_too_large: (i) =>
    `Sobran cartas en el mazo principal: hay ${i.actual} y el maximo son ${i.allowed}`,
  extra_too_large: (i) => `El Extra Deck tiene ${i.actual} cartas y el maximo son ${i.allowed}`,
  side_too_large: (i) => `El Side Deck tiene ${i.actual} cartas y el maximo son ${i.allowed}`,
  too_many_copies: (i) => `"${i.cardName}" aparece ${i.actual} veces y el maximo son ${i.allowed}`,
  banned_card: (i) =>
    i.allowed === 0
      ? `"${i.cardName}" esta prohibida por la banlist vigente`
      : `"${i.cardName}" esta limitada a ${i.allowed} y hay ${i.actual}`,
  wrong_zone: (i) => `"${i.cardName}" no puede ir en esa zona`,
  unsupported_zone: (i) => `"${i.cardName}" esta en una zona que este juego no usa`,
};

export function textoDeProblema(issue: DeckIssue): string {
  const plantilla = TEXTOS[issue.code];
  return plantilla ? plantilla(issue) : issue.message;
}

/** Zonas que muestra cada juego, con su objetivo. */
export function zonasDe(
  game: GameCode,
): Array<{ zone: DeckZone; etiqueta: string; objetivo: string }> {
  if (game === 'YGO') {
    return [
      { zone: 'main', etiqueta: 'Main Deck', objetivo: `${YGO_MIN_MAIN}-${YGO_MAX_MAIN}` },
      { zone: 'extra', etiqueta: 'Extra Deck', objetivo: `0-${YGO_MAX_EXTRA}` },
      { zone: 'side', etiqueta: 'Side Deck', objetivo: `0-${YGO_MAX_SIDE}` },
    ];
  }
  if (game === 'MTG') {
    return [
      { zone: 'main', etiqueta: 'Mazo principal', objetivo: `${MTG_MIN_MAIN}+` },
      { zone: 'side', etiqueta: 'Sideboard', objetivo: `0-${MTG_MAX_SIDE}` },
    ];
  }
  return [{ zone: 'main', etiqueta: 'Mazo', objetivo: `${PTCG_DECK_SIZE}` }];
}

export interface DeckValidacionProps {
  validation: DeckValidation;
  sucio: boolean;
  guardando: boolean;
  errorGuardado: string | null;
  discrepancia: DeckValidation | null;
  onGuardar: () => void;
}

export function DeckValidacion(props: DeckValidacionProps) {
  const { validation, sucio, guardando, errorGuardado, discrepancia, onGuardar } = props;

  return (
    <>
      <div className="barra-guardar">
        <span className={`estado ${validation.valid ? 'valido' : 'invalido'}`}>
          {validation.valid
            ? 'Mazo valido'
            : `${validation.issues.length} ${
                validation.issues.length === 1 ? 'cosa' : 'cosas'
              } por resolver`}
        </span>
        <button onClick={onGuardar} disabled={!sucio || guardando}>
          {guardando ? 'Guardando...' : sucio ? 'Guardar' : 'Guardado'}
        </button>
      </div>

      {errorGuardado && <div className="aviso error">{errorGuardado}</div>}

      {discrepancia && (
        // No deberia ocurrir nunca: cliente y servidor corren el mismo modulo.
        // Si ocurre, manda el servidor y el usuario tiene que enterarse.
        <div className="aviso error">
          El servidor ha validado este mazo de forma distinta. Manda el servidor:{' '}
          {discrepancia.valid ? 'lo da por valido' : `${discrepancia.issues.length} problemas`}.
        </div>
      )}

      {validation.issues.length > 0 && (
        <ul className="problemas">
          {validation.issues.map((issue, i) => (
            <li key={`${issue.code}-${issue.oracleKey ?? i}`}>{textoDeProblema(issue)}</li>
          ))}
        </ul>
      )}
    </>
  );
}
