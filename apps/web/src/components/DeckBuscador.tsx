import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameCode } from '@tcg/shared';
import { api, imageUrl, type CardSummary } from '../lib/api.js';
import type { DraftCard } from '../lib/deck-draft.js';
import { SelectorDeSet } from './SelectorDeSet.js';
import { ES } from '../i18n/es.js';

export interface DeckBuscadorProps {
  /** Lo fija el mazo, no el usuario: es lo que evita un game_mismatch. */
  game: GameCode;
  onAnadir: (card: DraftCard) => void;
}

export function DeckBuscador({ game, onAnadir }: DeckBuscadorProps) {
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [set, setSet] = useState('');
  const [pidiendo, setPidiendo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cliente = useQueryClient();

  // Retardo para no consultar en cada tecla.
  useEffect(() => {
    const id = setTimeout(() => setBusqueda(texto), 300);
    return () => clearTimeout(id);
  }, [texto]);

  const sets = useQuery({
    queryKey: ['sets', game],
    queryFn: () => api.sets(game).then((r) => r.data),
  });

  const resultados = useQuery({
    queryKey: ['deck-buscador', game, set, busqueda],
    queryFn: () => api.cards({ game, set, q: busqueda, limit: 30 }).then((r) => r.data),
  });

  /**
   * Anadir pide el DETALLE de la impresion.
   *
   * `/api/cards` no trae `gameData`, y sin el no se puede validar la banlist de
   * Yu-Gi-Oh! ni distinguir la Energia Basica de la Especial.
   *
   * Va por `fetchQuery` y NO por `api.card` directamente: una llamada suelta no
   * pasa por la cache de React Query y volver a anadir la misma carta pedia el
   * detalle otra vez. `staleTime: Infinity` porque una carta ya cosechada es
   * inmutable. Verificado en el panel de red (P-026).
   */
  const anadir = async (carta: CardSummary) => {
    setPidiendo(carta.printId);
    setError(null);
    try {
      const detalle = (
        await cliente.fetchQuery({
          queryKey: ['card', carta.printId],
          queryFn: () => api.card(carta.printId),
          staleTime: Infinity,
        })
      ).data;
      onAnadir({
        printId: detalle.printId,
        cardId: detalle.cardId,
        oracleKey: detalle.oracleKey,
        name: detalle.name,
        typeLine: detalle.typeLine,
        gameData: detalle.gameData,
        setCode: detalle.setCode,
        collectorNumber: detalle.collectorNumber,
        rarity: detalle.rarity,
        imagePath: detalle.imagePath,
        owned: 0,
      });
    } catch {
      // El borrador queda intacto: no se anade una carta a medias.
      setError(`No se pudo anadir "${carta.name}". Intentalo otra vez.`);
    } finally {
      setPidiendo(null);
    }
  };

  return (
    <div className="editor-columna">
      <div className="filtros">
        <input
          placeholder="Buscar por nombre"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <SelectorDeSet
          etiqueta="Set"
          vacio="Todos los sets"
          valor={set}
          onCambio={setSet}
          opciones={(sets.data ?? []).map((s) => ({
            id: s.externalId,
            nombre: s.name,
            iconPath: s.iconPath,
          }))}
        />
      </div>

      {error && <div className="aviso error">{error}</div>}

      {resultados.isLoading && <div className="vacio">Buscando...</div>}
      {resultados.data?.length === 0 && <div className="vacio">Ninguna carta coincide.</div>}

      {(resultados.data ?? []).map((carta) => {
        const src = imageUrl(carta.imagePath);
        return (
          <div className="buscador-fila" key={carta.printId}>
            {src ? <img src={src} alt="" loading="lazy" /> : <span className="sin-imagen" />}
            <div>
              <div className="nombre">{carta.name}</div>
              <div className="tipo">
                {carta.typeLine ?? ES.buscador.sinTipo}{ES.simbolo.separador}{carta.setCode} {carta.collectorNumber}{ES.simbolo.separador}
                {/* T-061. Sin la rareza, tres impresiones de la misma carta en el
                    mismo set se ven IDENTICAS y no hay forma de elegir. Salio de
                    mirar las capturas de S023. */}
                {carta.rarity.replace(/_/g, ' ')}
              </div>
            </div>
            <button onClick={() => void anadir(carta)} disabled={pidiendo === carta.printId}>
              {pidiendo === carta.printId ? '...' : 'Anadir'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
