import { test, expect, crearMazo, iniciarSesion, setAbribleDeYgo } from './fixtures.js';

/**
 * T-053 — la interfaz de mazos, vista de verdad.
 *
 * En S021 y S022 se verifico por DOM y por panel de red porque el panel del
 * navegador no componia imagenes: el comportamiento quedo comprobado y la
 * apariencia no la vio nadie. Las capturas de este test son lo que cierra eso.
 */

test('el editor de mazos se pinta y valida en cliente', async ({ page, request, usuario }) => {
  await setAbribleDeYgo(request); // precondicion: hay catalogo que buscar
  const deckId = await crearMazo(request, usuario.token, 'Mazo E2E');
  await iniciarSesion(page, usuario.token);

  await page.goto(`/mazos/${deckId}`);
  await expect(page.getByRole('heading', { name: 'Mazo E2E' })).toBeVisible();

  // Un mazo recien creado esta vacio: la validacion lo dice.
  await expect(page.locator('.problemas li').first()).toContainText('mazo principal');

  // Las tres zonas de Yu-Gi-Oh! y las dos columnas del editor.
  await expect(page.locator('.zona')).toHaveCount(3);
  await expect(page.locator('.editor .editor-columna')).toHaveCount(2);

  // P-030: el selector de sets se salia de su columna. El `<select>` original se
  // dimensionaba a su opcion mas larga y los nombres de set de Yu-Gi-Oh! son
  // largos: en la columna estrecha del editor medía 614 px dentro de 530 y se
  // solapaba con el panel del mazo. Salio al MIRAR una captura, no del DOM.
  //
  // Desde T-066 el control es propio y NO hereda ese comportamiento -- pero
  // tampoco hereda la leccion, asi que la asercion se mantiene sobre el nuevo.
  const desbordamiento = await page.evaluate(() => {
    const filtros = document.querySelector('.filtros') as HTMLElement;
    const control = filtros.querySelector('.selector-set') as HTMLElement;
    const columna = filtros.closest('.editor-columna') as HTMLElement;
    return (
      Math.round(control.getBoundingClientRect().right) -
      Math.round(columna.getBoundingClientRect().right)
    );
  });
  expect(desbordamiento, 'el selector de sets se sale de su columna').toBeLessThanOrEqual(0);

  await page.screenshot({ path: 'artefactos/mazos-editor-vacio.png', fullPage: true });

  // Anadir una carta desde el buscador y ver que aparece en una zona.
  await page.locator('.filtros input').fill('a');
  await expect(page.locator('.buscador-fila').first()).toBeVisible();
  await page.locator('.buscador-fila button').first().click();

  await expect(page.locator('.linea-carta')).toHaveCount(1);
  await expect(page.locator('.barra-guardar button')).toHaveText('Guardar');

  await page.screenshot({ path: 'artefactos/mazos-editor-con-carta.png', fullPage: true });
});

test('la lista de mazos muestra el mazo creado', async ({ page, request, usuario }) => {
  await crearMazo(request, usuario.token, 'Mazo en la lista');
  await iniciarSesion(page, usuario.token);

  await page.goto('/mazos');

  // Lo que este test comprueba es que el mazo CREADO sale en la lista. Antes
  // exigia ademas que la lista tuviera exactamente una fila, y eso ataba el test
  // a que la cuenta estuviera recien hecha: al compartir usuario entre tests
  // (T-072) empezo a ver dos. La cuenta de filas nunca fue el sujeto.
  const fila = page.locator('.mazo-fila', { hasText: 'Mazo en la lista' });
  await expect(fila).toHaveCount(1);
  await expect(fila.getByRole('link', { name: 'Mazo en la lista' })).toBeVisible();

  await page.screenshot({ path: 'artefactos/mazos-lista.png', fullPage: true });
});
