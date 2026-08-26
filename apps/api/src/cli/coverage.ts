import { loadConfig } from '../config.js';
import { Database, PackRepositoryMysql } from '../db/index.js';
import { rarezasInalcanzables } from '../packs/index.js';
import { GAME_IDS, type GameCode } from '@tcg/shared';

/**
 * `npm run packs:cobertura` - cuanto de cada set puede llegar a obtenerse.
 *
 * T-034. NADA media esto. Ni P-019 ni P-021 los detecto una prueba: los destapo
 * mirar aperturas reales, dos veces, con siete sesiones de diferencia. Un set
 * cuya plantilla no nombra una de sus rarezas deja al coleccionista con un
 * porcentaje que no puede subir, y el motor no tiene forma de saberlo: hace
 * exactamente lo que la plantilla dice.
 *
 *   npm run packs:cobertura
 *   npm run packs:cobertura -- --game YGO
 *
 * Sale con codigo 1 si algun set tiene rarezas inalcanzables, para que valga
 * como comprobacion y no solo como informe.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--game');
  const filtro = i >= 0 ? argv[i + 1]?.toUpperCase() : undefined;

  const config = loadConfig();
  const db = new Database({ url: config.databaseUrl });
  const repo = new PackRepositoryMysql(db);
  let conHuecos = 0;

  try {
    for (const game of ['MTG', 'YGO', 'PTCG'] as GameCode[]) {
      if (filtro && filtro !== game) continue;

      // Solo los sets con pool: un set sin impresiones abribles no es un sobre.
      const sets = await db.select<{ id: number; code: string; released_at: string | null }>(
        `SELECT DISTINCT s.id, s.code, s.released_at
           FROM sets s JOIN card_prints p ON p.set_id = s.id AND p.in_boosters = 1
          WHERE s.game_id = ? ORDER BY s.released_at`,
        [GAME_IDS[game]],
      );

      console.log(`\n[${game}] ${sets.length} sets con pool`);

      // Cuantos sets resuelve cada plantilla. No es adorno: es la unica forma
      // de comprobar la precedencia de `findTemplate` a traves del codigo real
      // en vez de reescribiendo su consulta a mano, que probaria la copia.
      const reparto = new Map<string, number>();

      for (const set of sets) {
        const plantilla = await repo.findTemplate(Number(set.id));
        if (!plantilla) {
          console.log(`  ${set.code.padEnd(6)} SIN PLANTILLA`);
          conHuecos += 1;
          continue;
        }
        reparto.set(plantilla.name, (reparto.get(plantilla.name) ?? 0) + 1);

        const pool = await repo.loadPool(Number(set.id));
        const total = [...pool.values()].reduce((n, e) => n + e.length, 0);
        const fuera = rarezasInalcanzables(plantilla.slots, pool.keys());
        const perdidas = fuera.reduce((n, r) => n + (pool.get(r)?.length ?? 0), 0);
        const techo = total > 0 ? (100 * (total - perdidas)) / total : 100;

        if (fuera.length > 0) {
          conHuecos += 1;
          console.log(
            `  ${set.code.padEnd(6)} ${String(total).padStart(5)} impresiones · ` +
              `techo ${techo.toFixed(1)}% · inalcanzables: ${fuera.join(', ')}`,
          );
        }
      }

      console.log('  reparto por plantilla:');
      for (const [nombre, n] of [...reparto].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(n).padStart(5)}  ${nombre}`);
      }
    }
  } finally {
    await db.close();
  }

  if (conHuecos > 0) {
    console.log(`\n${conHuecos} sets con rarezas inalcanzables.`);
    process.exitCode = 1;
  } else {
    console.log('\nTodos los sets son completables.');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
