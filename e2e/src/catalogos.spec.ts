import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { API, test, expect, abrirUnSobrePorApi, iniciarSesion, setAbrible } from './fixtures.js';

/**
 * H9f -- los catalogos de Magic y Yu-Gi-Oh!, y el perfil que los hace posibles.
 *
 * Como el resto de la suite: por rol y nombre accesible, y el texto esperado
 * escrito aqui con sus acentos, porque una prueba de extremo a extremo afirma
 * lo que el usuario LEE (ver humo.spec.ts).
 */

interface Recuento { value: string; count: number; owned: number | null }

const TIPO_DE_MAGIC = 'Criatura';
const ATRIBUTO: Record<string, string> = {
  DARK: 'Oscuridad', LIGHT: 'Luz', EARTH: 'Tierra', WATER: 'Agua', FIRE: 'Fuego', WIND: 'Viento', DIVINE: 'Divinidad',
};
const MARCO: Record<string, string> = {
  normal: 'Normal', effect: 'Efecto', ritual: 'Ritual', fusion: 'Fusión', synchro: 'Sincronía',
  xyz: 'Xyz', pendulum: 'Péndulo', link: 'Link', token: 'Ficha (marco)',
};

const rail = (page: Page) => page.getByRole('navigation', { name: 'Estructura' });
const seccion = (page: Page, nombre: string) => rail(page).getByRole('region', { name: nombre });
const filas = (page: Page): Locator =>
  page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') });
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "2 de 35" -> { tengo: 2, total: 35 }. */
function cifras(texto: string): { tengo: number; total: number } {
  const m = /(\d+) de (\d+)/.exec(texto);
  if (!m) throw new Error(`La fila del rail no dice "N de M": ${texto}`);
  return { tengo: Number(m[1]), total: Number(m[2]) };
}

