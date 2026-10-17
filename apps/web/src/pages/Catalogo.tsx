import { useEffect, useId, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import type { GameCode } from '@tcg/shared';
import { isFacetKey } from '@tcg/shared';
import { api, imageUrl } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { consultaRarezas, consultaSets } from '../lib/consultas.js';
import {
  alternar, escribirFiltros, filtrosActivos, leerFiltros, limpiar, quitar,
  type ClaveFiltro, type FiltrosCatalogo,
} from '../lib/filtros-url.js';
import { PRESENTACION } from '../lib/facetas-web.js';
import { CABECERAS, celdasDe } from '../lib/celdas.js';
import { SelectorDeSet } from '../components/SelectorDeSet.js';
import { RailDeSet } from '../components/RailDeSet.js';
import { FilaDeCarta } from '../components/FilaDeCarta.js';
import { FichaDeCarta } from '../components/FichaDeCarta.js';
import { nombresDeRareza } from '../lib/rareza.js';
import { ES } from '../i18n/es.js';

/**
 * Filas por peticion. 60 llena una pantalla alta con margen y deja el set mas
 * grande de Pokemon (304 impresiones) en cinco peticiones.
 */
const POR_PAGINA = 60;

/**
 * Catalogo «Consulta» (T-093, D-3 del spec).
 *
 * Filas densas, el rail de estructura a la izquierda filtrando al pulsar y los
 * filtros activos como chips borrables de uno en uno. TODO el estado vive en la
 * URL (`filtros-url.ts`): se comparte con un enlace y el boton de atras deshace
 * el ultimo filtro.
 *
 * La paginacion sigue siendo keyset, asi que se ofrece "cargar mas" y no
 * paginas numeradas: con keyset no existe "la pagina 7".
 */
export function Catalogo() {
  const { juego } = useOutletContext<{ juego: GameCode }>();
  const { user, token, cargando } = useAuth();
  const [params, setParams] = useSearchParams();
  const filtros = leerFiltros(params, juego);
  const conSesion = user !== null && token !== null;

  // "Me faltan" sin sesion no tiene coleccion contra la que comparar: la API
  // contestaria 401. Se ignora en la consulta y el rail invita a entrar.
  const efectivos: FiltrosCatalogo = conSesion ? filtros : { ...filtros, owned: '' };

  const idRail = useId();
  const [railAbierto, setRailAbierto] = useState(false);

  const fijar = (siguientes: FiltrosCatalogo) => setParams(escribirFiltros(siguientes, juego));

  // La ficha abierta tambien va en la URL (T-094): se comparte con un enlace y
  // el boton de atras la cierra. Cambiar un filtro la cierra sola, porque
  // `escribirFiltros` no conoce esta clave.
  const cartaAbierta = Number(params.get('carta')) || null;
  const abrirCarta = (printId: number) =>
    setParams((p) => {
      const siguiente = new URLSearchParams(p);
      siguiente.set('carta', String(printId));
      return siguiente;
    });
  const cerrarCarta = () =>
    setParams((p) => {
      const siguiente = new URLSearchParams(p);
      siguiente.delete('carta');
      return siguiente;
    });
  const alternarFiltro = (clave: ClaveFiltro, valor: string) => fijar(alternar(filtros, clave, valor));

  const sets = useQuery(consultaSets(juego));
  const rarezas = useQuery(consultaRarezas(juego));

  // La clave lleva el usuario: los recuentos con tenencia son de alguien, y al
  // cambiar de sesion no puede servirse la cache del anterior.
  //
  // Y ESPERAN A QUE LA SESION ESTE VALIDADA. Sin eso, al cargar la pagina se
  // pedia todo dos veces -- una como anonimo y otra con usuario -- y durante
  // medio segundo el rail invitaba a iniciar sesion a quien ya la tenia.
  const facetas = useQuery({
    queryKey: ['facetas', juego, filtros.set, user?.id ?? null],
    queryFn: () => api.facets(juego, filtros.set || undefined, token).then((r) => r.data),
    enabled: !cargando,
  });

  // La clave de cache es la URL de los filtros efectivos: dos estados con la
  // misma URL son la misma pregunta.
  const claveDeFiltros = escribirFiltros(efectivos, juego).toString();
  const cartas = useInfiniteQuery({
    queryKey: ['cartas', juego, claveDeFiltros, user?.id ?? null],
    queryFn: ({ pageParam }) =>
      api.cards(
        {
          game: juego, set: efectivos.set, q: efectivos.q, rarity: efectivos.rarity,
          owned: efectivos.owned, facetas: efectivos.facetas, cursor: pageParam, limit: POR_PAGINA,
        },
        token,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima) => ultima.nextCursor ?? undefined,
    enabled: !cargando,
  });
  const celdas = celdasDe(juego, conSesion);

  const filas = cartas.data?.pages.flatMap((p) => p.data) ?? [];
  const setActual = sets.data?.find((s) => s.externalId === filtros.set) ?? null;
  const nombreDeRareza = useMemo(
    () => nombresDeRareza(rarezas.data ?? []),
    [rarezas.data],
  );

  return (
    <div className="consulta">
      <header className="consulta-cabecera">
        <div className="consulta-contexto">
          {setActual?.iconPath && (
            <img className="consulta-icono" src={imageUrl(setActual.iconPath) ?? ''} alt="" width={36} height={36} />
          )}
          <div>
            {/* Con un set en la URL y la lista aun en camino no se dice "todo el
                catalogo": seria verdad medio segundo y mentira despues. */}
            <h1>{setActual?.name ?? (filtros.set ? ES.simbolo.vacio : ES.catalogo.todoElJuego)}</h1>
            <p className="consulta-meta">
              {setActual && <>{setActual.code}{ES.simbolo.separador}{setActual.releasedAt ?? ES.simbolo.vacio}{ES.simbolo.separador}</>}
              {facetas.data && ES.catalogo.cartasDelContexto(facetas.data.total)}
            </p>
          </div>
          {facetas.data && facetas.data.ownedTotal !== null && facetas.data.total > 0 && (
            <Progreso tengo={facetas.data.ownedTotal} total={facetas.data.total} />
          )}
        </div>

        <div className="consulta-controles">
          <SelectorDeSet
            etiqueta={ES.catalogo.etiquetaSet}
            vacio={ES.catalogo.todosLosSets}
            valor={filtros.set}
            onCambio={(v) => fijar({ ...filtros, set: v })}
            opciones={(sets.data ?? [])
              .filter((s) => s.cardCount > 0)
              .map((s) => ({ id: s.externalId, nombre: s.name, iconPath: s.iconPath, detalle: s.code }))}
          />
          <Buscador
            inicial={filtros.q}
            onBuscar={(texto) => fijar({ ...filtros, q: texto })}
          />
          {/* Solo se ve en estrecho, donde el rail entero empujaria la tabla
              una pantalla y media hacia abajo. En ancho el rail siempre esta. */}
          <button
            type="button"
            className="alternar-rail"
            aria-expanded={railAbierto}
            aria-controls={idRail}
            onClick={() => setRailAbierto((a) => !a)}
          >
            {ES.catalogo.filtros(filtrosActivos(efectivos, juego).length)}
          </button>
        </div>
      </header>

      <div className="consulta-cuerpo">
        <RailDeSet
          id={idRail}
          abierto={railAbierto}
          juego={juego}
          facetas={facetas.data}
          filtros={efectivos}
          rarezas={rarezas.data ?? []}
          conSesion={conSesion}
          onAlternar={alternarFiltro}
        />

        <section className="consulta-resultados" aria-live="polite" aria-busy={cartas.isFetching && !cartas.isFetchingNextPage}>
          <Chips
            filtros={efectivos}
            juego={juego}
            nombreDeRareza={nombreDeRareza}
            onQuitar={(c) => fijar(quitar(filtros, c))}
            onLimpiar={() => fijar(limpiar(filtros))}
          />

          {cartas.isError && <p className="aviso error">{ES.catalogo.error}</p>}
          {cartas.isPending && <p className="vacio">{ES.catalogo.cargando}</p>}

          {!cartas.isPending && filas.length === 0 && !cartas.isError && (
            <div className="vacio">
              <p>{ES.catalogo.sinResultados}</p>
              {filtrosActivos(efectivos, juego).length > 0 && <p className="tenue">{ES.catalogo.sinResultadosAyuda}</p>}
            </div>
          )}

          {filas.length > 0 && (
            <>
              <p className="consulta-recuento">{ES.catalogo.mostrando(filas.length, cartas.hasNextPage)}</p>
              <table className="tabla-consulta">
                <thead>
                  <tr>
                    {celdas.map((c) => (
                      <th key={c} scope="col" className={CABECERAS[c].clase}>{CABECERAS[c].etiqueta}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((c) => (
                    <FilaDeCarta
                      key={c.printId}
                      carta={c}
                      celdas={celdas}
                      onAbrir={() => abrirCarta(c.printId)}
                      rareza={nombreDeRareza.get(c.rarity) ?? c.rarity}
                    />
                  ))}
                </tbody>
              </table>
            </>
          )}

          {cartaAbierta !== null && (
            <FichaDeCarta
              key={cartaAbierta}
              printId={cartaAbierta}
              owned={filas.find((f) => f.printId === cartaAbierta)?.owned ?? null}
              onCerrar={cerrarCarta}
            />
          )}

          {cartas.hasNextPage && (
            <div className="centrado">
              <button type="button" onClick={() => void cartas.fetchNextPage()} disabled={cartas.isFetchingNextPage}>
                {cartas.isFetchingNextPage ? ES.catalogo.cargandoMas : ES.catalogo.cargarMas}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Progreso({ tengo, total }: { tengo: number; total: number }) {
  const pct = Math.round((tengo / total) * 100);
  return (
    <div className="consulta-progreso">
      <span>{ES.catalogo.progreso(tengo, total)}</span>
      <progress value={tengo} max={total} aria-label={ES.catalogo.progreso(tengo, total)} />
      <span className="tenue">{pct}%</span>
    </div>
  );
}

/**
 * El campo de busqueda tiene estado propio mientras se escribe y solo toca la
 * URL al enviar: escribir "pikachu" no debe dejar siete entradas en el
 * historial. Si la URL cambia por fuera -- atras, un chip quitado -- el campo
 * la sigue.
 */
function Buscador({ inicial, onBuscar }: { inicial: string; onBuscar: (q: string) => void }) {
  const [texto, setTexto] = useState(inicial);
  useEffect(() => setTexto(inicial), [inicial]);

  return (
    <form
      className="buscador"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onBuscar(texto.trim());
      }}
    >
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={ES.catalogo.buscarPlaceholder}
        aria-label={ES.catalogo.buscarPlaceholder}
      />
      <button type="submit">{ES.catalogo.buscar}</button>
    </form>
  );
}

function Chips({
  filtros, juego, nombreDeRareza, onQuitar, onLimpiar,
}: {
  filtros: FiltrosCatalogo;
  juego: GameCode;
  nombreDeRareza: Map<string, string>;
  onQuitar: (clave: ClaveFiltro) => void;
  onLimpiar: () => void;
}) {
  const activos = filtrosActivos(filtros, juego);
  if (activos.length === 0) return null;

  // La etiqueta de un chip es la de su fila en el rail: el mismo nombre en los
  // dos sitios es lo que deja reconocer que filtro se esta quitando.
  const etiqueta = (clave: ClaveFiltro, valor: string): string => {
    if (isFacetKey(clave)) return PRESENTACION[clave].etiqueta(valor);
    switch (clave) {
      case 'rarity': return nombreDeRareza.get(valor) ?? valor;
      case 'owned': return valor === 'no' ? ES.rail.meFaltan : ES.rail.lasTengo;
      case 'q': return ES.catalogo.busqueda(valor);
      default: return valor;
    }
  };

  return (
    <div className="chips" role="group" aria-label={ES.catalogo.filtrosActivos}>
      {activos.map(({ clave, valor }) => {
        const texto = etiqueta(clave, valor);
        return (
          <button
            key={clave}
            type="button"
            className="chip"
            onClick={() => onQuitar(clave)}
            aria-label={ES.catalogo.quitarFiltro(texto)}
          >
            {texto} <span aria-hidden="true">{ES.simbolo.cerrar}</span>
          </button>
        );
      })}
      {activos.length > 1 && (
        <button type="button" className="chip-limpiar" onClick={onLimpiar}>
          {ES.catalogo.quitarTodos}
        </button>
      )}
    </div>
  );
}
