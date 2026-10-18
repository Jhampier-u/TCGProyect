import type { ReactElement, ReactNode } from 'react';
import type { CellKey } from '@tcg/shared';
import { imageUrl, type CardSummary } from '../lib/api.js';
import { CABECERAS } from '../lib/celdas.js';
import { estiloDeTipo } from '../lib/tipos-pokemon.js';
import { ES } from '../i18n/es.js';
import { Mana } from './Mana.js';
import { tieneSimbolos } from '../lib/mana.js';
import { estiloDeAtributo } from '../lib/colores-de-juego.js';
import { cifraDeCombate } from '../lib/ygo.js';
import { NivelYgo } from './NivelYgo.js';

/**
 * Como se pinta cada celda de la fila (H9f, F-2).
 *
 * El perfil dice QUE celdas tiene la fila de cada juego y en que orden; esto
 * dice COMO se pinta cada una. Es un `Record<CellKey, ...>`: una celda sin
 * pintor, o un pintor sin celda, no compila.
 */
export interface PropsDeCelda {
  carta: CardSummary;
  rareza: string;
  /** Abre la ficha (T-094). */
  onAbrir: () => void;
}

/**
 * Tope de la barra de PS. 400 y no el maximo del set: la barra tiene que
 * comparar cartas de SETS DISTINTOS. El maximo del catalogo entero es 380
 * (medido en S037).
 */
const PS_TOPE = 400;

function Td({ celda, children }: { celda: CellKey; children: ReactNode }) {
  return <td className={CABECERAS[celda].clase}>{children}</td>;
}

function Vacio() {
  return <span className="tenue">{ES.simbolo.vacio}</span>;
}

/** Un dato de la fila como texto, o null si no lo tiene. */
function texto(v: string | number | null | undefined): string | null {
  return v === null || v === undefined ? null : String(v);
}

/** Un dato numerico de la fila, o null si no lo es. */
function numero(v: string | number | null | undefined): number | null {
  return typeof v === 'number' ? v : null;
}

export const CELDAS: Readonly<Record<CellKey, (p: PropsDeCelda) => ReactElement>> = {
  number: ({ carta }) => <Td celda="number">{carta.collectorNumber}</Td>,

  card: ({ carta, onAbrir }) => {
    const src = imageUrl(carta.imagePath);
    return (
      <Td celda="card">
        <div className="celda-carta">
          <span className="carta-miniatura">
            {src ? (
              // Tamano declarado: sin el, cada imagen que llega empuja la tabla.
              <img src={src} alt="" loading="lazy" decoding="async" width={34} height={47} />
            ) : (
              <span className="miniatura-hueco" aria-hidden="true" />
            )}
          </span>
          <span className="carta-textos">
            {/* El nombre ES el boton: un boton aparte de "ver" en cada fila
                serian 300 botones identicos para un lector de pantalla. */}
            <button type="button" className="carta-nombre-fila" onClick={onAbrir}>
              {carta.name}
            </button>
            {carta.typeLine && <span className="carta-linea">{carta.typeLine}</span>}
          </span>
        </div>
      </Td>
    );
  },

  rarity: ({ rareza }) => <Td celda="rarity">{rareza}</Td>,

  owned: ({ carta }) => (
    <Td celda="owned">
      {carta.owned ? (
        <span className="tienes-si" role="img" aria-label={ES.catalogo.laTienes}>{ES.simbolo.check}</span>
      ) : (
        <span className="tienes-no" role="img" aria-label={ES.catalogo.teFalta}>{ES.simbolo.vacio}</span>
      )}
    </Td>
  ),

  ptcgType: ({ carta }) => {
    const t = texto(carta.facetas.type);
    return (
      <Td celda="ptcgType">
        {t ? <span className="chip-tipo" style={estiloDeTipo(t)}>{ES.pokemon.tipo[t] ?? t}</span> : <Vacio />}
      </Td>
    );
  },

  hp: ({ carta }) => {
    const hp = typeof carta.facetas.hp === 'number' ? carta.facetas.hp : null;
    return (
      <Td celda="hp">
        {hp !== null ? (
          <span className="ps" title={ES.catalogo.ps(hp)}>
            <span className="ps-cifra">{hp}</span>
            <span className="ps-barra" aria-hidden="true">
              <span style={{ inlineSize: `${Math.min(100, (hp / PS_TOPE) * 100)}%` }} />
            </span>
          </span>
        ) : (
          <Vacio />
        )}
      </Td>
    );
  },

  mark: ({ carta }) => <Td celda="mark">{texto(carta.facetas.mark) ?? <Vacio />}</Td>,

  manaCost: ({ carta }) => {
    const c = texto(carta.facetas.manaCost);
    return <Td celda="manaCost">{c && tieneSimbolos(c) ? <Mana coste={c} /> : <Vacio />}</Td>;
  },

  mtgKind: ({ carta }) => {
    const k = texto(carta.facetas.kind);
    return <Td celda="mtgKind">{k ? ES.facetas.kind[k] ?? k : <Vacio />}</Td>;
  },

  powerToughness: ({ carta }) => {
    const f = carta.facetas;
    const p = texto(f.power);
    const t = texto(f.toughness);
    const l = texto(f.loyalty);
    return (
      <Td celda="powerToughness">
        {p !== null && t !== null ? ES.ficha.fr(p, t) : l !== null ? ES.catalogo.lealtad(l) : <Vacio />}
      </Td>
    );
  },

  attribute: ({ carta }) => {
    const a = texto(carta.facetas.attribute);
    return (
      <Td celda="attribute">
        {a ? <span className="chip-tipo" style={estiloDeAtributo(a)}>{ES.facetas.attribute[a] ?? a}</span> : <Vacio />}
      </Td>
    );
  },

  levelRankLink: ({ carta }) => {
    const f = carta.facetas;
    return (
      <Td celda="levelRankLink">
        <NivelYgo frame={texto(f.frame)} level={numero(f.level)} linkVal={numero(f.linkVal)} />
      </Td>
    );
  },

  ygoType: ({ carta }) => {
    const k = texto(carta.facetas.kind);
    const t = ES.catalogo.tipoYgo(texto(carta.facetas.race), k ? ES.facetas.kind[k] ?? k : null);
    return <Td celda="ygoType">{t !== '' ? t : <Vacio />}</Td>;
  },

  atkDef: ({ carta }) => {
    const a = cifraDeCombate(numero(carta.facetas.atk));
    const d = cifraDeCombate(numero(carta.facetas.def));
    return (
      <Td celda="atkDef">
        {a === null && d === null ? <Vacio /> : ES.catalogo.atkDef(a ?? ES.simbolo.vacio, d ?? ES.simbolo.vacio)}
      </Td>
    );
  },
};
