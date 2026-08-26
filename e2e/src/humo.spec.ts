import { test, expect } from '@playwright/test';
import { crearUsuario, iniciarSesion } from './fixtures.js';

test('la aplicacion carga y navega sin errores de consola', async ({ page, request }) => {
  // Los errores de consola se recogen ANTES de navegar: si se engancha despues,
  // los del arranque se pierden. Es lo que habria cazado P-025 —la imagen web
  // rota durante dos sesiones— en el momento de romperse.
  const errores: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errores.push(msg.text());
  });
  page.on('pageerror', (e) => errores.push(e.message));

  const usuario = await crearUsuario(request, 'humo');
  await iniciarSesion(page, usuario.token);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Catalogo' })).toBeVisible();

  for (const seccion of ['Abrir sobres', 'Mi coleccion', 'Mis mazos'] as const) {
    await page.getByRole('link', { name: seccion }).click();
    await expect(page.getByRole('heading', { name: seccion })).toBeVisible();
  }

  expect(errores).toEqual([]);
});

test('el HTML renderizado no contiene ninguna URL externa (P-001)', async ({ page, request }) => {
  const usuario = await crearUsuario(request, 'p001');
  await iniciarSesion(page, usuario.token);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Catalogo' })).toBeVisible();

  const externas = await page.evaluate(() =>
    document.documentElement.outerHTML.match(/https?:\/\/(?!localhost)[^"'\s]+/g),
  );
  expect(externas).toBeNull();
});
