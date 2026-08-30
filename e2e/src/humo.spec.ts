import { test, expect, iniciarSesion } from './fixtures.js';

/*
 * El texto esperado se escribe aqui con sus acentos y NO se importa del modulo
 * de cadenas: la imagen de la suite no copia `apps/` (ADR-009) y, sobre todo,
 * una prueba de extremo a extremo debe afirmar lo que el usuario LEE. Si la
 * interfaz cambia un texto, esto falla, que es justo lo que se quiere.
 */

test('la aplicacion carga y navega sin errores de consola', async ({ page, request, usuario }) => {
  // Los errores de consola se recogen ANTES de navegar: si se engancha despues,
  // los del arranque se pierden. Es lo que habria cazado P-025 —la imagen web
  // rota durante dos sesiones— en el momento de romperse.
  const errores: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errores.push(msg.text());
  });
  page.on('pageerror', (e) => errores.push(e.message));
  await iniciarSesion(page, usuario.token);

  // La raiz es una eleccion de juego desde T-090, no un catalogo con filtro.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Elige tu juego' })).toBeVisible();

  // Entrar en un juego lleva a SU portada, con SU nombre.
  await page.getByRole('link', { name: 'Pokémon TCG', exact: false }).click();
  await expect(page).toHaveURL(/\/ptcg$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Pokémon TCG' })).toBeVisible();

  // Y la portada agrupa el catalogo por epocas. Se comprueba una concreta
  // porque su nombre viene de `pack_templates`: si alguien renombra la
  // plantilla, esto avisa.
  await expect(page.getByRole('heading', { name: /Scarlet & Violet/ })).toBeVisible();

  // Se acota al MENU: la portada ofrece los mismos destinos como accesos
  // directos, asi que sin acotar hay dos enlaces con el mismo nombre y
  // Playwright rechaza la ambiguedad, con razon.
  const menu = page.getByRole('banner');
  const SECCIONES = ['Abrir sobres', 'Mi colección', 'Mis mazos'];
  for (const seccion of SECCIONES) {
    await menu.getByRole('link', { name: seccion }).click();
    await expect(page.getByRole('heading', { name: seccion })).toBeVisible();
  }

  // El catalogo sigue existiendo, ahora bajo su juego.
  await menu.getByRole('link', { name: 'Catálogo' }).click();
  await expect(page).toHaveURL(/\/ptcg\/catalogo$/);
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();

  expect(errores).toEqual([]);
});

test('la ruta vieja del catalogo sigue llevando a alguna parte', async ({ page, usuario }) => {
  // `/` era el catalogo y estara en marcadores. Un 404 en una URL que alguien
  // guardo es de las cosas mas baratas de evitar y mas caras de descubrir.
  await iniciarSesion(page, usuario.token);

  await page.goto('/catalogo');
  await expect(page).toHaveURL(/\/ptcg\/catalogo$/);
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();
});

test('el HTML renderizado no contiene ninguna URL externa (P-001)', async ({ page, request, usuario }) => {
  await iniciarSesion(page, usuario.token);

  // Se comprueban las TRES pantallas con imagenes, no solo una. La portada es
  // nueva y ensena un icono por set: es exactamente donde se colaria una URL
  // del origen sin que nadie lo viera.
  const RUTAS: Array<[string, string]> = [
    ['/', 'Elige tu juego'],
    ['/ptcg', 'Pokémon TCG'],
    ['/ptcg/catalogo', 'Catálogo'],
  ];

  for (const [ruta, titulo] of RUTAS) {
    await page.goto(ruta);
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();

    const externas = await page.evaluate(() =>
      document.documentElement.outerHTML.match(/https?:\/\/(?!localhost)[^"'\s]+/g),
    );
    expect(externas, `URL externa en ${ruta}`).toBeNull();
  }
});
