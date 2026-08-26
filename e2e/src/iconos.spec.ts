import { test, expect, abrirUnSobrePorApi, iniciarSesion, setAbribleDeYgo } from './fixtures.js';

/**
 * T-066 — los iconos de set, por fin visibles.
 *
 * Estaban cosechados desde S027 y la API los servia en `iconPath`, pero no se
 * veian: un `<option>` no puede contener una imagen. El `<select>` se sustituyo
 * por un control propio, y eso significa reimplementar a mano lo que el nativo
 * daba gratis. Esta suite comprueba justo eso, porque es lo que se pierde sin
 * darse cuenta.
 */

test('el selector de sets ensena iconos y son rutas LOCALES', async ({ page, usuario }) => {
  await iniciarSesion(page, usuario.token);
  await page.goto('/sobres');

  const selector = page.locator('.selector-set').first();
  await expect(selector).toBeVisible();
  await selector.locator('.selector-set-boton').click();

  const opciones = page.locator('.selector-set-opcion');
  await expect(opciones.first()).toBeVisible();

  // Al menos un icono, y NINGUNO apuntando fuera: servir la url del origen es
  // el hotlinking que castiga con lista negra de IP (P-001, P-022).
  const iconos = page.locator('.selector-set-lista img.selector-set-icono');
  expect(await iconos.count()).toBeGreaterThan(0);
  for (const src of await iconos.evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''))) {
    expect(src, `un icono apunta fuera: ${src}`).toMatch(/^\/images\//);
  }

  // Y se cargan de verdad: un `<img>` roto tambien "esta visible", que es como
  // P-036 se paso quince 404 sin que nadie lo notara.
  //
  // Solo se exigen los que estan DENTRO de la parte visible de la lista. Los
  // iconos van con `loading="lazy"` -- correcto en una lista de cientos de sets
  // -- asi que los de mas abajo aun no se han pedido, y exigirlos seria pedirle
  // al test que falle por hacer las cosas bien.
  const rotos = await iconos.evaluateAll((els) => {
    const lista = document.querySelector('.selector-set-lista')?.getBoundingClientRect();
    if (!lista) return ['no hay lista'];
    return els
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top >= lista.top && r.bottom <= lista.bottom;
      })
      .filter((e) => !(e as HTMLImageElement).complete || (e as HTMLImageElement).naturalWidth === 0)
      .map((e) => e.getAttribute('src') ?? '?');
  });
  expect(rotos, 'iconos visibles que no han cargado').toEqual([]);

  await page.screenshot({ path: 'artefactos/selector-iconos.png' });
});

test('el selector se maneja entero con el teclado', async ({ page, usuario }) => {
  const set = await setAbribleDeYgo(page.request);
  await iniciarSesion(page, usuario.token);
  await page.goto('/sobres');

  const boton = page.locator('.selector-set-boton').first();
  await boton.focus();

  // Abrir con flecha, bajar una y elegir con Enter. Es lo minimo que un
  // `<select>` nativo hace y lo primero que se pierde al sustituirlo.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.selector-set-lista')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(page.locator('.selector-set-lista')).toBeHidden();
  // El foco vuelve al boton: sin esto, el teclado se queda en ninguna parte.
  await expect(boton).toBeFocused();
  // Y ha elegido algo de verdad, no el hueco vacio.
  await expect(boton).not.toContainText('Elige un set...');
  // Lo elegido es un set real, y el boton de abrir deja de estar deshabilitado.
  await expect(page.getByRole('button', { name: 'Abrir' })).toBeEnabled();
  expect(set.name.length).toBeGreaterThan(0);

  // Escape cierra sin elegir.
  const antes = await boton.textContent();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.locator('.selector-set-lista')).toBeHidden();
  expect(await boton.textContent()).toBe(antes);
});

test('el selector no se sale de su columna (P-030)', async ({ page, usuario }) => {
  // La leccion de P-030, aplicada al control nuevo: el `<select>` anterior se
  // dimensionaba a su opcion mas larga y medía 614 px dentro de 530. Salio al
  // MIRAR una captura, no del DOM, y por eso quedo como asercion.
  await iniciarSesion(page, usuario.token);
  await page.goto('/sobres');

  const desbordamiento = await page.evaluate(() => {
    const control = document.querySelector('.selector-set');
    const contenedor = control?.parentElement;
    if (!control || !contenedor) return null;
    const c = control.getBoundingClientRect();
    const p = contenedor.getBoundingClientRect();
    return { derechaControl: Math.round(c.right), derechaContenedor: Math.round(p.right) };
  });

  expect(desbordamiento).not.toBeNull();
  expect(
    desbordamiento!.derechaControl,
    `el selector se sale: ${desbordamiento!.derechaControl} > ${desbordamiento!.derechaContenedor}`,
  ).toBeLessThanOrEqual(desbordamiento!.derechaContenedor);
});

test('la coleccion ensena el icono junto a cada set', async ({ page, request, usuario }) => {
  // Se abre un sobre AQUI en vez de confiar en que otro test lo haya hecho. Un
  // test que se salta por falta de datos no prueba nada, y uno que depende del
  // orden de ejecucion falla el dia que ese orden cambie.
  const set = await setAbribleDeYgo(request);
  await abrirUnSobrePorApi(request, usuario.token, set.id);

  await iniciarSesion(page, usuario.token);
  await page.goto('/coleccion');

  const fila = page.locator('.fila-set').first();
  await expect(fila).toBeVisible();

  const icono = fila.locator('img.icono-set');
  await expect(icono).toBeVisible();
  expect(await icono.getAttribute('src')).toMatch(/^\/images\//);
  expect(
    await icono.evaluate((e) => (e as HTMLImageElement).naturalWidth),
    'el icono del panel no ha cargado',
  ).toBeGreaterThan(0);

  await page.screenshot({ path: 'artefactos/coleccion-iconos.png', fullPage: true });
});
