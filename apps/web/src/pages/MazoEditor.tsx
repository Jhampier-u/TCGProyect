import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type DeckDetail } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useDeckEditor } from '../lib/use-deck-editor.js';
import { DeckBuscador } from '../components/DeckBuscador.js';
import { DeckZona } from '../components/DeckZona.js';
import { DeckValidacion, zonasDe } from '../components/DeckValidacion.js';
import { DeckTransferencia } from '../components/DeckTransferencia.js';

export function MazoEditor() {
  const { id } = useParams();
  const { token } = useAuth();
  const deckId = Number(id);

  const mazo = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => api.deck(token!, deckId).then((r) => r.data),
    enabled: Boolean(token) && Number.isInteger(deckId),
    retry: false,
  });

  if (mazo.isLoading) return <div className="vacio">Cargando el mazo...</div>;
  if (mazo.isError || !mazo.data) {
    // La API responde 404 tanto si no existe como si es de otro usuario (D6).
    return (
      <div className="vacio">
        Este mazo no existe. <Link to="/mazos">Volver a mis mazos</Link>
      </div>
    );
  }

  // `key` remonta el editor al cambiar de mazo, asi el borrador se reinicia sin
  // un efecto de sincronizacion.
  return <Editor key={mazo.data.id} deck={mazo.data} token={token!} />;
}

function Editor({ deck, token }: { deck: DeckDetail; token: string }) {
  const editor = useDeckEditor(deck, token);
  const zonas = zonasDe(deck.game);

  return (
    <>
      <h1>{deck.name}</h1>
      <p className="subtitulo">
        {deck.game} · la validacion se recalcula en tu navegador, sin consultar al servidor.
      </p>

      <DeckValidacion
        validation={editor.validation}
        sucio={editor.sucio}
        guardando={editor.guardando}
        errorGuardado={editor.errorGuardado}
        discrepancia={editor.discrepancia}
        onGuardar={editor.guardar}
      />

      <DeckTransferencia
        game={deck.game}
        draft={editor.draft}
        token={token}
        onReemplazar={editor.reemplazar}
      />

      <div className="editor">
        <DeckBuscador game={deck.game} onAnadir={editor.anadir} />

        <div className="editor-columna">
          {zonas.map((z) => (
            <DeckZona
              key={z.zone}
              etiqueta={z.etiqueta}
              objetivo={z.objetivo}
              zone={z.zone}
              draft={editor.draft}
              mal={editor.validation.issues.some((i) => i.zone === z.zone)}
              onCantidad={editor.cambiarCantidad}
              onMover={editor.moverZona}
            />
          ))}
        </div>
      </div>
    </>
  );
}
