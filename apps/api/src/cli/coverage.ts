import { loadConfig } from '../config.js';
import { Database, PackRepositoryMysql } from '../db/index.js';
import { rarezasInalcanzables, pesoSinDestino } from '../packs/index.js';
import type { TemplateConfig } from '../packs/index.js';
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

      // Solo los sets con pool Y clasificados como producto de sobres (T-069).
      const sets = await db.select<{ id: number; code: string; released_at: string | null }>(
        `SELECT DISTINCT s.id, s.code, s.released_at
           FROM sets s JOIN card_prints p ON p.set_id = s.id AND p.in_boosters = 1
          WHERE s.game_id = ? AND s.is_openable = 1 ORDER BY s.released_at`,
        [GAME_IDS[game]],
      );

      // Lo que la clasificacion ha dejado FUERA, con nombre y todo. Los
      // patrones de nombre son heuristica (T-069): uno demasiado ancho quitaria
      // del catalogo un set de sobres real, y eso es peor que el problema que
      // arregla. Por eso se ven aqui en vez de perderse en silencio.
      const excluidos = await db.select<{ name: string; card_count: number }>(
        `SELECT DISTINCT s.name, s.card_count
           FROM sets s JOIN card_prints p ON p.set_id = s.id AND p.in_boosters = 1
          WHERE s.game_id = ? AND s.is_openable = 0
          ORDER BY s.card_count DESC`,
        [GAME_IDS[game]],
      );

      console.log(`\n[${game}] ${sets.length} sets con pool`);

      // Toda rareza del juego con al menos una impresion abrible. Es lo que
      // hace falta para T-070: una plantilla que pide algo que NO ESTA AQUI no
      // falla, no avisa, y el respaldo reparte su peso sobre la alternativa de
      // mayor peso del slot.
      const existentes = new Set(
        (
          await db.select<{ code: string }>(
            `SELECT DISTINCT r.code
               FROM rarities r
               JOIN card_prints p ON p.rarity_id = r.id AND p.in_boosters = 1
              WHERE r.game_id = ?`,
            [GAME_IDS[game]],
          )
        ).map((r) => r.code),
      );

      // Cuantos sets resuelve cada plantilla. No es adorno: es la unica forma
      // de comprobar la precedencia de `findTemplate` a traves del codigo real
      // en vez de reescribiendo su consulta a mano, que probaria la copia.
      const reparto = new Map<string, number>();
      const plantillas = new Map<string, TemplateConfig>();

      for (const set of sets) {
        const plantilla = await repo.findTemplate(Number(set.id));
        if (!plantilla) {
          console.log(`  ${set.code.padEnd(6)} SIN PLANTILLA`);
          conHuecos += 1;
          continue;
        }
        reparto.set(plantilla.name, (reparto.get(plantilla.name) ?? 0) + 1);
        plantillas.set(plantilla.name, plantilla);

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

      if (excluidos.length > 0) {
        console.log(`  ${excluidos.length} sets con pool NO se ofrecen (T-069), los mayores:`);
        for (const e of excluidos.slice(0, 8)) {
          console.log(`    ${String(e.card_count).padStart(5)} cartas  ${e.name}`);
        }
      }

      // T-070. Se informa y NO se sale con codigo 1: una plantilla generica
      // puede describir legitimamente sets que todavia no se han ingestado. Lo
      // que no puede es pasar desapercibida, que es lo que le ocurrio al 28,5%
      // del slot del hit de Pokemon hasta que alguien lo conto a mano (P-034).
      for (const [nombre, plantilla] of plantillas) {
        for (const d of pesoSinDestino(plantilla.slots, existentes)) {
          console.log(
            `  AVISO  "${nombre}" slot ${d.slotIndex}: el ${(100 * d.fraccion).toFixed(1)}% del ` +
              `peso pide rarezas que ningun set de ${game} tiene (${d.rarezas.join(', ')}). ` +
              'El respaldo lo entrega como la alternativa de mayor peso del slot.',
          );
        }
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
