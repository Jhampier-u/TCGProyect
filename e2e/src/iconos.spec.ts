import { test, expect, abrirUnSobrePorApi, iniciarSesion, setAbribleDeYgo } from './fixtures.js';

/**
 * T-066 -- los iconos de set, por fin visibles.
 *
 * Estaban cosechados desde S027 y la API los servia en `iconPath`, pero no se
 * veian: un `<option>` no puede contener una imagen. El `<select>` se sustituyo
 * por un control propio, y eso significa reimplementar a mano lo que el nativo
 * daba gratis. Esta suite comprueba justo eso, porque es lo que se pierde sin
 * darse cuenta.
 *
 * Desde T-095 el control se busca por lo que ES -- un boton que despliega una
 * `listbox` de `option` -- y no por sus clases.
 */

test('el selector de sets ensena iconos y son rutas LOCALES', async ({ page, usuario }) => {
  await iniciarSesion(page, usuario.token);
  await page.goto('/sobres');

  const boton = page.getByRole('button', { name: /^Set:/ });
  await expect(boton).toBeVisible();
  await boton.click();

  const lista = page.getByRole('listbox', { name: 'Set' });
  await expect(lista.getByRole('option').first()).toBeVisible();

  // Al menos un icono, y NINGUNO apuntando fuera: servir la url del origen es
  // el hotlinking que castiga con lista negra de IP (P-001, P-022). Los iconos
  // llevan `alt=""` a proposito -- el nombre va al lado en texto --, asi que no
  // tienen rol `img` y se buscan como imagenes dentro de la lista.
  const iconos = lista.locator('img');
  expect(await iconos.count()).toBeGreaterThan(0);
  for (const src of await iconos.evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''))) {
    expect(src, `un icono apunta fuera: ${src}`).toMatch(/^\/images\//);
  }

  // Y se cargan de verdad: un `<img>` roto tambien "esta visible", que es como
  // P-036 se paso quince 404 sin que nadie lo notara.
  //
  // Se ESPERA a que carguen en vez de mirar un instante, y solo los que estan
  // DENTRO de la parte visible de la lista: van con `loading="lazy"`, asi que
  // los de mas abajo ni se han pedido.
  await expect
    .poll(
      async () =>
        lista.evaluate((ul) => {
          const caja = ul.getBoundingClientRect();
          return Array.from(ul.querySelectorAll('img'))
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.top >= caja.top && r.bottom <= caja.bottom;
            })
            .filter((e) => !e.complete || e.naturalWidth === 0)
            .map((e) => e.getAttribute('src') ?? '?');
        }),
      { timeout: 10_000, message: 'iconos visibles que no llegaron a cargar' },
    )
    .toEqual([]);

  await page.screenshot({ path: 'artefactos/selector-iconos.png' });
});

test('el selector se maneja entero con el teclado', async ({ page, usuario }) => {
  const set = await setAbribleDeYgo(page.request);
  await iniciarSesion(page, usuario.token);
  await page.goto('/sobres');

  const boton = page.getByRole('button', { name: /^Set:/ });
  await boton.focus();

  // Abrir con flecha, bajar una y elegir con Enter. Es lo minimo que un
  // `<select>` nativo hace y lo primero que se pierde al sustituirlo.
  await page.keyboard.press('ArrowDown');
  const lista = page.getByRole('listbox', { name: 'Set' });
  await expect(lista).toBeVisible();
  // Los sets llegan de la API: hasta entonces la lista solo tiene la opcion
  // vacia, y "bajar una" no tendria adonde ir. Se espera a que haya sets, que
  // es lo que haria una persona; si nunca llegan, el test falla aqui y lo dice.
  await expect
    .poll(() => lista.getByRole('option').count(), { message: 'la lista de sets no llego a cargarse' })
    .toBeGreaterThan(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(lista).toBeHidden();
  // El foco vuelve al boton: sin esto, el teclado se queda en ninguna parte.
  await expect(boton).toBeFocused();
  // Y ha elegido algo de verdad, no el hueco vacio: el nombre lo dice.
  await expect(boton).not.toHaveAccessibleName(/Elige un set/);
  await expect(page.getByRole('button', { name: 'Abrir' })).toBeEnabled();
  expect(set.name.length).toBeGreaterThan(0);

  // Escape cierra sin elegir.
  const antes = await boton.getAttribute('aria-label');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Set' })).toBeHidden();
  expect(await boton.getAttribute('aria-label')).toBe(antes);
});

test('el selector no se sale de su columna (P-030)', async ({ page, usuario }) => {
  // La leccion de P-030, aplicada al control nuevo: el `<select>` anterior se
  // dimensionaba a su opcion mas larga y medía 614 px dentro de 530. Salio al
  // MIRAR una captura, no del DOM, y por eso quedo como asercion.
  //
  // Aqui se mide contra la pagina, que es donde vive el selector de Sobres. El
  // sitio donde mordio de verdad -- la columna estrecha del editor -- se mide en
  // `mazos.spec.ts` contra la region "Buscador de cartas", que es mas exigente.
  await iniciarSesion(page, usuario.token);
  await page.goto('/sobres');
  const boton = page.getByRole('button', { name: /^Set:/ });
  const main = page.getByRole('main');

  const control = await boton.boundingBox();
  const contenedor = await main.boundingBox();
  expect(control).not.toBeNull();
  expect(contenedor).not.toBeNull();
  expect(
    Math.round(control!.x + control!.width),
    'el selector de sets se sale de la pagina',
  ).toBeLessThanOrEqual(Math.round(contenedor!.x + contenedor!.width));
});

test('la coleccion ensena el icono junto a cada set', async ({ page, request, usuario }) => {
  // Se abre un sobre AQUI en vez de confiar en que otro test lo haya hecho. Un
  // test que se salta por falta de datos no prueba nada, y uno que depende del
  // orden de ejecucion falla el dia que ese orden cambie.
  const set = await setAbribleDeYgo(request);
  await abrirUnSobrePorApi(request, usuario.token, set.id);

  await iniciarSesion(page, usuario.token);
  await page.goto('/coleccion');

  const fila = page.getByRole('list', { name: 'Completitud por set' }).getByRole('listitem').first();
  await expect(fila).toBeVisible();

  const icono = fila.locator('img');
  await expect(icono).toBeVisible();
  expect(await icono.getAttribute('src')).toMatch(/^\/images\//);
  await expect
    .poll(() => icono.evaluate((e) => (e as HTMLImageElement).naturalWidth), {
      message: 'el icono del panel no ha cargado',
    })
    .toBeGreaterThan(0);

  await page.screenshot({ path: 'artefactos/coleccion-iconos.png', fullPage: true });
});
