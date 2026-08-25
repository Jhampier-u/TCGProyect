import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameCode } from '@tcg/shared';
import { api, ApiError, type PackOpening } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { CardTile } from '../components/CardTile.js';

/**
 * Apertura de sobres.
 *
 * Esta pantalla es, deliberadamente, sobria: muestra las cartas de golpe. La
 * animacion de revelado carta a carta llega en una pasada posterior, sobre un
 * circuito que ya sabemos que funciona.
 */
export function Sobres() {
  const { token } = useAuth();
  const [game, setGame] = useState<GameCode>('YGO');
  const [setId, setSetId] = useState<number | null>(null);
  const [count, setCount] = useState(1);
  const [aperturas, setAperturas] = useState<PackOpening[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cliente = useQueryClient();

  const sets = useQuery({
    queryKey: ['sets', game],
    queryFn: () => api.sets(game).then((r) => r.data),
  });

  // Solo se ofrecen sets ABRIBLES. `poolSize` cuenta las impresiones con
  // `in_boosters = 1`: un set 100% promocional tiene 0 y abrirlo devolveria un
  // 422 (P-014). Mejor no ofrecerlo que dejar al usuario chocar con el error.
  const abribles = (sets.data ?? []).filter((s) => s.poolSize > 0);

  const abrir = useMutation({
    mutationFn: async () => {
      if (!token || setId === null) throw new Error('Falta sesion o set');
      return api.openPack(token, setId, count);
    },
    onSuccess: (r) => {
      setAperturas(r.data);
      setError(null);
      // La coleccion ha cambiado: se invalida para que al navegar alli no se
      // muestren datos viejos.
      void cliente.invalidateQueries({ queryKey: ['collection'] });
      void cliente.invalidateQueries({ queryKey: ['completion'] });
      void cliente.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : 'No se pudo abrir el sobre');
    },
  });

  return (
    <>
      <h1>Abrir sobres</h1>
      <p className="subtitulo">
        Las distribuciones de rareza son las reales del producto. Cada apertura queda
        registrada con su semilla y es reproducible.
      </p>

      <div className="filtros">
        <select
          value={game}
          onChange={(e) => { setGame(e.target.value as GameCode); setSetId(null); setAperturas([]); }}
        >
          <option value="MTG">Magic: The Gathering</option>
          <option value="YGO">Yu-Gi-Oh!</option>
          <option value="PTCG">Pokemon TCG</option>
        </select>

        <select
          value={setId ?? ''}
          onChange={(e) => setSetId(e.target.value ? Number(e.target.value) : null)}
          style={{ minWidth: 260 }}
        >
          <option value="">Elige un set...</option>
          {abribles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.poolSize} cartas)
            </option>
          ))}
        </select>

        <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
          <option value={1}>1 sobre</option>
          <option value={3}>3 sobres</option>
          <option value={24}>Caja (24)</option>
        </select>

        <button
          className="primario"
          onClick={() => abrir.mutate()}
          disabled={setId === null || abrir.isPending}
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

      {error && <div className="aviso error">{error}</div>}

      {aperturas.length === 0 && !abrir.isPending && (
        <div className="vacio">Elige un set y pulsa Abrir.</div>
      )}

      {aperturas.map((a) => (
        <section key={a.openingId}>
          <div className="sobre-cabecera">
            <h2 style={{ margin: 0 }}>Sobre #{a.openingId}</h2>
            <span className="semilla">semilla {a.seed}</span>
            <span className="etiqueta nueva">
              {a.cards.filter((c) => c.isNew).length} nuevas
            </span>
          </div>
          <div className="rejilla">
            {a.cards.map((c) => (
              <CardTile
                key={`${a.openingId}-${c.slotIndex}`}
                name={c.name}
                rarity={c.rarity}
                imagePath={c.imagePath}
                isNew={c.isNew}
                finish={c.finish}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
