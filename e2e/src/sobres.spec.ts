import type { Browser, Locator, Page } from '@playwright/test';
import { test, expect, iniciarSesion, setAbribleDeYgo } from './fixtures.js';

/**
 * T-040 — el volteo de las cartas.
 *
 * Bloqueado desde S017: alli se midio que `requestAnimationFrame` no avanzaba
 * ni un fotograma en 500 ms, asi que la logica quedo verificada y la animacion
 * no. Playwright controla el navegador desde fuera y puede esperar a que la
 * animacion TERMINE, que es la diferencia entre "se pidio el volteo" y "el
 * volteo ocurrio" (ADR-009).
 *
 * Los dos tests crean su contexto A MANO en vez de usar el del config: puesto
 * en el config, `reducedMotion` no llega al navegador en esta version (P-029).
 */

/**
 * Si la matriz calculada ya no tiene rotacion en Y.
 *
 * NO se compara contra una cadena literal: segun el navegador y lo que Framer
 * Motion tenga animado, el valor puede venir como `none`, como `matrix(...)` o
 * como `matrix3d(...)`. Lo que interesa es una sola cosa —que el giro haya
 * llegado a cero— y eso se lee del primer coeficiente, que es cos(angulo).
 */
function sinRotacion(transform: string): boolean {
  if (transform === 'none') return true;
  const numeros = transform.match(/-?[\d.]+(?:e-?\d+)?/g);
  if (!numeros || numeros.length < 6) return false;
  // m11 = cos(rotateY). Vale 1 al terminar y -1 mientras esta del reves.
  const m11 = Number(numeros[0]);
  return Math.abs(m11 - 1) < 0.01;
}

/**
 * Abre una pagina con el movimiento pedido y COMPRUEBA que el navegador lo
 * aplica de verdad.
 *
 * La comprobacion es el nucleo de todo esto: si la emulacion no surtiera
 * efecto, los dos tests de abajo medirian lo contrario de lo que creen y
 * pasarian igual. Ya paso una vez con el valor puesto en el config (P-029).
 */
async function paginaCon(
  browser: Browser,
  movimiento: 'reduce' | 'no-preference',
): Promise<{ page: Page; cerrar: () => Promise<void> }> {
  const contexto = await browser.newContext({ reducedMotion: movimiento });
  const page = await contexto.newPage();
  await page.goto('/');
  const reduce = await page.evaluate(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  expect(reduce, `la emulacion de movimiento no se aplico: se pidio "${movimiento}"`).toBe(
    movimiento === 'reduce',
  );
  return { page, cerrar: () => contexto.close() };
}

/** El sobre recien abierto: una region con nombre "Sobre #N" (T-095). */
function sobre(page: Page): Locator {
  return page.getByRole('region', { name: /^Sobre #/ });
}

/**
 * Las cartas de un sobre: botones que se voltean, con `aria-pressed`.
 *
 * Se buscan por ese ESTADO y no por su nombre, que cambia al voltear -- "Carta
 * 3 sin revelar" pasa a ser el nombre de la carta -- ni por su clase.
 */
function volteadores(page: Page): Locator {
  return sobre(page).locator('button[aria-pressed]');
}

async function abrirUnSobre(page: Page, nombreDeSet: string, rasgar = true): Promise<void> {
  await page.goto('/sobres');
  await expect(page.getByRole('heading', { name: 'Abrir sobres' })).toBeVisible();

  // Juego y cantidad siguen siendo `<select>` nativos; el de SET ya no lo es.
  // Desde T-066 es un control propio, porque un `<option>` no puede llevar un
  // icono dentro. Elegir en el es abrir y hacer clic en la opcion.
  await page.getByRole('combobox', { name: 'Juego' }).selectOption('YGO');
  await page.getByRole('combobox', { name: 'Cantidad de sobres' }).selectOption('1');

  await page.getByRole('button', { name: /^Set:/ }).click();
  await page.getByRole('listbox', { name: 'Set' }).getByRole('option', { name: nombreDeSet }).first().click();

  await page.getByRole('button', { name: 'Abrir' }).click();
  await expect(sobre(page)).toBeVisible();

  // Desde H9e el sobre llega SELLADO: las cartas no existen hasta rasgarlo. Con
  // movimiento reducido no hay ritual ni sobre que rasgar, y el paso no aplica.
  if (rasgar) await sobre(page).getByRole('button', { name: /^Rasgar el sobre/ }).click();
}

test('las cartas llegan boca abajo y el volteo TERMINA', async ({ browser, request, usuario }) => {
  const { page, cerrar } = await paginaCon(browser, 'no-preference');
  try {
    const set = await setAbribleDeYgo(request);
    await iniciarSesion(page, usuario.token);

    await abrirUnSobre(page, set.name);

    const primera = volteadores(page).first();

    // Llegan boca abajo: con movimiento normal, nada se revela solo.
    await expect(primera).toHaveAttribute('aria-pressed', 'false');

    await primera.click();

    // La logica: el boton se marca como pulsado.
    await expect(primera).toHaveAttribute('aria-pressed', 'true');

    // Y LA ANIMACION TERMINA. Con `requestAnimationFrame` parado —el fallo de
    // S017— `aria-pressed` cambiaria igual y esto no convergeria nunca.
    await expect
      .poll(
        async () => sinRotacion(await primera.evaluate((el) => getComputedStyle(el).transform)),
        { timeout: 5000, message: 'el volteo no llego a terminar: la animacion no avanza' },
      )
      .toBe(true);
  } finally {
    await cerrar();
  }
});

test('T-040 no es vacuo: con movimiento reducido NO hay volteo que probar', async ({
  browser,
  request,
  usuario,
}) => {
  // Si este test se comportara igual que el anterior, el anterior no estaria
  // tocando el camino de la animacion. El ritual (`Ritual`) llama a
  // `useReducedMotion()` y con movimiento reducido revela TODAS las cartas de golpe.
  const { page, cerrar } = await paginaCon(browser, 'reduce');
  try {
    const set = await setAbribleDeYgo(request);
    await iniciarSesion(page, usuario.token);

    await abrirUnSobre(page, set.name, false);

    // Ya reveladas, sin un solo clic.
    const cartas = volteadores(page);
    const total = await cartas.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      await expect(cartas.nth(i)).toHaveAttribute('aria-pressed', 'true');
    }
  } finally {
    await cerrar();
  }
});
