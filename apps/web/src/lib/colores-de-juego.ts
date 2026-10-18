import type { CSSProperties } from 'react';

/**
 * Del valor de una faceta al token que lo pinta (H9f), con la misma forma que
 * `tipos-pokemon.ts`: deja el color en `--tipo` y el CSS lo usa donde quiera.
 * Solo tokens medidos por `tools/contraste-tokens.test.ts`.
 */
const MANA: Readonly<Record<string, string>> = { W: 'w', U: 'u', B: 'b', R: 'r', G: 'g', C: 'c' };

export function estiloDeMana(valor: string | null): CSSProperties | undefined {
  const token = valor ? MANA[valor] : undefined;
  return token ? ({ '--tipo': `var(--mana-${token})` } as CSSProperties) : undefined;
}

/** Los siete atributos de Yu-Gi-Oh!, como los guarda la base, a su token. */
const ATRIBUTO: Readonly<Record<string, string>> = {
  DARK: 'oscuridad', LIGHT: 'luz', EARTH: 'tierra', WATER: 'agua',
  FIRE: 'fuego', WIND: 'viento', DIVINE: 'divinidad',
};

export function estiloDeAtributo(valor: string | null): CSSProperties | undefined {
  const token = valor ? ATRIBUTO[valor] : undefined;
  return token ? ({ '--tipo': `var(--atributo-${token})` } as CSSProperties) : undefined;
}
