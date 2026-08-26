import { useState } from 'react';
import type { GameCode } from '@tcg/shared';
import { parseDeck, serializeDeck } from '@tcg/shared';
import { api, type UnresolvedLine } from '../lib/api.js';
import type { Draft } from '../lib/deck-draft.js';

export interface DeckTransferenciaProps {
  game: GameCode;
  draft: Draft;
  token: string;
  onReemplazar: (draft: Draft) => void;
}

const NOMBRE_FORMATO: Record<GameCode, string> = {
  MTG: 'lista de texto',
  YGO: 'fichero .ydk',
  PTCG: 'lista de PTCG Live',
};

export function DeckTransferencia({ game, draft, token, onReemplazar }: DeckTransferenciaProps) {
  const [abierto, setAbierto] = useState<'exportar' | 'importar' | null>(null);
  const [texto, setTexto] = useState('');
  const [pegado, setPegado] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState<{ entraron: number; faltan: UnresolvedLine[] } | null>(
    null,
  );

  /** Exportar NO va al servidor: el borrador ya lo tiene todo. */
  const exportar = () => {
    setTexto(
      serializeDeck(
        game,
        draft.map((e) => ({
          name: e.name,
          oracleKey: e.oracleKey,
          setCode: e.setCode,
          collectorNumber: e.collectorNumber,
          zone: e.zone,
          quantity: e.quantity,
          gameData: e.gameData,
        })),
      ),
    );
    setError(null);
    setInforme(null);
    setAbierto('exportar');
  };

  const importar = async () => {
    setError(null);
    setInforme(null);

    const { lines, warnings } = parseDeck(game, pegado);
    if (lines.length === 0) {
      setError(
        warnings.length > 0
          ? `No se ha reconocido ninguna carta. ${warnings.length} lineas no se entendieron.`
          : 'No se ha reconocido ninguna carta.',
      );
      return;
    }
    // Pegar una lista es traer un mazo, no anadirlo al que ya hay.
    if (draft.length > 0 && !confirm('Esto reemplaza el mazo actual. Continuar?')) return;

    setTrabajando(true);
    try {
      const { resolved, unresolved } = (await api.resolveDeck(token, game, lines)).data;
      onReemplazar(
        resolved.map((r) => ({
          printId: r.printId,
          cardId: r.cardId,
          oracleKey: r.oracleKey,
          name: r.name,
          typeLine: r.typeLine,
          gameData: r.gameData,
          setCode: r.setCode,
          collectorNumber: r.collectorNumber,
          rarity: r.rarity,
          imagePath: r.imagePath,
          owned: 0,
          zone: r.zone,
          quantity: r.quantity,
        })),
      );
      setInforme({
        entraron: resolved.reduce((n, r) => n + r.quantity, 0),
        faltan: unresolved,
      });
    } catch {
      // El borrador queda intacto si falla la red.
      setError('No se ha podido importar. Intentalo otra vez.');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section className="transferencia">
      <div className="transferencia-acciones">
        <button onClick={exportar}>Exportar</button>
        <button onClick={() => setAbierto(abierto === 'importar' ? null : 'importar')}>
          Importar
        </button>
        <span className="tipo">{NOMBRE_FORMATO[game]}</span>
      </div>

      {abierto === 'exportar' && (
        <textarea className="transferencia-texto" readOnly value={texto} rows={10} />
      )}

      {abierto === 'importar' && (
        <>
          <textarea
            className="transferencia-texto"
            placeholder={`Pega aqui tu ${NOMBRE_FORMATO[game]}`}
            value={pegado}
            rows={10}
            onChange={(e) => setPegado(e.target.value)}
          />
          <button onClick={() => void importar()} disabled={trabajando || pegado.trim() === ''}>
            {trabajando ? 'Importando...' : 'Importar al mazo'}
          </button>
        </>
      )}

      {error && <div className="aviso error">{error}</div>}

      {informe && (
        <div className="aviso info">
          Entraron {informe.entraron} cartas.
          {informe.faltan.length > 0 && (
            <>
              {' '}
              No estan en nuestro catalogo:
              <ul className="problemas">
                {informe.faltan.map((f, i) => (
                  <li key={`${f.externalId ?? f.name}-${i}`}>
                    {f.quantity} x {f.name ?? f.externalId}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
