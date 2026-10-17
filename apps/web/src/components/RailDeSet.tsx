import { useId, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GameCode } from '@tcg/shared';
import { FACET_PROFILES } from '@tcg/shared';
import type { FacetCount, FacetCounts } from '../lib/api.js';
import { valorDe, type ClaveFiltro, type FiltrosCatalogo } from '../lib/filtros-url.js';
import { PRESENTACION } from '../lib/facetas-web.js';
import { nombresDeRareza } from '../lib/rareza.js';
import { ES } from '../i18n/es.js';

interface Props {
  /** Para que el boton que lo pliega en estrecho pueda apuntarlo (`aria-controls`). */
  id: string;
  /** Solo cuenta en pantallas estrechas: en ancho el rail siempre se ve. */
  abierto: boolean;
  juego: GameCode;
  facetas: FacetCounts | undefined;
  filtros: FiltrosCatalogo;
  /** Rarezas del juego en orden de `tier`, con su nombre legible. */
  rarezas: Array<{ code: string; label: string }>;
  conSesion: boolean;
  onAlternar: (clave: ClaveFiltro, valor: string) => void;
}

/**
 * El rail de estructura del set (T-093, D-5 del spec H9b; por perfil desde H9f).
 *
 * ES A LA VEZ NAVEGACION, INFORMACION Y FILTRO. Cada fila dice cuantas cartas
 * hay de ese valor -- y, con sesion, cuantas tienes -- antes de pulsarla.
 *
 * Las secciones salen del PERFIL del juego, en su orden, entre la tenencia y la
 * rareza, que son de todos. Una seccion sin recuentos no se pinta. Cada fila es
 * un `button` con `aria-pressed`: un interruptor, y asi lo anuncia un lector.
 */
export function RailDeSet({ id, abierto, juego, facetas, filtros, rarezas, conSesion, onAlternar }: Props) {
  const clase = abierto ? 'rail rail-abierto' : 'rail';
  if (!facetas) return <nav id={id} className={`${clase} rail-cargando`} aria-label={ES.rail.titulo} aria-busy="true" />;

  const porTier = new Map(rarezas.map((r, i) => [r.code, i]));
  const rarezasOrdenadas = [...facetas.rarities].sort(
    (a, b) => (porTier.get(a.value) ?? 999) - (porTier.get(b.value) ?? 999),
  );
  const nombreDeRareza = nombresDeRareza(rarezas);

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

      {FACET_PROFILES[juego].facets.map((def) => {
        const filas = facetas.facetas[def.key] ?? [];
        if (filas.length === 0) return null;
        const p = PRESENTACION[def.key];
        return (
          <Seccion key={def.key} titulo={p.titulo(juego)}>
            {filas.map((f) => (
              <FilaDeFaceta
                key={f.value}
                faceta={f}
                etiqueta={p.etiqueta(f.value)}
                activa={valorDe(filtros, def.key) === f.value}
                onPulsar={() => onAlternar(def.key, f.value)}
                estilo={p.estilo?.(f.value)}
                punto={p.estilo !== undefined}
                nota={p.nota?.(f.value)}
              />
            ))}
            {p.notaDeSeccion && (
              <li><p className="rail-nota-fila">{p.notaDeSeccion}</p></li>
            )}
          </Seccion>
        );
      })}

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
  punto?: boolean | undefined;
  nota?: string | undefined;
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
  nota?: string | undefined;
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
