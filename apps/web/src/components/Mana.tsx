import type { CSSProperties } from 'react';
import { leerCoste, partirCoste, type SimboloDeMana } from '../lib/mana.js';
import { ES } from '../i18n/es.js';

/** Los colores del circulo: uno, o dos para el hibrido. Sin color, el incoloro del CSS. */
function estilo(s: SimboloDeMana): CSSProperties | undefined {
  const [a, b] = s.colores;
  if (!a) return undefined;
  return { '--mana-1': `var(--mana-${a})`, '--mana-2': `var(--mana-${b ?? a})` } as CSSProperties;
}

/**
 * El coste en mana como circulos con su letra (H9f, F-9). Una sola imagen para
 * el lector de pantalla, con el coste leido: "Coste: 2, negro".
 */
export function Mana({ coste }: { coste: string }) {
  const caras = partirCoste(coste);
  if (caras.every((c) => c.length === 0)) return null;
  return (
    <span className="mana" role="img" aria-label={ES.ficha.coste(leerCoste(caras))}>
      {caras.map((cara, i) => (
        <span key={i} className="mana-cara" aria-hidden="true">
          {i > 0 && <span className="mana-caras">{ES.simbolo.caras}</span>}
          {cara.map((s, j) => (
            <span key={j} className="mana-simbolo" style={estilo(s)}>{s.texto}</span>
          ))}
        </span>
      ))}
    </span>
  );
}
