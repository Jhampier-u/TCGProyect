import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, imageUrl } from '../../lib/api.js';
import { agruparPorEpoca } from '../../lib/epocas.js';
import { ES } from '../../i18n/es.js';

/**
 * Portada de Pokemon (T-090).
 *
 * EL EJE ES LA EPOCA, y no es una eleccion estetica: en Pokemon las ventanas de
 * `pack_templates` coinciden con los bloques reales del juego -- Diamond &
 * Pearl, Black & White / XY, Sun & Moon, Sword & Shield, Scarlet & Violet -- que
 * es como un jugador tiene el catalogo en la cabeza. Medido en S033.
 *
 * En Magic ese mismo eje NO sirve: sus epocas son "clasico / con foil sin
 * mitica / Draft Booster / Play Booster", que describe el producto y no le dice
 * nada a nadie. Su seccion necesitara otro eje, y por eso esta portada es de
 * Pokemon y no un componente generico disfrazado.
 */
export function Portada() {
  const sets = useQuery({ queryKey: ['sets', 'PTCG'], queryFn: () => api.sets('PTCG') });
  const epocas = useQuery({ queryKey: ['eras', 'PTCG'], queryFn: () => api.eras('PTCG') });

  if (sets.isPending || epocas.isPending) {
    return <p className="vacio">{ES.portada.cargando}</p>;
  }
  if (sets.isError || epocas.isError) {
    return <p className="aviso error">{ES.portada.error}</p>;
  }

  const grupos = agruparPorEpoca(sets.data.data, epocas.data.data);
  const totalSets = sets.data.data.length;

  return (
    <section className="portada">
      <header className="portada-cabecera">
        <h1>{ES.juegos.ptcg.nombre}</h1>
        <p className="portada-entradilla">{ES.portada.entradilla(totalSets, grupos.length)}</p>
        <nav className="portada-accesos">
          <Link className="acceso-directo" to="/ptcg/catalogo">{ES.navegacion.catalogo}</Link>
          <Link className="acceso-directo" to="/sobres">{ES.navegacion.sobres}</Link>
          <Link className="acceso-directo" to="/coleccion">{ES.navegacion.coleccion}</Link>
        </nav>
      </header>

      {grupos.map(({ epoca, sets: deLaEpoca }) => (
        <section className="epoca" key={epoca.name}>
          <h2 className="epoca-titulo">
            {ES.portada.nombreDeEpoca(epoca.name)}
            <span className="epoca-meta">{ES.portada.cuantosSets(deLaEpoca.length)}</span>
          </h2>

          <ul className="epoca-sets">
            {deLaEpoca.map((s) => (
              <li key={s.id}>
                <Link className="ficha-set" to={`/ptcg/catalogo?set=${s.externalId}`}>
                  {/* La ruta del icono es LOCAL siempre: `imageUrl` la resuelve
                      contra nuestro propio almacen. Jamas el dominio del
                      origen, que es P-001. */}
                  {s.iconPath ? (
                    <img className="icono-set" src={imageUrl(s.iconPath) ?? ''} alt="" width={22} height={22} />
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