async function recuentos(request: APIRequestContext, juego: string, set: string): Promise<Record<string, Recuento[]>> {
  const res = await request.get(`${API}/api/games/${juego}/facets?set=${encodeURIComponent(set)}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { data: { facetas: Record<string, Recuento[]> } }).data.facetas;
}

/** Cuantas cartas devuelve la API para una consulta; infinito si no caben en 100. */
async function contar(request: APIRequestContext, consulta: string): Promise<number> {
  const res = await request.get(`${API}/api/cards?${consulta}&limit=100`);
  expect(res.ok()).toBe(true);
  const cuerpo = (await res.json()) as { data: unknown[]; nextCursor: string | null };
  return cuerpo.nextCursor ? Number.POSITIVE_INFINITY : cuerpo.data.length;
}

test('Magic: un color de este set que me falta, el rail cuadra con la tabla, y un tipo encima', async ({
  page, request, usuario,
}) => {
  const set = await setAbrible(request, 'MTG');
  // Sin nada abierto, "me faltan" es el set entero y no distinguiria el filtro.
  await abrirUnSobrePorApi(request, usuario.token, set.id);
  await iniciarSesion(page, usuario.token);

  await page.goto(`/mtg/catalogo?set=${encodeURIComponent(set.externalId)}`);
  await expect(page.getByRole('heading', { level: 1, name: set.name })).toBeVisible();

  const colores = seccion(page, 'Color').getByRole('button');
  await expect(colores.first()).toBeVisible();
  let elegido: { nombre: string; faltan: number } | null = null;
  for (const fila of await colores.all()) {
    const texto = (await fila.textContent()) ?? '';
    const { tengo, total } = cifras(texto);
    if (total - tengo > 0 && total - tengo <= 60) {
      elegido = { nombre: texto.replace(/\d+ de \d+/, '').trim(), faltan: total - tengo };
      break;
    }
  }
  expect(elegido, 'ningun color del set tiene entre 1 y 60 cartas que falten').not.toBeNull();

  await rail(page).getByRole('button', { name: 'Me faltan' }).click();
  await seccion(page, 'Color').getByRole('button', { name: new RegExp(`^${escapar(elegido!.nombre)}`) }).click();
  await expect(page).toHaveURL(/owned=no/);
  await expect(page).toHaveURL(/color=/);

  // LA GARANTIA: lo que el rail dice que falta es lo que ensena la tabla.
  await expect(filas(page)).toHaveCount(elegido!.faltan);
  await expect(page.getByRole('table').getByRole('img', { name: 'La tienes' })).toHaveCount(0);

  // Antes del tipo tiene que haber filas de OTROS tipos: si el color elegido solo
  // trajera criaturas, romper el filtro de tipo no cambiaria nada y la comprobacion
  // de abajo pasaria sin probar nada.
  const noCriaturas = filas(page).filter({ hasNot: page.getByRole('cell', { name: TIPO_DE_MAGIC, exact: true }) });
  await expect(noCriaturas, 'el color elegido solo tiene criaturas: el tipo no filtraria nada').not.toHaveCount(0);

  // Un tipo encima: todas las filas que quedan son de ese tipo, y siguen faltando.
  await seccion(page, 'Tipo').getByRole('button', { name: new RegExp(`^${TIPO_DE_MAGIC}`) }).click();
  await expect(page).toHaveURL(/kind=creature/);
  // Primero la cifra EXACTA, y distinta de cero. Al cambiar de filtro la tabla
  // se vacia un instante mientras llega la consulta nueva: un `toHaveCount(0)`
  // a secas pasaria en ese hueco aunque el tipo no filtrara nada (se vio pasar
  // con el filtro roto). La cifra sale de la API con la misma consulta.
  const color = new URL(page.url()).searchParams.get('color');
  const res = await request.get(
    `${API}/api/cards?game=MTG&set=${encodeURIComponent(set.externalId)}&owned=no&color=${color}&kind=creature&limit=100`,
    { headers: { authorization: `Bearer ${usuario.token}` } },
  );
  expect(res.ok()).toBe(true);
  const criaturasQueFaltan = ((await res.json()) as { data: unknown[] }).data.length;
  expect(criaturasQueFaltan, 'el color elegido no tiene criaturas que falten').toBeGreaterThan(0);
  expect(criaturasQueFaltan).toBeLessThan(elegido!.faltan);
  await expect(filas(page)).toHaveCount(criaturasQueFaltan);
  await expect(filas(page).filter({ hasNot: page.getByRole('cell', { name: TIPO_DE_MAGIC, exact: true }) }))
    .toHaveCount(0);
  await expect(page.getByRole('table').getByRole('img', { name: 'La tienes' })).toHaveCount(0);

  const chips = page.getByRole('group', { name: 'Filtros activos' });
  await expect(chips.getByRole('button', { name: `Quitar el filtro ${TIPO_DE_MAGIC}` })).toBeVisible();
  await page.screenshot({ path: 'artefactos/catalogo-mtg.png', fullPage: true });
});

test('Yu-Gi-Oh!: atributo y marco a la vez, y la tabla es lo que dice la API', async ({ page, request }) => {
  const set = await setAbrible(request, 'YGO');
  const facetas = await recuentos(request, 'YGO', set.externalId);
  const base = `game=YGO&set=${encodeURIComponent(set.externalId)}`;

  // Un atributo que quepa en una pagina, y un marco que lo estreche sin vaciarlo.
  let par: { atributo: Recuento; marco: Recuento; esperadas: number } | null = null;
  for (const atributo of facetas.attribute ?? []) {
    if (atributo.count > 60) continue;
    for (const marco of facetas.frame ?? []) {
      const n = await contar(request, `${base}&attribute=${atributo.value}&frame=${marco.value}`);
      if (n > 0 && n < atributo.count) {
        par = { atributo, marco, esperadas: n };
        break;
      }
    }
    if (par) break;
  }
  expect(par, 'ningun par atributo + marco del set estrecha el atributo').not.toBeNull();
  const nombreAtributo = ATRIBUTO[par!.atributo.value]!;
  const nombreMarco = MARCO[par!.marco.value]!;

  await page.goto(`/ygo/catalogo?set=${encodeURIComponent(set.externalId)}`);
  await seccion(page, 'Atributo').getByRole('button', { name: new RegExp(`^${escapar(nombreAtributo)}`) }).click();
  // Sin sesion el rail da la cifra a secas: es la de la tabla.
  await expect(filas(page)).toHaveCount(par!.atributo.count);

  await seccion(page, 'Marco').getByRole('button', { name: new RegExp(`^${escapar(nombreMarco)}`) }).click();
  await expect(page).toHaveURL(/attribute=/);
  await expect(page).toHaveURL(/frame=/);
  await expect(filas(page)).toHaveCount(par!.esperadas);
  await expect(filas(page).filter({ hasNot: page.getByRole('cell', { name: nombreAtributo, exact: true }) }))
    .toHaveCount(0);

  const chips = page.getByRole('group', { name: 'Filtros activos' });
  await expect(chips.getByRole('button', { name: `Quitar el filtro ${nombreAtributo}` })).toBeVisible();
  await expect(chips.getByRole('button', { name: `Quitar el filtro ${nombreMarco}` })).toBeVisible();
});

test('la ficha de Magic: el coste en símbolos y la fuerza y resistencia', async ({ page, request }) => {
  const set = await setAbrible(request, 'MTG');
  const res = await request.get(
    `${API}/api/cards?game=MTG&set=${encodeURIComponent(set.externalId)}&kind=creature&limit=1`,
  );
  const { data } = (await res.json()) as { data: Array<{ printId: number; name: string }> };
  expect(data.length, 'el set no tiene criaturas').toBeGreaterThan(0);

  await page.goto(`/mtg/catalogo?set=${encodeURIComponent(set.externalId)}&kind=creature&carta=${data[0]!.printId}`);
  const ficha = page.getByRole('dialog', { name: data[0]!.name });
  await expect(ficha).toBeVisible();
  await expect(ficha.getByRole('img', { name: /^Coste: / })).toBeVisible();
  await expect(ficha.getByText('Fuerza/Resistencia')).toBeVisible();
  await page.screenshot({ path: 'artefactos/ficha-mtg.png' });
});

test('la ficha de Yu-Gi-Oh!: nivel, rango o link, y ATK y DEF', async ({ page, request }) => {
  const set = await setAbrible(request, 'YGO');
  const res = await request.get(
    `${API}/api/cards?game=YGO&set=${encodeURIComponent(set.externalId)}&kind=monster&limit=1`,
  );
  const { data } = (await res.json()) as { data: Array<{ printId: number; name: string }> };
  expect(data.length, 'el set no tiene monstruos').toBeGreaterThan(0);

  await page.goto(`/ygo/catalogo?set=${encodeURIComponent(set.externalId)}&carta=${data[0]!.printId}`);
  const ficha = page.getByRole('dialog', { name: data[0]!.name });
  await expect(ficha).toBeVisible();
  await expect(ficha.getByRole('img', { name: /^(Nivel|Rango|Link) \d+$/ })).toBeVisible();
  await expect(ficha.getByText('ATK', { exact: true })).toBeVisible();
  await expect(ficha.getByText('DEF', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artefactos/ficha-ygo.png' });
});

test('la portada de Magic agrupa por año y cada set lleva a su catálogo filtrado', async ({ page, request }) => {
  const set = await setAbrible(request, 'MTG');
  expect(set.releasedAt, 'el set abrible no tiene fecha').not.toBeNull();

  await page.goto('/');
  await page.getByRole('link', { name: /Magic: The Gathering/ }).click();
  await expect(page).toHaveURL(/\/mtg$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Magic: The Gathering' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${set.releasedAt!.slice(0, 4)}`) })).toBeVisible();

  await page.getByRole('link').filter({ has: page.getByText(set.name, { exact: true }) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/mtg/catalogo\\?set=${escapar(encodeURIComponent(set.externalId))}$`));
  await expect(page.getByRole('heading', { level: 1, name: set.name })).toBeVisible();
});

test('una faceta de otro juego es un 400 que la nombra', async ({ request }) => {
  const ajena = await request.get(`${API}/api/cards?game=PTCG&color=U`);
  expect(ajena.status()).toBe(400);
  expect(((await ajena.json()) as { message: string }).message).toContain('color');
  // Y la misma clave en su juego, no.
  expect((await request.get(`${API}/api/cards?game=MTG&color=U&limit=1`)).status()).toBe(200);
});
