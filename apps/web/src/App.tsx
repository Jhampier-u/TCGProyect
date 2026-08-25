import { GAME_CODES, GAME_NAMES } from '@tcg/shared';
import type { GameCode } from '@tcg/shared';

/**
 * Placeholder de H5. Su valor ahora es demostrar que los tipos de dominio
 * compartidos se consumen igual desde el frontend que desde la API: un solo
 * contrato, dos consumidores (ADR-001).
 */
export function App() {
  return (
    <main>
      <h1>ProyectoTCG</h1>
      <p>Simulador de sobres y constructor de mazos.</p>
      <ul>
        {GAME_CODES.map((game: GameCode) => (
          <li key={game}>
            <strong>{game}</strong> - {GAME_NAMES[game]}
          </li>
        ))}
      </ul>
    </main>
  );
}
