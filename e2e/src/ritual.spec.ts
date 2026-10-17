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

  // T-106: tras rasgar, el foco pasa solo a la carta de arriba (toBeFocused reintenta).
  // La de arriba del mazo es siempre la primera "sin revelar".
  const arriba = region(page).getByRole('button', { name: /sin revelar$/ }).first();
  const reveladas = region(page).locator('button[aria-pressed="true"]');
  // Sin esto el bucle puede no arrancar (el rasgado aun no ha pintado el mazo) y pasar vacio.
  await expect(arriba).toBeFocused({ timeout: 5000 });
  let hechas = 0;
  for (let i = 0; i < 20 && (await arriba.count()) > 0; i += 1) {
    // El foco lo lleva el ritual, no el test: si no aguanta carta a carta, falla aqui.
    await expect(arriba).toBeFocused();
    await page.keyboard.press('Enter');
    // Determinista: espera a que la carta quede revelada (cubre la anticipacion de 1,2 s).
    await expect(reveladas).toHaveCount(i + 1, { timeout: 5000 });
    hechas += 1;
  }
  await expect(region(page).locator('button[aria-pressed="false"]')).toHaveCount(0);
  // En el resumen la bandeja deja de ser botones: se cuenta lo revelado por el camino.
  expect(hechas).toBeGreaterThan(0);
});

test('Saltar revela todo y va al resumen', async ({ page, request, usuario }) => {
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);
  await abrir(page, 'YGO', set);

  await region(page).getByRole('button', { name: 'Saltar' }).click();
  await expect(region(page).locator('button[aria-pressed="false"]')).toHaveCount(0);
  expect(await region(page).locator('button[aria-pressed="true"]').count()).toBeGreaterThan(0);
  await expect(region(page).getByRole('button', { name: 'Saltar' })).toHaveCount(0);
  // El resumen: una sola linea "N cartas, M nuevas" en la region en vivo.
  await expect(region(page).locator('[aria-live="polite"]')).toContainText(/\d+ cartas?, /);
});

test('con movimiento reducido no hay lienzo de efectos', async ({ browser, request, usuario }) => {
  const { page, cerrar } = await contexto(browser, 'reduce');
  try {
    const reduce = await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    expect(reduce, 'la emulacion de movimiento no se aplico (P-029)').toBe(true);
    const set = await setAbribleDeYgo(request);
    await iniciarSesion(page, usuario.token);
    await abrir(page, 'YGO', set);
    // Con movimiento reducido todo llega revelado: esperar a que asiente y entonces mirar.
    await expect(region(page).locator('button[aria-pressed="true"]').first()).toBeVisible();
    await expect(region(page).locator('button[aria-pressed="false"]')).toHaveCount(0);
    await expect(region(page).locator('canvas')).toHaveCount(0);
  } finally {
    await cerrar();
  }
});

test('el sobre no lleva ninguna URL externa (P-001)', async ({ page, request, usuario }) => {
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);
  await abrir(page, 'YGO', set);
  // Cualquier http(s) cuyo host no sea localhost / 127.0.0.1 exactos.
  const externa = /https?:\/\/(?!(?:localhost|127\.0\.0\.1)(?::\d+)?[\/"'])[^"'\s)]+/g;

  // Sellado: aqui esta el arte del sobre.
  const sellado = await region(page).evaluate((el) => el.outerHTML);
  expect(sellado.match(externa)).toBeNull();

  // Revelado: aqui estan las imagenes de las cartas, de donde vendria una URL externa.
  await region(page).getByRole('button', { name: 'Saltar' }).click();
  await expect(region(page).locator('button[aria-pressed="false"]')).toHaveCount(0);
  expect(await region(page).locator('img').count()).toBeGreaterThan(0);
  const revelado = await region(page).evaluate((el) => el.outerHTML);
  expect(revelado.match(externa)).toBeNull();
});

test('el sobre de 151 lleva el arte de Scarlet & Violet', async ({ page, request, usuario }) => {
  // Lo que comprueba es que el arte sale de la MISMA plantilla que el motor
  // (T-101): si las dos consultas se separaran, esto lo diria.
  const res = await request.get(`${API}/api/games/PTCG/sets`);
  const { data } = (await res.json()) as { data: SetAbrible[] };
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
  // El aria-label del boton revelado es exactamente el nombre de la carta.
  const nombre = (await revelada.getAttribute('aria-label')) ?? '';
  expect(nombre.length).toBeGreaterThan(0);
  await expect(region(page).locator('[aria-live="polite"]')).toContainText(nombre);
});

test('un set sin paleta no deja el sobre transparente', async ({ page, request, usuario }) => {
  // Sin paleta, el sobre cae en los colores de dorso del juego. Esos tokens solo
  // existen bajo `data-juego`: si el ritual no lo pone, el fondo entero se anula
  // y el sobre se pinta transparente.
  await page.route('**/api/games/YGO/sets*', async (ruta) => {
    const res = await ruta.fetch();
    const cuerpo = (await res.json()) as { data: Array<Record<string, unknown>> };
    for (const s of cuerpo.data) s.palette = null;
    await ruta.fulfill({ response: res, json: cuerpo });
  });
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);
  await abrir(page, 'YGO', set);

  const sellado = region(page).getByRole('button', { name: /^Rasgar el sobre/ });
  await expect(sellado).toBeVisible();
  const fondo = await sellado.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { imagen: cs.backgroundImage, color: cs.backgroundColor };
  });
  expect(fondo.imagen).not.toBe('none');
  expect(fondo.color).not.toBe('rgba(0, 0, 0, 0)');
});
