import type { CSSProperties } from 'react';

/**
 * Del tipo tal como llega del origen al token de color que lo pinta (T-093).
 *
 * Los once que existen, y ninguno inventado: son los que `tokens.css` mide en
 * los dos temas. Un tipo que no este aqui se pinta neutro en vez de con un
 * color que nadie ha comprobado contra el fondo.
 */
const TOKEN: Record<string, string> = {
  Grass: 'planta',
  Fire: 'fuego',
  Water: 'agua',
  Lightning: 'rayo',
  Psychic: 'psiquico',
  Fighting: 'lucha',
  Darkness: 'oscuro',
  Metal: 'metal',
  Dragon: 'dragon',
  Fairy: 'hada',
  Colorless: 'incoloro',
};

/** `style` que deja el color del tipo en `--tipo`, para que el CSS lo use donde quiera. */
export function estiloDeTipo(tipo: string | null): CSSProperties | undefined {
  const token = tipo ? TOKEN[tipo] : undefined;
  return token ? ({ '--tipo': `var(--tipo-${token})` } as CSSProperties) : undefined;
}
