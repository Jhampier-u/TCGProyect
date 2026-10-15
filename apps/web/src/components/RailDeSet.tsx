import { useId, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FacetCount, FacetCounts } from '../lib/api.js';
import { SIN_MARCA } from '../lib/api.js';
import type { ClaveFiltro, FiltrosCatalogo } from '../lib/filtros-url.js';
import { estiloDeTipo } from '../lib/tipos-pokemon.js';
import { ES } from '../i18n/es.js';

interface Props {
  /** Para que el boton que lo pliega en estrecho pueda apuntarlo (`aria-controls`). */
  id: string;
  /** Solo cuenta en pantallas estrechas: en ancho el rail siempre se ve. */
  abierto: boolean;
  facetas: FacetCounts | undefined;
  filtros: FiltrosCatalogo;
  /** Rarezas del juego en orden de `tier`, con su nombre legible. */
  rarezas: Array<{ code: string; label: string }>;
  conSesion: boolean;
  onAlternar: (clave: ClaveFiltro, valor: string) => void;
}

/**
 * El rail de estructura del set (T-093, D-5 del spec).
 *
 * ES A LA VEZ NAVEGACION, INFORMACION Y FILTRO. Cada fila dice cuantas cartas
 * hay de ese valor -- y, con sesion, cuantas tienes -- antes de pulsarla. Una
 * lista que dice "Planta 2 de 35" ya ha contestado la pregunta del criterio de
 * aceptacion; pulsarla solo la convierte en filtro.
 *
 * Cada fila es un `button` con `aria-pressed`: es un interruptor, y asi lo
 * anuncia un lector de pantalla. Pulsar la fila activa la quita.
 *
 * Las secciones salen de los datos: si un juego no trae tipos, no hay seccion
 * de tipos. Es lo que deja que Magic reutilice esto sin un `if (juego)`.
 */
