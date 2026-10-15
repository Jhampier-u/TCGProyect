import { test, expect, crearMazo, iniciarSesion, setAbribleDeYgo } from './fixtures.js';

/**
 * T-053 -- la interfaz de mazos, vista de verdad.
 *
 * En S021 y S022 se verifico por DOM y por panel de red porque el panel del
 * navegador no componia imagenes: el comportamiento quedo comprobado y la
 * apariencia no la vio nadie. Las capturas de este test son lo que cierra eso.
 *
 * Desde T-095 se busca por rol: las dos columnas son regiones con nombre, las
 * zonas son regiones con el suyo y los problemas son una lista.
 */

test('el editor de mazos se pinta y valida en cliente', async ({ page, request, usuario }) => {
  await setAbribleDeYgo(request); // precondicion: hay catalogo que buscar
  const deckId = await crearMazo(request, usuario.token, 'Mazo E2E');
  await iniciarSesion(page, usuario.token);

  await page.goto(`/mazos/${deckId}`);
  await expect(page.getByRole('heading', { name: 'Mazo E2E' })).toBeVisible();

  // Un mazo recien creado esta vacio: la validacion lo dice.
  const problemas = page.getByRole('list', { name: 'Problemas del mazo' });
  await expect(problemas.getByRole('listitem').first()).toContainText('mazo principal');

  // Las dos columnas del editor y las tres zonas de Yu-Gi-Oh!.
  const buscador = page.getByRole('region', { name: 'Buscador de cartas' });
  const mazo = page.getByRole('region', { name: 'Tu mazo' });
  await expect(buscador).toBeVisible();
  await expect(mazo).toBeVisible();
  await expect(mazo.getByRole('region')).toHaveCount(3);

  // P-030: el selector de sets se salia de su columna. El `<select>` original se
  // dimensionaba a su opcion mas larga y los nombres de set de Yu-Gi-Oh! son
  // largos: en la columna estrecha del editor medía 614 px dentro de 530 y se
  // solapaba con el panel del mazo. Salio al MIRAR una captura, no del DOM.
  const control = await buscador.getByRole('button', { name: /^Set:/ }).boundingBox();
  const columna = await buscador.boundingBox();
  expect(
    Math.round(control!.x + control!.width) - Math.round(columna!.x + columna!.width),
    'el selector de sets se sale de su columna',
  ).toBeLessThanOrEqual(0);

  await page.screenshot({ path: 'artefactos/mazos-editor-vacio.png', fullPage: true });

  // Anadir una carta desde el buscador y ver que aparece en una zona.
  await buscador.getByRole('textbox', { name: 'Buscar por nombre' }).fill('a');
  const resultados = buscador.getByRole('list', { name: 'Resultados' });
  await expect(resultados.getByRole('listitem').first()).toBeVisible();
  await resultados.getByRole('button', { name: 'Añadir' }).first().click();

  await expect(mazo.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeEnabled();

  await page.screenshot({ path: 'artefactos/mazos-editor-con-carta.png', fullPage: true });
});

test('la lista de mazos muestra el mazo creado', async ({ page, request, usuario }) => {
  await crearMazo(request, usuario.token, 'Mazo en la lista');
  await iniciarSesion(page, usuario.token);

  await page.goto('/mazos');

  // Lo que este test comprueba es que el mazo CREADO sale en la lista, no
  // cuantos hay: la cuenta se comparte entre tests (T-072).
  const fila = page
    .getByRole('list', { name: 'Tus mazos' })
    .getByRole('listitem')
    .filter({ hasText: 'Mazo en la lista' });
  await expect(fila).toHaveCount(1);
  await expect(fila.getByRole('link', { name: 'Mazo en la lista' })).toBeVisible();

  await page.screenshot({ path: 'artefactos/mazos-lista.png', fullPage: true });
});
