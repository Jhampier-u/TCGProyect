import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GAME_CODES, GAME_IDS, isGameCode } from '@tcg/shared';
import { loadConfig } from '../config.js';
import { Database } from '../db/index.js';
import { RECORTES, paletaDe } from '../images/paleta.js';

/**
 * `npm run sobres:paleta [-- --game PTCG] [-- --recalcular]` (H9e, T-102).
 *
 * SIN RED: lee las imagenes ya cosechadas en `storage/`. La de la impresion de
 * mayor tier del set, que es la que mejor dice de que color es; si no hay
 * ninguna, el icono. Sin `--recalcular` solo rellena las que faltan, asi que se
 * puede relanzar sin pisar una paleta corregida a mano.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--game');
  const pedido = i >= 0 ? argv[i + 1]?.toUpperCase() : undefined;
  if (i >= 0 && (pedido === undefined || !isGameCode(pedido))) {
    console.error(`--game debe ser MTG, YGO o PTCG (recibido: ${argv[i + 1] ?? 'nada'}).`);
    process.exitCode = 1;
    return;
  }
  const juegoId = pedido && isGameCode(pedido) ? GAME_IDS[pedido] : null;
  const recalcular = argv.includes('--recalcular');

  const config = loadConfig();
  const db = new Database({ url: config.databaseUrl });
  let hechas = 0;
  let sinImagen = 0;
  let fallidas = 0;

  try {
    const sets = await db.select<{
      id: number;
      code: string;
      game_id: number;
      ruta: string | null;
      icono: string | null;
    }>(
      `SELECT s.id, s.code, s.game_id, s.icon_local_path AS icono,
              COALESCE(
                (SELECT p.image_local_path
                   FROM card_prints p JOIN rarities r ON r.id = p.rarity_id
                  WHERE p.set_id = s.id AND p.image_local_path IS NOT NULL
                    AND p.withdrawn_at IS NULL AND r.tier < 50
                  ORDER BY r.tier DESC, p.id
                  LIMIT 1),
                s.icon_local_path) AS ruta
         FROM sets s
        WHERE (? OR s.palette IS NULL)
          AND (? IS NULL OR s.game_id = ?)`,
      [recalcular, juegoId, juegoId],
    );

    for (const set of sets) {
      if (!set.ruta) {
        sinImagen += 1;
        continue;
      }
      const juego = GAME_CODES.find((g) => GAME_IDS[g] === set.game_id);
      const recorte = RECORTES[juego ?? 'PTCG'];
      try {
        let paleta;
        try {
          paleta = await paletaDe(await readFile(join(config.storagePath, set.ruta)), recorte);
        } catch (e) {
          // La carta falla: el icono del set todavia puede dar color.
          if (!set.icono || set.icono === set.ruta) throw e;
          paleta = await paletaDe(await readFile(join(config.storagePath, set.icono)), recorte);
        }
        await db.query('UPDATE sets SET palette = ? WHERE id = ?', [JSON.stringify(paleta), set.id]);
        hechas += 1;
      } catch (e) {
        // Un fichero que falta no para el resto: se cuenta y se dice.
        fallidas += 1;
        console.warn(`[${set.code}] sin paleta: ${(e as Error).message}`);
      }
    }
    console.log(`Paletas: ${hechas} calculadas, ${sinImagen} sets sin imagen, ${fallidas} fallidas.`);
    if (fallidas > 0) process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
