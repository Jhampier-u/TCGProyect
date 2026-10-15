import { API, test, expect, iniciarSesion, setAbrible } from './fixtures.js';

/*
 * El texto esperado se escribe aqui con sus acentos y NO se importa del modulo
 * de cadenas: la imagen de la suite no copia `apps/` (ADR-009) y, sobre todo,
 * una prueba de extremo a extremo debe afirmar lo que el usuario LEE. Si la
 * interfaz cambia un texto, esto falla, que es justo lo que se quiere.
 *
 * Desde T-095 ningun selector de esta suite es una clase CSS: se busca por rol
 * y nombre accesible, que es lo que sobrevive a un rediseno.
 */

test('la aplicacion carga y navega sin errores de consola', async ({ page, request, usuario }) => {
  // Los errores de consola se recogen ANTES de navegar: si se engancha despues,
  // los del arranque se pierden. Es lo que habria cazado P-025 -- la imagen web
  // rota durante dos sesiones -- en el momento de romperse.
  const errores: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errores.push(msg.text());
  });
  page.on('pageerror', (e) => errores.push(e.message));
  const set = await setAbrible(request, 'PTCG');
  await iniciarSesion(page, usuario.token);

  // La raiz es una eleccion de juego desde T-090, no un catalogo con filtro.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Elige tu juego' })).toBeVisible();

  // Entrar en un juego lleva a SU portada, con SU nombre.
  await page.getByRole('link', { name: 'Pokémon TCG', exact: false }).click();
  await expect(page).toHaveURL(/\/ptcg$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Pokémon TCG' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Scarlet & Violet/ })).toBeVisible();

  // Se acota al MENU: la portada ofrece los mismos destinos como accesos
  // directos, y sin acotar hay dos enlaces con el mismo nombre.
  const menu = page.getByRole('banner');

  // P-043. Desde la portada -- que llena la cache de sets de Pokemon -- a Sobres
  // eligiendo Pokemon. Durante tres sesiones esto dejaba la aplicacion entera
  // en blanco, porque las dos pantallas guardaban cosas distintas bajo la misma
  // clave de cache. Lo cazo ESTE test, al llegar al catalogo; aqui va el camino
  // mas corto hasta el fallo.
  await menu.getByRole('link', { name: 'Abrir sobres' }).click();
  await expect(page.getByRole('heading', { name: 'Abrir sobres' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Juego' }).selectOption('PTCG');
  await expect(page.getByRole('button', { name: /^Set:/ })).toBeVisible();

  for (const seccion of ['Mi colección', 'Mis mazos']) {
    await menu.getByRole('link', { name: seccion }).click();
    await expect(page.getByRole('heading', { name: seccion })).toBeVisible();
  }

  // El catalogo, ahora bajo su juego, y por la misma via que P-043.
  await menu.getByRole('link', { name: 'Catálogo' }).click();
  await expect(page).toHaveURL(/\/ptcg\/catalogo$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Todo el catálogo' })).toBeVisible();

  // Un set, y la ficha de su primera carta: las dos pantallas nuevas de H9b.
  await page.goto(`/ptcg/catalogo?set=${set.externalId}`);
  await expect(page.getByRole('heading', { level: 1, name: set.name })).toBeVisible();
  const tabla = page.getByRole('table');
  await tabla.getByRole('button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  expect(errores).toEqual([]);
});

test('la ruta vieja del catalogo sigue llevando a alguna parte', async ({ page, usuario }) => {
  // `/` era el catalogo y estara en marcadores. Un 404 en una URL que alguien
  // guardo es de las cosas mas baratas de evitar y mas caras de descubrir.
  await iniciarSesion(page, usuario.token);

  await page.goto('/catalogo');
  await expect(page).toHaveURL(/\/ptcg\/catalogo$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Todo el catálogo' })).toBeVisible();
});

test('el HTML renderizado no contiene ninguna URL externa (P-001)', async ({ page, request, usuario }) => {
  await iniciarSesion(page, usuario.token);
  const set = await setAbrible(request, 'PTCG');

  // La primera carta del set, para abrir su ficha por la URL.
  const primera = await request.get(`${API}/api/cards?game=PTCG&set=${set.externalId}&limit=1`, {
    headers: { authorization: `Bearer ${usuario.token}` },
  });
  const { data } = (await primera.json()) as { data: Array<{ printId: number }> };
  expect(data.length, 'el set no tiene cartas que mirar').toBeGreaterThan(0);

  // TODAS las pantallas con imagenes, no solo una. La ficha (T-094) es la que
  // pinta la imagen mas grande y la mas nueva: exactamente donde se colaria una
  // URL del origen sin que nadie lo viera.
  const RUTAS: Array<[string, () => Promise<void>]> = [
    ['/', () => expect(page.getByRole('heading', { level: 1, name: 'Elige tu juego' })).toBeVisible()],
    ['/ptcg', () => expect(page.getByRole('heading', { level: 1, name: 'Pokémon TCG' })).toBeVisible()],
    ['/ptcg/catalogo', () => expect(page.getByRole('heading', { level: 1, name: 'Todo el catálogo' })).toBeVisible()],
    [`/ptcg/catalogo?set=${set.externalId}`, () => expect(page.getByRole('table')).toBeVisible()],
    [
      `/ptcg/catalogo?set=${set.externalId}&carta=${data[0]!.printId}`,
      () => expect(page.getByRole('dialog').getByRole('img').first()).toBeVisible(),
    ],
  ];

  for (const [ruta, listo] of RUTAS) {
    await page.goto(ruta);
    await listo();

    const externas = await page.evaluate(() =>
      document.documentElement.outerHTML.match(/https?:\/\/(?!localhost)[^"'\s]+/g),
    );
    expect(externas, `URL externa en ${ruta}`).toBeNull();
  }
});
