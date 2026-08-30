import type { EraSummary, SetSummary } from './api.js';

/**
 * Reparte los sets de un juego en sus epocas (T-090).
 *
 * LAS VENTANAS NO SE INVENTAN AQUI: llegan de `/api/games/:game/eras`, que las
 * lee de `pack_templates`. Lo unico que vive en el navegador es "esta fecha cae
 * en esta ventana", que es trivial y no es la parte que se pudre. Copiar las
 * fechas al frontend seria justo la clase de duplicado que este proyecto lleva
 * cinco sesiones limpiando del Vault.
 *
 * LA COMPARACION ES DE CADENAS `YYYY-MM-DD`, no de `Date`. Ordenan igual y no
 * arrastran husos horarios: `new Date('2020-01-01')` se interpreta en UTC y el
 * resultado cambia segun donde corra el navegador. Es la misma decision que ya
 * tomo `clasificarSet` en la ingesta.
 *
 * UN SET SIN FECHA no cae en ninguna ventana y va a la epoca por defecto, que
 * es exactamente lo que hace `findTemplate` en el servidor.
 */
export interface EpocaConSets {
  epoca: EraSummary;
  sets: SetSummary[];
}

export function agruparPorEpoca(
  sets: readonly SetSummary[],
  epocas: readonly EraSummary[],
): EpocaConSets[] {
  const conVentana = epocas.filter((e) => !e.isDefault);
  const porDefecto = epocas.find((e) => e.isDefault);

  const grupos = new Map<string, SetSummary[]>();
  for (const e of epocas) grupos.set(e.name, []);

  for (const set of sets) {
    const encaja = set.releasedAt
      ? conVentana.find(
          (e) =>
            (e.from === null || set.releasedAt! >= e.from) &&
            (e.to === null || set.releasedAt! <= e.to),
        )
      : undefined;
    const destino = encaja ?? porDefecto;
    if (destino) grupos.get(destino.name)?.push(set);
  }

  // Se devuelven en orden cronologico inverso -- lo mas nuevo primero -- y las
  // epocas vacias no se pintan: una seccion sin nada dentro es ruido.
  return epocas
    .map((epoca) => ({ epoca, sets: grupos.get(epoca.name) ?? [] }))
    .filter((g) => g.sets.length > 0)
    .reverse();
}
