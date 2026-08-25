import type { GameCode } from '@tcg/shared';

/**
 * Cliente de la API.
 *
 * Todas las llamadas van a `/api`, que Vite redirige al backend en desarrollo
 * (ver `vite.config.ts`). El frontend NUNCA habla con Scryfall, YGOPRODeck ni
 * Pokemon TCG: ese es el sentido de ADR-002, y hacerlo seria el camino mas corto
 * a que nos bloqueen la IP.
 */

export interface ApiErrorBody {
  error: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface CardSummary {
  printId: number;
  cardId: number;
  game: GameCode;
  name: string;
  typeLine: string | null;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  /** Ruta relativa dentro de nuestro almacen. Se sirve en `/images/...`. */
  imagePath: string | null;
}

export interface CardPage {
  data: CardSummary[];
  nextCursor: string | null;
}

export interface SetSummary {
  id: number;
  externalId: string;
  code: string;
  name: string;
  releasedAt: string | null;
  cardCount: number;
  poolSize: number;
}

export interface OpenedCard {
  slotIndex: number;
  printId: number;
  cardId: number;
  name: string;
  rarity: string;
  finish: string;
  isNew: boolean;
  imagePath: string | null;
}

export interface PackOpening {
  openingId: number;
  seed: string;
  setId: number;
  cards: OpenedCard[];
}

export interface CollectionEntry {
  printId: number;
  cardId: number;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  finish: string;
  quantity: number;
  imagePath: string | null;
  firstObtainedAt: string;
}

export interface SetCompletion {
  setExternalId: string;
  setCode: string;
  setName: string;
  poolSize: number;
  owned: number;
  ratio: number;
}

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    // El cuerpo de error puede no ser JSON (un 500 inesperado, un proxy caido).
    // Se degrada a un mensaje generico en vez de lanzar un error de parseo que
    // ocultaria el problema real.
    let body: Partial<ApiErrorBody> = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = {};
    }
    throw new ApiError(
      response.status,
      body.error ?? 'error',
      body.message ?? `Error ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

/** URL de una imagen de carta. Siempre local; jamas un dominio externo (P-001). */
export function imageUrl(path: string | null): string | null {
  return path ? `/images/${path}` : null;
}

export const api = {
  games: () => request<{ data: Array<{ code: GameCode; name: string }> }>('/games'),

  sets: (game: GameCode) => request<{ data: SetSummary[] }>(`/games/${game}/sets`),

  rarities: (game: GameCode) =>
    request<{ data: Array<{ code: string; label: string; tier: number }> }>(
      `/games/${game}/rarities`,
    ),

  // Los opcionales admiten `undefined` explicito: con
  // `exactOptionalPropertyTypes` no es lo mismo "clave ausente" que "clave con
  // undefined", y quien construye estos filtros pasa undefined a menudo.
  cards: (params: {
    game?: GameCode | undefined;
    set?: string | undefined;
    rarity?: string | undefined;
    q?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') search.set(k, String(v));
    }
    return request<CardPage>(`/cards?${search.toString()}`);
  },

  register: (body: { email: string; displayName: string; password: string }) =>
    request<{ data: AuthUser; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<{ data: AuthUser; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  me: (token: string) => request<{ data: AuthUser }>('/auth/me', {}, token),

  openPack: (token: string, setId: number, count = 1) =>
    request<{ data: PackOpening[] }>(
      '/packs/open',
      { method: 'POST', body: JSON.stringify({ setId, count }) },
      token,
    ),

  collection: (
    token: string,
    params: { game?: GameCode | undefined; cursor?: string | undefined; limit?: number | undefined } = {},
  ) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') search.set(k, String(v));
    }
    return request<{ data: CollectionEntry[]; nextCursor: string | null }>(
      `/collection?${search.toString()}`,
      {},
      token,
    );
  },

  completion: (token: string, game: GameCode) =>
    request<{ data: SetCompletion[] }>(`/collection/completion/${game}`, {}, token),

  summary: (token: string) =>
    request<{ data: { entries: number; copies: number; openings: number } }>(
      '/collection/summary',
      {},
      token,
    ),
};
