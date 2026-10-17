import type { Browser, Page } from '@playwright/test';
import { API, test, expect, iniciarSesion, setAbribleDeYgo, type SetAbrible } from './fixtures.js';

/** El sobre abierto: la region "Sobre #N" (T-095). */
const region = (page: Page) => page.getByRole('region', { name: /^Sobre #/ });

async function abrir(
  page: Page,
  juego: 'YGO' | 'PTCG',
  set: Pick<SetAbrible, 'name'> | { nombre: RegExp },
): Promise<void> {
  const nombre = 'name' in set ? set.name : set.nombre;
  await page.goto('/sobres');
  await page.getByRole('combobox', { name: 'Juego' }).selectOption(juego);
  await page.getByRole('combobox', { name: 'Cantidad de sobres' }).selectOption('1');
  await page.getByRole('button', { name: /^Set:/ }).click();
  await page.getByRole('listbox', { name: 'Set' }).getByRole('option', { name: nombre }).first().click();
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(region(page)).toBeVisible();
}

async function contexto(browser: Browser, movimiento: 'reduce' | 'no-preference') {
  const ctx = await browser.newContext({ reducedMotion: movimiento });
  return { page: await ctx.newPage(), cerrar: () => ctx.close() };
}

test('el ritual entero se hace con el teclado', async ({ page, request, usuario }) => {
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);
  await abrir(page, 'YGO', set);

  await region(page).getByRole('button', { name: /^Rasgar el sobre/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800); // el rasgado

  // T-106: tras rasgar, el foco pasa solo a la carta de arriba.
  await expect(region(page).getByRole('button', { name: /sin revelar$/ }).first()).toBeFocused();

  // Carta a carta: la de arriba del mazo es siempre la primera "sin revelar".
  const arriba = region(page).getByRole('button', { name: /sin revelar$/ }).first();
  for (let i = 0; i < 20 && (await arriba.count()) > 0; i += 1) {
    await arriba.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1400); // cubre la anticipacion (1,2 s) si toca
  }
  await expect(region(page).locator('button[aria-pressed="false"]')).toHaveCount(0);
});

test('Saltar revela todo y va al resumen', async ({ page, request, usuario }) => {
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);
  await abrir(page, 'YGO', set);

  await region(page).getByRole('button', { name: 'Saltar' }).click();
  await expect(region(page).locator('button[aria-pressed="false"]')).toHaveCount(0);
  await expect(region(page).getByRole('button', { name: 'Saltar' })).toHaveCount(0);
});

test('con movimiento reducido no hay lienzo de efectos', async ({ browser, request, usuario }) => {
  const { page, cerrar } = await contexto(browser, 'reduce');
  try {
    const set = await setAbribleDeYgo(request);
    await iniciarSesion(page, usuario.token);
    await abrir(page, 'YGO', set);
    await expect(region(page).locator('canvas')).toHaveCount(0);
  } finally {
    await cerrar();
  }
});

test('el sobre no lleva ninguna URL externa (P-001)', async ({ page, request, usuario }) => {
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);
  await abrir(page, 'YGO', set);
  const html = await region(page).evaluate((el) => el.outerHTML);
  expect(html.match(/https?:\/\/(?!localhost)[^"'\s)]+/g)).toBeNull();
});

test('el sobre de 151 lleva el arte de Scarlet & Violet', async ({ page, request, usuario }) => {
  // Lo que comprueba es que el arte sale de la MISMA plantilla que el motor
  // (T-101): si las dos consultas se separaran, esto lo diria.
  const res = await request.get(`${API}/api/games/PTCG/sets`);
  const { data } = (await res.json()) as { data: Array<SetAbrible & { externalId: string }> };
  const s151 = data.find((s) => s.externalId === 'sv3pt5' && s.isOpenable && s.poolSize > 0);
  expect(s151, 'falta 151 en el catalogo: ingesta PTCG').toBeTruthy();

  await iniciarSesion(page, usuario.token);
  await abrir(page, 'PTCG', { nombre: /^151\b/ });
  await expect(region(page).getByRole('button', { name: /^Rasgar el sobre/ })).toHaveAttribute(
    'data-art-key',
    'booster-scarlet-violet',
  );
});

test('el lector de pantalla oye la carta revelada', async ({ page, request, usuario }) => {
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);
  await abrir(page, 'YGO', set);

  await region(page).getByRole('button', { name: /^Rasgar el sobre/ }).click();
  const arriba = region(page).getByRole('button', { name: /sin revelar$/ }).first();
  await expect(arriba).toBeVisible();
  await arriba.click();

  const revelada = region(page).locator('button[aria-pressed="true"]').first();
  await expect(revelada).toBeVisible();
  const nombre = ((await revelada.getAttribute('aria-label')) ?? (await revelada.innerText())).trim();
  expect(nombre.length).toBeGreaterThan(0);
  // Un nombre largo puede ir acompanado de rareza en la etiqueta: basta el inicio.
  const inicio = nombre.slice(0, 8);
  await expect(region(page).locator('[aria-live="polite"]')).toContainText(inicio);
});
