import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameCode } from '@tcg/shared';
import { api, ApiError, type PackOpening, type SetSummary } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { consultaRarezas, consultaSets } from '../lib/consultas.js';
import { Ritual } from '../components/apertura/Ritual.js';
import { SelectorDeSet } from '../components/SelectorDeSet.js';
import { ES } from '../i18n/es.js';

/**
 * Apertura de sobres.
 *
 * Las cartas llegan boca abajo y se revelan una a una, ordenadas de menos a mas
 * escasa: la gracia de abrir un sobre real esta en dejar la buena para el final.
 */
/** Lo que se pidio al abrir: con ello se repite ("Abrir otro") y se viste el sobre. */
interface Peticion {
  /** El juego de la peticion: el ritual se pinta con el, no con el del selector. */
  game: GameCode;
  setId: number;
  count: number;
  /** El set tal y como era al abrir: cambiar luego el selector no reviste el sobre. */
  set: SetSummary | null;
}

interface Apertura {
  apertura: PackOpening;
  peticion: Peticion;
}

export function Sobres() {
  const { token } = useAuth();
  const [game, setGame] = useState<GameCode>('YGO');
  const [setId, setSetId] = useState<number | null>(null);
  const [count, setCount] = useState(1);
  const [aperturas, setAperturas] = useState<Apertura[]>([]);
  /** Indices de los sobres que ya llegaron al resumen. */
  const [terminados, setTerminados] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  /** La peticion que fallo: "Reintentar" la repite tal cual (juego, set, cantidad). */
  const [fallida, setFallida] = useState<Peticion | null>(null);
  const cliente = useQueryClient();
  // El juego vigente, para la respuesta que llegue tarde: si el usuario cambio
  // de juego mientras se abria, ese lote ya no es de esta pantalla.
  const juegoActual = useRef(game);
  useLayoutEffect(() => { juegoActual.current = game; }, [game]);

  const sets = useQuery({
    ...consultaSets(game),
  });

  // Los `tier` de rareza deciden el orden de revelado. Se reutiliza el endpoint
  // que ya existe en vez de anadir el tier a la respuesta de apertura: el dato
  // es del catalogo, no de la apertura.
  const rarezas = useQuery({
    ...consultaRarezas(game),
  });
  const tiers = useMemo(() => new Map((rarezas.data ?? []).map((r) => [r.code, r.tier])), [rarezas.data]);
  const etiquetas = useMemo(() => new Map((rarezas.data ?? []).map((r) => [r.code, r.label])), [rarezas.data]);

  // Solo se ofrecen sets ABRIBLES, y hacen falta las dos condiciones:
  //
  //   `poolSize > 0`  cuenta las impresiones con `in_boosters = 1`: un set 100%
  //                   promocional tiene 0 y abrirlo devolveria un 422 (P-014).
  //   `isOpenable`    dice si el set es un PRODUCTO de sobres. Una caja de
  //                   Structure Decks tiene 153 impresiones y pool de sobra, y
  //                   aun asi no se abre en sobres (T-069, P-033).
  //
  // Mejor no ofrecerlo que dejar al usuario chocar con el error.
  const abribles = (sets.data ?? []).filter((s) => s.poolSize > 0 && s.isOpenable);
  // El set del sobre: su arte, su paleta y su icono visten el sobre sellado.
  const setElegido = abribles.find((s) => s.id === setId) ?? null;

  // El sobre en curso es el primero sin terminar: los de despues esperan sellados
  // (spec, seccion 7). Saltar uno de los de despues no adelanta a los de en medio.
  let activo = 0;
  while (terminados.has(activo)) activo += 1;

  // ------------------------------------------------- el foco al abrir otro lote
  //
  // Al llegar el lote nuevo, el foco va al primer sobre: a su sobre sellado, o a
  // su titulo si no lo hay (movimiento reducido). Solo si el foco estaba en el
  // boton que lo pidio o se habia perdido en <body> (el "Abrir otro" se va con
  // el lote viejo); si el usuario se fue a otra parte, no se le mueve.
  const botonAbrir = useRef<HTMLButtonElement>(null);
  const zonaSobres = useRef<HTMLDivElement>(null);
  const enfocarLote = useRef(false);
  useEffect(() => {
    if (!enfocarLote.current || aperturas.length === 0) return;
    enfocarLote.current = false;
    const activoDom = document.activeElement;
    const desdeElBoton =
      activoDom === null || activoDom === document.body || activoDom === botonAbrir.current;
    if (!desdeElBoton) return;
    const primero = zonaSobres.current?.querySelector('section');
    const destino =
      primero?.querySelector<HTMLElement>('.sobre-sellado') ?? primero?.querySelector<HTMLElement>('h2');
    destino?.focus();
  }, [aperturas]);

  const pedir = (p: Peticion) => {
    enfocarLote.current = true;
    abrir.mutate(p);
  };

  const abrir = useMutation({
    mutationFn: async (p: Peticion) => {
      if (!token) throw new Error('Falta sesion');
      return api.openPack(token, p.setId, p.count);
    },
    onSuccess: (r, peticion) => {
      if (peticion.game !== juegoActual.current) return;
      setAperturas(r.data.map((apertura) => ({ apertura, peticion })));
      setTerminados(new Set());
      setError(null);
      setFallida(null);
      // La coleccion ha cambiado: se invalida para que al navegar alli no se
      // muestren datos viejos.
      void cliente.invalidateQueries({ queryKey: ['collection'] });
      void cliente.invalidateQueries({ queryKey: ['completion'] });
      void cliente.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (e: unknown, peticion) => {
      if (peticion.game !== juegoActual.current) return;
      setError(e instanceof ApiError ? e.message : 'No se pudo abrir el sobre');
      setFallida(peticion);
    },
  });

  return (
    <>
      <h1>{ES.navegacion.sobres}</h1>
      <p className="subtitulo">
        Las distribuciones de rareza son las reales del producto. Cada apertura queda
        registrada con su semilla y es reproducible.
      </p>

      <div className="filtros">
        <select
          aria-label={ES.semantica.juego}
          value={game}
          onChange={(e) => {
            // El error de otro juego se va con el: reintentarlo abriria un sobre
            // que la guarda de juego descartaria al llegar.
            setGame(e.target.value as GameCode); setSetId(null); setAperturas([]);
            setError(null); setFallida(null);
          }}
        >
          <option value="MTG">Magic: The Gathering</option>
          <option value="YGO">Yu-Gi-Oh!</option>
          <option value="PTCG">Pokemon TCG</option>
        </select>

        <SelectorDeSet
          etiqueta="Set"
          vacio="Elige un set..."
          valor={setId === null ? '' : String(setId)}
          onCambio={(v) => setSetId(v ? Number(v) : null)}
          opciones={abribles.map((s) => ({
            id: String(s.id),
            nombre: s.name,
            iconPath: s.iconPath,
            detalle: `${s.poolSize} cartas`,
          }))}
        />

        <select
          aria-label={ES.semantica.cantidadDeSobres}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        >
          <option value={1}>1 sobre</option>
          <option value={3}>3 sobres</option>
          <option value={24}>Caja (24)</option>
        </select>

        <button
          ref={botonAbrir}
          className="primario"
          onClick={() => {
            if (setId !== null) pedir({ game, setId, count, set: setElegido });
          }}
          // Sin las rarezas no se sabe en que orden revelar ni que anunciar: el
          // sobre saldria en orden de slot y sin anticipacion. Se espera a tenerlas.
          disabled={setId === null || abrir.isPending || !rarezas.isSuccess}
        >
          {abrir.isPending ? 'Abriendo...' : 'Abrir'}
        </button>
      </div>

      {sets.data && abribles.length === 0 && (
        <div className="aviso info">
          No hay ningun set abrible de este juego. Hace falta ingestarlo primero,
          o todas sus cartas estan marcadas como no obtenibles en sobre.
        </div>
      )}

      {rarezas.isError && (
        <div className="aviso error">
          {ES.ritual.rarezasSinCargar}{' '}
          <button type="button" onClick={() => void rarezas.refetch()}>{ES.ritual.reintentar}</button>
        </div>
      )}

      {error && (
        <div className="aviso error">
          {error}
          {fallida && (
            <>
              {' '}
              {/* aria-disabled y no disabled: mientras se repite, conserva el foco. */}
              <button
                type="button"
                aria-disabled={abrir.isPending}
                onClick={() => { if (!abrir.isPending) pedir(fallida); }}
              >
                {ES.ritual.reintentar}
              </button>
            </>
          )}
        </div>
      )}

      {aperturas.length === 0 && !abrir.isPending && (
        <div className="vacio">
          Elige un set y pulsa Abrir. Las cartas llegan boca abajo: pulsa cada una
          para darle la vuelta.
        </div>
      )}

      {/* El primer sobre, ritual completo; del segundo en adelante, modo rapido
          (spec, seccion 7), y de uno en uno: cada sobre espera sellado a que
          termine el anterior. Sin tiers no se pinta nada: el orden saldria mal y
          quedaria congelado para todo el ritual. */}
      <div ref={zonaSobres}>
        {tiers.size > 0 &&
          aperturas.map(({ apertura: a, peticion }, i) => (
            <Ritual
              key={a.openingId}
              game={peticion.game}
              cards={a.cards}
              tiers={tiers}
              etiquetas={etiquetas}
              openingId={a.openingId}
              seed={a.seed}
              set={peticion.set}
              rapido={i > 0}
              enEspera={i > activo}
              onTerminado={() => setTerminados((t) => new Set(t).add(i))}
              // Solo con el lote ENTERO terminado: abrir otro descarta los sobres
              // que aun esperasen sellados.
              onAbrirOtro={
                i === aperturas.length - 1 && terminados.size === aperturas.length
                  ? () => pedir(peticion)
                  : undefined
              }
              abriendo={abrir.isPending}
            />
          ))}
      </div>
    </>
  );
}
