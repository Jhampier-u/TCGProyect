import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GameCode } from '@tcg/shared';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { CardTile } from '../components/CardTile.js';

export function Coleccion() {
  const { token } = useAuth();
  const [game, setGame] = useState<GameCode>('YGO');
  const [cursores, setCursores] = useState<Array<string | undefined>>([undefined]);

  const resumen = useQuery({
    queryKey: ['summary'],
    queryFn: () => api.summary(token!).then((r) => r.data),
    enabled: Boolean(token),
  });

  const completitud = useQuery({
    queryKey: ['completion', game],
    queryFn: () => api.completion(token!, game).then((r) => r.data),
    enabled: Boolean(token),
  });

  const paginas = useQuery({
    queryKey: ['collection', game, cursores],
    queryFn: async () => {
      const out = [];
      for (const cursor of cursores) {
        out.push(await api.collection(token!, { game, cursor, limit: 40 }));
      }
      return out;
    },
    enabled: Boolean(token),
  });

  const entradas = paginas.data?.flatMap((p) => p.data) ?? [];
  const siguiente = paginas.data?.[paginas.data.length - 1]?.nextCursor ?? null;
  const conCartas = (completitud.data ?? []).filter((c) => c.owned > 0);

  return (
    <>
      <h1>Mi coleccion</h1>
      <p className="subtitulo">Todo lo que has obtenido abriendo sobres.</p>

      <div className="resumen">
        <div className="dato">
          <div className="valor">{resumen.data?.entries ?? '—'}</div>
          <div className="etiqueta-dato">cartas distintas</div>
        </div>
        <div className="dato">
          <div className="valor">{resumen.data?.copies ?? '—'}</div>
          <div className="etiqueta-dato">copias totales</div>
        </div>
        <div className="dato">
          <div className="valor">{resumen.data?.openings ?? '—'}</div>
          <div className="etiqueta-dato">sobres abiertos</div>
        </div>
      </div>

      <div className="filtros">
        <select
          value={game}
          onChange={(e) => { setGame(e.target.value as GameCode); setCursores([undefined]); }}
        >
          <option value="MTG">Magic: The Gathering</option>
          <option value="YGO">Yu-Gi-Oh!</option>
          <option value="PTCG">Pokemon TCG</option>
        </select>
      </div>

      <h2>Completitud por set</h2>
      {conCartas.length === 0 ? (
        <div className="aviso info">
          Aun no tienes ninguna carta de este juego. Abre un sobre para empezar.
        </div>
      ) : (
        <div className="completitud">
          {conCartas.map((c) => (
            <div className="fila-set" key={c.setExternalId}>
              <strong>{c.setCode}</strong>
              <div>
                <div style={{ fontSize: 12.5, marginBottom: 4 }}>{c.setName}</div>
                <div className="barra">
                  <div style={{ width: `${Math.round(c.ratio * 100)}%` }} />
                </div>
              </div>
              {/* El denominador son las cartas OBTENIBLES en sobre, no todas las
                  del set: prometer un 100% inalcanzable seria mentir (P-014). */}
              <div className="cifras">
                {c.owned}/{c.poolSize} · {(c.ratio * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      )}

      <h2>Cartas</h2>
      {paginas.isPending && <div className="vacio">Cargando...</div>}
      {!paginas.isPending && entradas.length === 0 && (
        <div className="vacio">Nada por aqui todavia.</div>
      )}

      <div className="rejilla">
        {entradas.map((e) => (
          <CardTile
            key={`${e.printId}-${e.finish}`}
            name={e.name}
            rarity={e.rarity}
            imagePath={e.imagePath}
            quantity={e.quantity}
            finish={e.finish}
          />
        ))}
      </div>

      {siguiente && (
        <div className="centrado">
          <button onClick={() => setCursores((c) => [...c, siguiente])} disabled={paginas.isFetching}>
            {paginas.isFetching ? 'Cargando...' : 'Cargar mas'}
          </button>
        </div>
      )}
    </>
  );
}