export function RailDeSet({ id, abierto, facetas, filtros, rarezas, conSesion, onAlternar }: Props) {
  const clase = abierto ? 'rail rail-abierto' : 'rail';
  if (!facetas) return <nav id={id} className={`${clase} rail-cargando`} aria-label={ES.rail.titulo} aria-busy="true" />;

  const porTier = new Map(rarezas.map((r, i) => [r.code, i]));
  const rarezasOrdenadas = [...facetas.rarities].sort(
    (a, b) => (porTier.get(a.value) ?? 999) - (porTier.get(b.value) ?? 999),
  );
  const nombreDeRareza = new Map(rarezas.map((r) => [r.code, r.label]));

  const orden = ES.pokemon.ordenSupertipo as readonly string[];
  const supertipos = [...facetas.supertypes].sort((a, b) => orden.indexOf(a.value) - orden.indexOf(b.value));
  const marcas = [...facetas.marks].sort((a, b) => a.value.localeCompare(b.value));

  return (
    <nav id={id} className={clase} aria-label={ES.rail.titulo}>
      <Seccion titulo={ES.rail.tenencia}>
        {conSesion && facetas.ownedTotal !== null ? (
          <>
            <Fila
              activa={filtros.owned === 'no'}
              onPulsar={() => onAlternar('owned', 'no')}
              etiqueta={ES.rail.meFaltan}
              cuenta={facetas.total - facetas.ownedTotal}
            />
            <Fila
              activa={filtros.owned === 'yes'}
              onPulsar={() => onAlternar('owned', 'yes')}
              etiqueta={ES.rail.lasTengo}
              cuenta={facetas.ownedTotal}
            />
          </>
        ) : (
          <li className="rail-nota">
            {ES.catalogo.entraParaFaltan} <Link to="/acceso">{ES.catalogo.entrar}</Link>
          </li>
        )}
      </Seccion>

      {supertipos.length > 0 && (
        <Seccion titulo={ES.rail.categoria}>
          {supertipos.map((f) => (
            <FilaDeFaceta
              key={f.value}
              faceta={f}
              etiqueta={ES.pokemon.supertipo[f.value] ?? f.value}
              activa={filtros.supertype === f.value}
              onPulsar={() => onAlternar('supertype', f.value)}
            />
          ))}
        </Seccion>
      )}

      {facetas.types.length > 0 && (
        <Seccion titulo={ES.rail.tipo}>
          {facetas.types.map((f) => (
            <FilaDeFaceta
              key={f.value}
              faceta={f}
              etiqueta={ES.pokemon.tipo[f.value] ?? f.value}
              activa={filtros.type === f.value}
              onPulsar={() => onAlternar('type', f.value)}
              estilo={estiloDeTipo(f.value)}
              punto
            />
          ))}
        </Seccion>
      )}

      {rarezasOrdenadas.length > 0 && (
        <Seccion titulo={ES.rail.rareza}>
          {rarezasOrdenadas.map((f) => (
            <FilaDeFaceta
              key={f.value}
              faceta={f}
              etiqueta={nombreDeRareza.get(f.value) ?? f.value}
              activa={filtros.rarity === f.value}
              onPulsar={() => onAlternar('rarity', f.value)}
            />
          ))}
        </Seccion>
      )}

      {(marcas.length > 0 || facetas.withoutMark > 0) && (
        <Seccion titulo={ES.rail.marca}>
          {marcas.map((f) => (
            <FilaDeFaceta
              key={f.value}
              faceta={f}
              etiqueta={ES.pokemon.marca(f.value)}
              activa={filtros.mark === f.value}
              onPulsar={() => onAlternar('mark', f.value)}
            />
          ))}
          {facetas.withoutMark > 0 && (
            <Fila
              activa={filtros.mark === SIN_MARCA}
              onPulsar={() => onAlternar('mark', SIN_MARCA)}
              etiqueta={ES.rail.sinMarca}
              cuenta={facetas.withoutMark}
              nota={ES.rail.sinMarcaNota}
            />
          )}
        </Seccion>
      )}
    </nav>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  // Region con nombre: un lector de pantalla puede saltar a "Tipo", y la suite
  // E2E la encuentra por lo que es (T-095).
  const id = useId();
  return (
    <section className="rail-seccion" aria-labelledby={id}>
      <h2 className="rail-titulo" id={id}>{titulo}</h2>
      <ul className="rail-lista">{children}</ul>
    </section>
  );
}

function FilaDeFaceta(props: {
  faceta: FacetCount;
  etiqueta: string;
  activa: boolean;
  onPulsar: () => void;
  estilo?: CSSProperties | undefined;
  punto?: boolean;
}) {
  const { faceta, ...resto } = props;
  return <Fila {...resto} cuenta={faceta.count} tengo={faceta.owned} />;
}

function Fila(props: {
  etiqueta: string;
  cuenta: number;
  /** Cuantas tiene. Ausente o null: sin sesion, y no se pinta la barra. */
  tengo?: number | null;
  activa: boolean;
  onPulsar: () => void;
  estilo?: CSSProperties | undefined;
  punto?: boolean | undefined;
  nota?: string;
}) {
  const conTenencia = props.tengo !== undefined && props.tengo !== null;
  const proporcion = conTenencia && props.cuenta > 0 ? (props.tengo as number) / props.cuenta : 0;

  return (
    <li>
      <button
        type="button"
        className="rail-fila"
        aria-pressed={props.activa}
        onClick={props.onPulsar}
        style={props.estilo}
        title={props.nota}
      >
        {props.punto && <span className="rail-punto" aria-hidden="true" />}
        <span className="rail-etiqueta">{props.etiqueta}</span>
        <span className="rail-cifra">
          {conTenencia ? ES.rail.deTotal(props.tengo as number, props.cuenta) : props.cuenta}
        </span>
        {conTenencia && (
          <span className="rail-barra" aria-hidden="true">
            <span style={{ inlineSize: `${Math.round(proporcion * 100)}%` }} />
          </span>
        )}
      </button>
      {props.nota && <p className="rail-nota-fila">{props.nota}</p>}
    </li>
  );
}
