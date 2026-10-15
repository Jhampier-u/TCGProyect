import type { Locator, Page } from '@playwright/test';
import { API, test, expect, abrirUnSobrePorApi, crearMazo, iniciarSesion, setAbrible } from './fixtures.js';

/**
 * T-093 y T-094 -- el catalogo «Consulta» y la ficha de carta.
 *
 * El criterio de aceptacion de T-093 es una frase: alguien que no conoce el
 * proyecto tiene que poder pedir "las de Planta de este set que me faltan" sin
 * instrucciones. El primer test es esa frase, con el tipo que el set tenga.
 */

/** Una fila del rail: un boton-interruptor con su etiqueta y su cifra. */
function filaDelRail(page: Page, etiqueta: string | RegExp): Locator {
  return page.getByRole('navigation', { name: 'Estructura' }).getByRole('button', { name: etiqueta });
}

/** "2 de 35" -> { tengo: 2, total: 35 }. */
function cifras(texto: string): { tengo: number; total: number } {
  const m = /(\d+) de (\d+)/.exec(texto);
  if (!m) throw new Error(`La fila del rail no dice "N de M": ${texto}`);
  return { tengo: Number(m[1]), total: Number(m[2]) };
}

test('"las de un tipo de este set que me faltan", sin instrucciones', async ({ page, request, usuario }) => {
  const set = await setAbrible(request, 'PTCG');
  // Sin nada abierto, "me faltan" es el set entero y el test no distinguiria
  // el filtro de su ausencia.
  await abrirUnSobrePorApi(request, usuario.token, set.id);
  await iniciarSesion(page, usuario.token);

  await page.goto(`/ptcg/catalogo?set=${set.externalId}`);
  await expect(page.getByRole('heading', { level: 1, name: set.name })).toBeVisible();

  // El rail ya contesta antes de pulsar: cada tipo dice "N de M".
  const tipos = page.getByRole('navigation', { name: 'Estructura' })
    .getByRole('region', { name: 'Tipo' })
    .getByRole('button');
  await expect(tipos.first()).toBeVisible();

  // Un tipo donde falte algo y que quepa en una pagina, para poder contar filas.
  let elegido: { nombre: string; faltan: number } | null = null;
  for (const fila of await tipos.all()) {
    const texto = (await fila.textContent()) ?? '';
    const { tengo, total } = cifras(texto);
    const faltan = total - tengo;
    if (faltan > 0 && faltan <= 60) {
      elegido = { nombre: texto.replace(/\d+ de \d+/, '').trim(), faltan };
      break;
    }
  }
  expect(elegido, 'ningun tipo del set tiene entre 1 y 60 cartas que falten').not.toBeNull();

  await filaDelRail(page, 'Me faltan').click();
  await filaDelRail(page, new RegExp(`^${elegido!.nombre}`)).click();

  // El estado esta en la URL -- se comparte y vuelve con atras --...
  await expect(page).toHaveURL(/owned=no/);
  await expect(page).toHaveURL(/type=/);
  // ...los dos filtros son interruptores pulsados...
  await expect(filaDelRail(page, 'Me faltan')).toHaveAttribute('aria-pressed', 'true');
  // ...y salen como chips borrables.
  const chips = page.getByRole('group', { name: 'Filtros activos' });
  await expect(chips.getByRole('button', { name: `Quitar el filtro ${elegido!.nombre}` })).toBeVisible();
  await expect(chips.getByRole('button', { name: 'Quitar el filtro Me faltan' })).toBeVisible();

  // LA COMPROBACION QUE IMPORTA: la tabla tiene exactamente las que el rail
  // decia que faltaban, y ninguna es una que se tenga.
  const filas = page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(filas).toHaveCount(elegido!.faltan);
  await expect(page.getByRole('table').getByRole('img', { name: 'La tienes' })).toHaveCount(0);

  // Quitar un chip quita ESE filtro y deja el otro.
  await chips.getByRole('button', { name: 'Quitar el filtro Me faltan' }).click();
  await expect(page).not.toHaveURL(/owned=no/);
  await expect(page).toHaveURL(/type=/);

  // Y el boton de atras lo devuelve: el filtro esta en el historial.
  await page.goBack();
  await expect(page).toHaveURL(/owned=no/);

  await page.screenshot({ path: 'artefactos/catalogo-me-faltan.png', fullPage: true });
});

