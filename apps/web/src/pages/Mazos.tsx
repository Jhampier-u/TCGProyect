import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameCode } from '@tcg/shared';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { ES } from '../i18n/es.js';

export function Mazos() {
  const { token } = useAuth();
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [game, setGame] = useState<GameCode>('YGO');

  const mazos = useQuery({
    queryKey: ['decks'],
    queryFn: () => api.decks(token!).then((r) => r.data),
    enabled: Boolean(token),
  });

  const crear = useMutation({
    mutationFn: () => api.createDeck(token!, { game, name: nombre.trim() }),
    onSuccess: () => {
      setNombre('');
      void cliente.invalidateQueries({ queryKey: ['decks'] });
    },
  });

  const borrar = useMutation({
    mutationFn: (id: number) => api.deleteDeck(token!, id),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ['decks'] }),
  });

  return (
    <>
      <h1>{ES.navegacion.mazos}</h1>
      <p className="subtitulo">
        Un mazo referencia cartas del catalogo, no de tu coleccion: puedes construir lo que quieras
        y ver que te falta.
      </p>

      <div className="filtros">
        <input
          placeholder={ES.mazos.nombrePlaceholder}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <select value={game} onChange={(e) => setGame(e.target.value as GameCode)}>
          <option value="MTG">Magic: The Gathering</option>
          <option value="YGO">Yu-Gi-Oh!</option>
          <option value="PTCG">Pokemon TCG</option>
        </select>
        <button onClick={() => crear.mutate()} disabled={nombre.trim() === '' || crear.isPending}>
          Crear mazo
        </button>
      </div>

      {mazos.isLoading && <div className="vacio">Cargando...</div>}
      {mazos.data?.length === 0 && (
        <div className="vacio">Todavia no tienes mazos. Crea el primero ahi arriba.</div>
      )}

      <div className="mazo-lista">
        {(mazos.data ?? []).map((mazo) => (
          <div className="mazo-fila" key={mazo.id}>
            <div>
              <div className="nombre">
                <Link to={`/mazos/${mazo.id}`}>{mazo.name}</Link>
              </div>
              <div className="meta">
                {mazo.game}{ES.simbolo.separador}{ES.mazos.principal(mazo.counts.main)}
                {mazo.counts.extra > 0 && `${ES.simbolo.separador}${ES.mazos.extra(mazo.counts.extra)}`}
                {mazo.counts.side > 0 && `${ES.simbolo.separador}${ES.mazos.lateral(mazo.counts.side)}`}
              </div>
            </div>
            <Link to={`/mazos/${mazo.id}`}>Editar</Link>
            <button
              onClick={() => {
                // Borrar arrastra deck_cards por cascada y no tiene vuelta atras.
                if (confirm(`Borrar "${mazo.name}"? No se puede deshacer.`)) borrar.mutate(mazo.id);
              }}
            >
              Borrar
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
