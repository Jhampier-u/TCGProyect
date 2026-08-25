import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameCode } from '@tcg/shared';
import { api, ApiError, type PackOpening } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { PackReveal } from '../components/PackReveal.js';

/**
 * Apertura de sobres.
 *
 * Las cartas llegan boca abajo y se revelan una a una, ordenadas de menos a mas
 * escasa: la gracia de abrir un sobre real esta en dejar la buena para el final.
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

  // Los `tier` de rareza deciden el orden de revelado. Se reutiliza el endpoint
  // que ya existe en vez de anadir el tier a la respuesta de apertura: el dato
  // es del catalogo, no de la apertura.
  const rarezas = useQuery({
    queryKey: ['rarezas', game],
    queryFn: () => api.rarities(game).then((r) => r.data),
  });
  const tiers = new Map((rarezas.data ?? []).map((r) => [r.code, r.tier]));

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
        <div className="vacio">
          Elige un set y pulsa Abrir. Las cartas llegan boca abajo: pulsa cada una
          para darle la vuelta.
        </div>
      )}

      {aperturas.map((a) => (
        <PackReveal
          key={a.openingId}
          game={game}
          cards={a.cards}
          tiers={tiers}
          openingId={a.openingId}
          seed={a.seed}
        />
      ))}
    </>
  );
}
