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