test('sin sesion el catalogo es publico y "me faltan" invita a entrar', async ({ page, request }) => {
  const set = await setAbrible(request, 'PTCG');
  // Una URL compartida con `owned=no` no puede dejar a un anonimo con un error:
  // la API contestaria 401, y la interfaz no debe ni preguntar.
  await page.goto(`/ptcg/catalogo?set=${set.externalId}&owned=no`);

  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText('Inicia sesión para filtrar las que te faltan.')).toBeVisible();
  await expect(filaDelRail(page, 'Me faltan')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('el rail se maneja con el teclado', async ({ page, request, usuario }) => {
  const set = await setAbrible(request, 'PTCG');
  await iniciarSesion(page, usuario.token);
  await page.goto(`/ptcg/catalogo?set=${set.externalId}`);

  const meFaltan = filaDelRail(page, 'Me faltan');
  await meFaltan.focus();
  await page.keyboard.press('Enter');
  await expect(meFaltan).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press(' ');
  await expect(meFaltan).toHaveAttribute('aria-pressed', 'false');
});

test('la ficha es un dialogo: se abre por la URL, Escape la cierra y el foco vuelve', async ({
  page, request, usuario,
}) => {
  const set = await setAbrible(request, 'PTCG');
  await iniciarSesion(page, usuario.token);
  await page.goto(`/ptcg/catalogo?set=${set.externalId}`);

  const nombre = page.getByRole('table').getByRole('button').first();
  const textoDelNombre = (await nombre.textContent())!.trim();
  await nombre.click();

  const ficha = page.getByRole('dialog', { name: textoDelNombre });
  await expect(ficha).toBeVisible();
  await expect(page).toHaveURL(/carta=\d+/);
  // Lo de Pokemon: la marca de regulacion siempre dice algo, con marca o sin
  // ella -- la ausencia se explica, no se pinta un guion.
  await expect(ficha.getByText('Marca de regulación')).toBeVisible();

  await page.screenshot({ path: 'artefactos/ficha.png' });

  await page.keyboard.press('Escape');
  await expect(ficha).toBeHidden();
  await expect(page).not.toHaveURL(/carta=/);
  // Sin devolver el foco, quien navega con teclado vuelve al principio de una
  // tabla de 300 filas.
  await expect(nombre).toBeFocused();

  // El boton de atras tambien la cierra: la ficha es una entrada del historial.
  await nombre.click();
  await expect(ficha).toBeVisible();
  await page.goBack();
  await expect(ficha).toBeHidden();
});

test('la ficha anade la carta a un mazo de verdad', async ({ page, request, usuario }) => {
  const set = await setAbrible(request, 'PTCG');
  const nombreDeMazo = `Mazo de la ficha ${Date.now()}`;
  const deckId = await crearMazo(request, usuario.token, nombreDeMazo, 'PTCG');
  await iniciarSesion(page, usuario.token);
  await page.goto(`/ptcg/catalogo?set=${set.externalId}`);

  await page.getByRole('table').getByRole('button').first().click();
  const ficha = page.getByRole('dialog');
  await ficha.getByRole('combobox', { name: 'Mazo' }).selectOption({ label: nombreDeMazo });
  await ficha.getByRole('button', { name: 'Añadir' }).click();
  await expect(ficha.getByRole('status')).toContainText(`Añadida a «${nombreDeMazo}»`);

  // Lo que dice la pantalla, comprobado donde se guarda.
  const res = await request.get(`${API}/api/decks/${deckId}`, {
    headers: { authorization: `Bearer ${usuario.token}` },
  });
  const { data } = (await res.json()) as { data: { counts: { main: number } } };
  expect(data.counts.main).toBe(1);
});
