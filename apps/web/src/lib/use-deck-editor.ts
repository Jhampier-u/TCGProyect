import { useCallback, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { validateDeck, type DeckValidation, type DeckZone } from '@tcg/shared';
import { api, ApiError, type DeckDetail } from './api.js';
import {
  addCard,
  firmaDe,
  fromDeckDetail,
  moveZone,
  setQuantity,
  toDeckEntries,
  toPayload,
  type Draft,
  type DraftCard,
} from './deck-draft.js';

export interface DeckEditor {
  draft: Draft;
  /** Recalculada en CADA cambio, en el navegador, sin tocar la red. */
  validation: DeckValidation;
  sucio: boolean;
  guardando: boolean;
  errorGuardado: string | null;
  /** Solo se rellena si el servidor discrepa del cliente. No deberia pasar. */
  discrepancia: DeckValidation | null;
  anadir: (card: DraftCard) => void;
  cambiarCantidad: (printId: number, zone: DeckZone, n: number) => void;
  moverZona: (printId: number, from: DeckZone, to: DeckZone) => void;
  guardar: () => void;
}

/**
 * Estado del editor de mazos.
 *
 * Se monta con `key={deck.id}` desde la pagina, asi que cambiar de mazo remonta
 * el componente y el estado se reinicia solo. Sin eso haria falta un efecto de
 * sincronizacion, que es una fuente clasica de borradores perdidos al navegar.
 */
export function useDeckEditor(deck: DeckDetail, token: string): DeckEditor {
  const inicial = useMemo(() => fromDeckDetail(deck.cards), [deck.cards]);
  const [draft, setDraft] = useState<Draft>(inicial);
  const [guardado, setGuardado] = useState<string>(() => firmaDe(inicial));
  const [discrepancia, setDiscrepancia] = useState<DeckValidation | null>(null);

  // El corazon de T-047: la validacion se deriva del borrador, no del servidor.
  const validation = useMemo(
    () => validateDeck(deck.game, toDeckEntries(draft)),
    [deck.game, draft],
  );

  const mutacion = useMutation({
    mutationFn: () => api.putDeckCards(token, deck.id, toPayload(draft)),
    onSuccess: (respuesta) => {
      setGuardado(firmaDe(draft));
      // Cliente y servidor corren el MISMO modulo de @tcg/shared, asi que esto
      // deberia coincidir siempre. Se compara justo por eso: si algun dia no
      // coincide, hay que verlo, no descubrirlo por un mazo mal guardado.
      const servidor = respuesta.data.validation;
      const iguales =
        servidor.valid === validation.valid && servidor.issues.length === validation.issues.length;
      setDiscrepancia(iguales ? null : servidor);
    },
  });

  const anadir = useCallback(
    (card: DraftCard) => setDraft((d) => addCard(d, card, deck.game)),
    [deck.game],
  );

  const cambiarCantidad = useCallback(
    (printId: number, zone: DeckZone, n: number) => setDraft((d) => setQuantity(d, printId, zone, n)),
    [],
  );

  const moverZona = useCallback(
    (printId: number, from: DeckZone, to: DeckZone) =>
      setDraft((d) => moveZone(d, printId, from, to)),
    [],
  );

  const error = mutacion.error;
  return {
    draft,
    validation,
    sucio: firmaDe(draft) !== guardado,
    guardando: mutacion.isPending,
    // El borrador NO se pierde si falla el guardado: sigue en memoria y el
    // boton queda disponible para reintentar.
    errorGuardado:
      error instanceof ApiError ? error.message : error ? 'No se pudo guardar el mazo' : null,
    discrepancia,
    anadir,
    cambiarCantidad,
    moverZona,
    guardar: () => mutacion.mutate(),
  };
}
