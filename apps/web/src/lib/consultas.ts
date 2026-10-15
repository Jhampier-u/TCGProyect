import type { GameCode } from '@tcg/shared';
import { api } from './api.js';

/**
 * Las consultas que comparten varias pantallas, definidas UNA vez (P-043).
 *
 * POR QUE EXISTE. React Query identifica una consulta por su CLAVE, no por su
 * funcion. Si dos componentes usan la misma clave con funciones distintas, el
 * primero que llega llena la cache y el segundo recibe datos con la forma del
 * otro. Paso exactamente eso: la portada de Pokemon guardaba en `['sets',
 * 'PTCG']` la respuesta entera (`{ data: [...] }`) y el catalogo, Sobres y el
 * buscador de mazos guardaban en esa misma clave solo la lista. Quien llegaba
 * segundo hacia `.find` sobre un objeto y la aplicacion entera se quedaba en
 * blanco.
 *
 * Aqui la clave y la funcion viajan juntas, asi que no pueden divergir: quien
 * quiera los sets de un juego usa `consultaSets(juego)` y recibe siempre lo
 * mismo. Una clave escrita a mano en un componente es como empieza otra vez.
 */

export const consultaSets = (juego: GameCode) => ({
  queryKey: ['sets', juego] as const,
  queryFn: () => api.sets(juego).then((r) => r.data),
});

export const consultaRarezas = (juego: GameCode) => ({
  queryKey: ['rarezas', juego] as const,
  queryFn: () => api.rarities(juego).then((r) => r.data),
});

export const consultaEpocas = (juego: GameCode) => ({
  queryKey: ['eras', juego] as const,
  queryFn: () => api.eras(juego).then((r) => r.data),
});
