import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * H9e - la lista de ilustraciones de sobre contra lo que hay en disco.
 *
 * `DISPONIBLES` se mantiene a mano, y una lista a mano se desfasa: una clave
 * sin fichero es un 404 por sobre abierto, y un fichero sin clave es arte que
 * nadie ve. Ademas cada fichero tiene que ser WebP DE VERDAD y ligero: las
 * primeras 25 llegaron como JPEG de 3,4 MB con la extension cambiada, y el
 * navegador las habria pintado sin quejarse, 80 MB en total.
 */

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SOBRES = join(RAIZ, 'apps/web/public/sobres');
const FUENTE = readFileSync(join(RAIZ, 'apps/web/src/lib/arte-sobres.ts'), 'utf8');

/**
 * `DISPONIBLES` leido del fuente, no importado: `tools/` no puede importar
 * `apps/web` (su `rootDir`), y leer el fichero es lo que hacen las demas
 * comprobaciones de esta carpeta.
 */
function disponibles(): Record<string, string[]> {
  const i = FUENTE.indexOf('DISPONIBLES');
  const cuerpo = FUENTE.slice(i, FUENTE.indexOf('\n};', i));
  const lista: Record<string, string[]> = {};
  for (const m of cuerpo.matchAll(/(PTCG|MTG|YGO):\s*\[([^\]]*)\]/g)) {
    lista[m[1]!] = [...m[2]!.matchAll(/'([^']+)'/g)].map((c) => c[1]!);
  }
  return lista;
}
const DISPONIBLES = disponibles();
const TOPE_KB = 150;

/** RIFF....WEBP: la cabecera de un WebP, sea cual sea la extension. */
function esWebp(datos: Buffer): boolean {
  return datos.toString('latin1', 0, 4) === 'RIFF' && datos.toString('latin1', 8, 12) === 'WEBP';
}

describe('las ilustraciones de los sobres', () => {
  it('la lista de los tres juegos se ha podido leer', () => {
    expect(Object.keys(DISPONIBLES).sort()).toEqual(['MTG', 'PTCG', 'YGO']);
  });

  for (const [juego, claves] of Object.entries(DISPONIBLES)) {
    const carpeta = join(SOBRES, juego.toLowerCase());
    const enDisco = (() => {
      try {
        return readdirSync(carpeta).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5));
      } catch {
        return [];
      }
    })();

    it(`${juego}: cada clave tiene su fichero y cada fichero su clave`, () => {
      expect([...enDisco].sort()).toEqual([...claves].sort());
    });

    it(`${juego}: cada fichero es WebP de verdad y pesa como mucho ${TOPE_KB} KB`, () => {
      for (const clave of claves) {
        const datos = readFileSync(join(carpeta, `${clave}.webp`));
        expect(esWebp(datos), `${clave}.webp no es WebP`).toBe(true);
        expect(datos.length, `${clave}.webp pesa ${Math.round(datos.length / 1024)} KB`).toBeLessThanOrEqual(TOPE_KB * 1024);
      }
    });
  }
});
