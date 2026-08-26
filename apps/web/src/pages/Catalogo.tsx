import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GameCode } from '@tcg/shared';
import { api } from '../lib/api.js';
import { SelectorDeSet } from '../components/SelectorDeSet.js';
import { CardTile } from '../components/CardTile.js';

/**
 * Navegador de catalogo.
 *
 * La paginacion es por CURSOR, no por numero de pagina: la API usa keyset
 * (H3). Por eso la interfaz ofrece "cargar mas" y no una paginacion numerada —
 * con keyset no existe el concepto de "pagina 7".
 */
export function Catalogo() {
  const [game, setGame] = useState<GameCode>('YGO');
  const [set, setSet] = useState('');
  const [rarity, setRarity] = useState('');
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cursores, setCursores] = useState<Array<string | undefined>>([undefined]);

  const filtros = { game, set, rarity, q: busqueda };

  const sets = useQuery({
    queryKey: ['sets', game],
    queryFn: () => api.sets(game).then((r) => r.data),
  });

  const rarezas = useQuery({
    queryKey: ['rarezas', game],
    queryFn: () => api.rarities(game).then((r) => r.data),
  });

  // Una consulta por cursor acumulado: React Query cachea cada pagina, asi que
  // volver atras no vuelve a pedir nada al servidor.
  const paginas = useQuery({
    queryKey: ['cards', filtros, cursores],
    queryFn: async () => {
      const resultados = [];
      for (const cursor of cursores) {
        resultados.push(await api.cards({ ...filtros, cursor, limit: 40 }));
      }
      return resultados;
    },
  });

  const cartas = paginas.data?.flatMap((p) => p.data) ?? [];
  const siguiente = paginas.data?.[paginas.data.length - 1]?.nextCursor ?? null;

  const reiniciar = (cambio: () => void) => {
    cambio();
    setCursores([undefined]);
  };

  return (
    <>
      <h1>Catalogo</h1>
      <p className="subtitulo">
        Todo sale de nuestra base de datos. El navegador nunca habla con Scryfall,
        YGOPRODeck ni Pokemon TCG.
      </p>

      <div className="filtros">
        <select value={game} onChange={(e) => reiniciar(() => { setGame(e.target.value as GameCode); setSet(''); setRarity(''); })}>
          <option value="MTG">Magic: The Gathering</option>
          <option value="YGO">Yu-Gi-Oh!</option>
          <option value="PTCG">Pokemon TCG</option>
        </select>

        <SelectorDeSet
          etiqueta="Set"
          vacio="Todos los sets"
          valor={set}
          onCambio={(v) => reiniciar(() => setSet(v))}
          opciones={(sets.data ?? [])
            .filter((s) => s.poolSize > 0)
            .map((s) => ({
              id: s.externalId,
              nombre: s.name,
              iconPath: s.iconPath,
              detalle: String(s.poolSize),
            }))}
        />

        <select value={rarity} onChange={(e) => reiniciar(() => setRarity(e.target.value))}>
          <option value="">Todas las rarezas</option>
          {(rarezas.data ?? []).map((r) => (
            <option key={r.code} value={r.code}>{r.label}</option>
          ))}
        </select>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            reiniciar(() => setBusqueda(q));
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o texto..."
          />
          <button type="submit">Buscar</button>
        </form>
      </div>

      {paginas.isError && <div className="aviso error">No se pudo cargar el catalogo.</div>}
      {paginas.isPending && <div className="vacio">Cargando...</div>}
      {!paginas.isPending && cartas.length === 0 && (
        <div className="vacio">
          Ninguna carta coincide. Puede que el set no este ingestado todavia.
        </div>
      )}

      <div className="rejilla">
        {cartas.map((c) => (
          <CardTile
            key={c.printId}
            name={c.name}
            rarity={c.rarity}
            imagePath={c.imagePath}
            setCode={c.setCode}
            collectorNumber={c.collectorNumber}
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
