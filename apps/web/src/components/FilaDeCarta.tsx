import type { CardSummary } from '../lib/api.js';
import { imageUrl } from '../lib/api.js';
import { estiloDeTipo } from '../lib/tipos-pokemon.js';
import { ES } from '../i18n/es.js';

/**
 * Tope de la barra de PS. 400 y no el maximo del set: la barra tiene que
 * comparar cartas de SETS DISTINTOS, y con una escala por set un 150 de 2003 y
 * un 150 de 2024 tendrian barras de distinto largo. El maximo del catalogo
 * entero es 380 (medido en S037).
 */
const PS_TOPE = 400;

interface Props {
  carta: CardSummary;
  rareza: string;
  /** Con sesion se pinta la columna "Tienes". Sin ella, ni la columna. */
  conSesion: boolean;
}

/**
 * Una fila del catalogo «Consulta» (T-093, D-3 del spec).
 *
 * Filas densas con las cifras alineadas, el PS como barra comparable y el tipo
 * como chip de color. Es una fila de TABLA, no una tarjeta: son datos tabulares
 * y un lector de pantalla anuncia cada celda con su cabecera.
 */
export function FilaDeCarta({ carta, rareza, conSesion }: Props) {
  const src = imageUrl(carta.imagePath);
  const tipo = carta.elemType ? ES.pokemon.tipo[carta.elemType] ?? carta.elemType : null;

  return (
    <tr className={carta.owned === false ? 'fila-carta fila-falta' : 'fila-carta'}>
      <td className="col-numero">{carta.collectorNumber}</td>
      <td className="col-carta">
        <div className="celda-carta">
          <span className="carta-miniatura">
            {src ? (
              // Tamano declarado: sin el, cada imagen que llega empuja la tabla y
              // la fila que estabas leyendo se mueve.
              <img src={src} alt="" loading="lazy" decoding="async" width={34} height={47} />
            ) : (
              <span className="miniatura-hueco" aria-hidden="true" />
            )}
          </span>
          <span className="carta-textos">
            <span className="carta-nombre-fila">{carta.name}</span>
            {carta.typeLine && <span className="carta-linea">{carta.typeLine}</span>}
          </span>
        </div>
      </td>
      <td className="col-tipo">
        {tipo ? (
          <span className="chip-tipo" style={estiloDeTipo(carta.elemType)}>{tipo}</span>
        ) : (
          <span className="tenue">{ES.simbolo.vacio}</span>
        )}
      </td>
      <td className="col-ps">
        {carta.hp !== null ? (
          <span className="ps" title={ES.catalogo.ps(carta.hp)}>
            <span className="ps-cifra">{carta.hp}</span>
            <span className="ps-barra" aria-hidden="true">
              <span style={{ inlineSize: `${Math.min(100, (carta.hp / PS_TOPE) * 100)}%` }} />
            </span>
          </span>
        ) : (
          <span className="tenue">{ES.simbolo.vacio}</span>
        )}
      </td>
      <td className="col-rareza">{rareza}</td>
      <td className="col-marca">{carta.regMark ?? <span className="tenue">{ES.simbolo.vacio}</span>}</td>
      {conSesion && (
        <td className="col-tienes">
          {carta.owned ? (
            <span className="tienes-si" role="img" aria-label={ES.catalogo.laTienes}>{ES.simbolo.check}</span>
          ) : (
            <span className="tienes-no" role="img" aria-label={ES.catalogo.teFalta}>{ES.simbolo.vacio}</span>
          )}
        </td>
      )}
    </tr>
  );
}
