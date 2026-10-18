import { useQuery } from '@tanstack/react-query';
import { Link, useOutletContext } from 'react-router-dom';
import type { GameCode } from '@tcg/shared';
import { imageUrl } from '../lib/api.js';
import { consultaSets } from '../lib/consultas.js';
import { agruparPorAnio } from '../lib/anios.js';
import { SEGMENTO } from '../lib/juegos.js';
import { ES } from '../i18n/es.js';

/**
 * Portada de Magic y Yu-Gi-Oh!: los sets por anio de salida (H9f, F-8).
 *
 * Generica a proposito, al reves que la de Pokemon: el anio sirve igual a los
 * dos juegos. Cada set enlaza a su catalogo filtrado, como en Pokemon.
 */
export function PortadaPorAnio() {
  const { juego } = useOutletContext<{ juego: GameCode }>();
  const sets = useQuery(consultaSets(juego));

  if (sets.isPending) return <p className="vacio">{ES.portada.cargando}</p>;
  if (sets.isError) return <p className="aviso error">{ES.portada.error}</p>;

  const segmento = SEGMENTO[juego];
  // Un set sin cartas no tiene catalogo que ensenar; el selector del catalogo
  // tambien los aparta.
  const conCartas = sets.data.filter((s) => s.cardCount > 0);
  const grupos = agruparPorAnio(conCartas);

  return (
    <section className="portada">
      <header className="portada-cabecera">
        <h1>{ES.juegos[segmento].nombre}</h1>
        <p className="portada-entradilla">{ES.portadaAnio.entradilla(conCartas.length, grupos.length)}</p>
        <nav className="portada-accesos">
          <Link className="acceso-directo" to={`/${segmento}/catalogo`}>{ES.navegacion.catalogo}</Link>
          <Link className="acceso-directo" to="/sobres">{ES.navegacion.sobres}</Link>
          <Link className="acceso-directo" to="/coleccion">{ES.navegacion.coleccion}</Link>
        </nav>
      </header>

      {grupos.map(({ anio, sets: delAnio }) => (
        <section className="epoca" key={anio ?? 'sin-fecha'}>
          <h2 className="epoca-titulo">
            {anio ?? ES.portadaAnio.sinFecha}
            <span className="epoca-meta">{ES.portada.cuantosSets(delAnio.length)}</span>
          </h2>
          <ul className="epoca-sets">
            {delAnio.map((s) => (
              <li key={s.id}>
                {/* `encodeURIComponent`: los external_id de Yu-Gi-Oh! llevan
                    espacios ("THANK YOU PACK"). */}
                <Link className="ficha-set" to={`/${segmento}/catalogo?set=${encodeURIComponent(s.externalId)}`}>
                  {/* Ruta LOCAL siempre (P-001). */}
                  {s.iconPath ? (
                    <img className="icono-set" src={imageUrl(s.iconPath) ?? ''} alt="" width={22} height={22} loading="lazy" />
                  ) : (
                    <span className="icono-set icono-set-hueco" aria-hidden="true" />
                  )}
                  <span className="ficha-set-nombre">{s.name}</span>
                  <span className="ficha-set-meta">
                    {s.code}
                    {ES.simbolo.separador}
                    {s.releasedAt ?? ES.simbolo.vacio}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
