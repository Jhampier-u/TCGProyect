import { test, expect, iniciarSesion } from './fixtures.js';

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

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();

  // El texto se escribe aqui con sus acentos y NO se importa del modulo de
  // cadenas: la imagen de la suite no copia `apps/` (ADR-009) y, sobre todo,
  // una prueba de extremo a extremo debe afirmar lo que el usuario LEE. Si la
  // interfaz cambia un texto, esto falla, que es justo lo que se quiere.
  const SECCIONES = ['Abrir sobres', 'Mi colección', 'Mis mazos'];
  for (const seccion of SECCIONES) {
    await page.getByRole('link', { name: seccion }).click();
    await expect(page.getByRole('heading', { name: seccion })).toBeVisible();
  }

  expect(errores).toEqual([]);
});

test('el HTML renderizado no contiene ninguna URL externa (P-001)', async ({ page, request, usuario }) => {
  await iniciarSesion(page, usuario.token);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();

  const externas = await page.evaluate(() =>
    document.documentElement.outerHTML.match(/https?:\/\/(?!localhost)[^"'\s]+/g),
  );
  expect(externas).toBeNull();
});
