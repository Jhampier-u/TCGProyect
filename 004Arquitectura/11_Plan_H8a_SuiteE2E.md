# Plan de implementación — H8a, suite E2E con Playwright

> **Para quien ejecute esto:** las tareas se hacen **en orden** y cada una acaba con su commit.
> Spec de referencia: [`10_Spec_H8a_SuiteE2E.md`](10_Spec_H8a_SuiteE2E.md).

**Objetivo:** traer un navegador de verdad al repositorio y cerrar con él las dos tareas que llevan
bloqueadas por no tener uno: **T-040** (el volteo de las cartas) y **T-053** (la interfaz de mazos).

**Arquitectura:** un paquete `e2e/` fuera de los workspaces, con su propio `package.json`, que corre
en un servicio de compose con perfil sobre la imagen oficial de Playwright. La suite no ingesta:
comprueba su precondición y se detiene con el comando exacto si faltan datos.

**Tech stack:** Playwright, Docker Compose. Ninguna dependencia nueva en `api`, `web` ni `shared`.

**Antes de empezar:** `npm run build && npm test` limpios y `docker compose up -d` levantado.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `e2e/package.json` | Paquete propio. **No** es un workspace de npm |
| `e2e/playwright.config.ts` | URL base por entorno, artefactos, `reducedMotion` explícito |
| `e2e/src/fixtures.ts` | Usuario por API, precondición de datos, sesión en el navegador |
| `e2e/src/humo.spec.ts` | Carga, navegación, consola limpia, sin URLs externas |
| `e2e/src/sobres.spec.ts` | **T-040**: el volteo, con su comprobación de no-vacuidad |
| `e2e/src/mazos.spec.ts` | **T-053**: la interfaz de mazos, con capturas |
| `docker/e2e.Dockerfile` | Imagen sobre `mcr.microsoft.com/playwright` |
| `docker-compose.yml` | **Modificar**: servicio `e2e` con perfil |
| `.gitignore` | **Modificar**: `e2e/artefactos/` y `e2e/node_modules/` |
| `004Arquitectura/00_ADR.md` | **Modificar**: ADR-009 |

---

## Tarea 1 — T-055: andamiaje y un test trivial en verde

**Esta tarea existe para descubrir pronto si el entorno da.** No se escribe nada más hasta que un
test trivial esté en verde dentro de Docker.

**Ficheros:**
- Crear: `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/src/humo.spec.ts`
- Crear: `docker/e2e.Dockerfile`
- Modificar: `docker-compose.yml`, `.gitignore`

- [ ] **Paso 1: crear el paquete**

`e2e/package.json`:

```json
{
  "name": "e2e",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Suite E2E con Playwright. NO es un workspace de npm a proposito: si lo fuera, el npm ci de las imagenes de api y web arrastraria Playwright a dos contenedores que no lo necesitan.",
  "scripts": {
    "test": "playwright test"
  }
}
```

- [ ] **Paso 2: instalar Playwright y anotar la versión**

```bash
cd e2e && npm install --save-dev @playwright/test && cd ..
```

Esperado: se crean `e2e/node_modules/` y `e2e/package-lock.json`.

Después, **lee la versión instalada**, porque la etiqueta de la imagen de Docker tiene que coincidir
con ella:

```bash
node -p "require('./e2e/node_modules/@playwright/test/package.json').version"
```

Anota ese número: en el paso 5 se usa como `v<version>-noble`.

- [ ] **Paso 3: la configuración**

`e2e/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

/**
 * La URL base sale del entorno para que el mismo test corra dentro de compose
 * (`http://web:5173`) y contra el host mientras se itera.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './src',
  timeout: 30_000,
  // SIN reintentos. Un test E2E que solo pasa al segundo intento esta roto, y
  // esconderlo detras de un retry es como no tenerlo.
  retries: 0,
  // Un solo worker: los tests comparten la misma base de datos. Cada uno crea
  // su propio usuario, pero el catalogo y los sobres son estado comun.
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'artefactos/informe', open: 'never' }]],
  outputDir: './artefactos/salida',
  use: {
    baseURL,
    /**
     * EXPLICITO a proposito, no por confiar en el valor por defecto.
     *
     * `PackReveal` llama a `useReducedMotion()`: con movimiento reducido revela
     * TODAS las cartas de golpe, sin volteo y sin clics. Un test que corriera
     * asi pasaria sin ejercitar la animacion (ver 5.2 del spec).
     */
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Paso 4: el test trivial**

`e2e/src/humo.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('la aplicacion carga', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ProyectoTCG/);
});
```

- [ ] **Paso 5: la imagen**

`docker/e2e.Dockerfile`. **Sustituye `1.50.0` por la versión que anotaste en el paso 2**: la etiqueta
de la imagen y el paquete tienen que ser la misma versión, o los navegadores que trae la imagen no
serán los que Playwright espera.

```dockerfile
# syntax=docker/dockerfile:1
#
# Suite E2E (H8a). Sobre la imagen oficial de Playwright, que ya trae los
# navegadores y las dependencias de sistema que necesitan.
#
# La etiqueta DEBE coincidir con la version de @playwright/test en
# e2e/package-lock.json. Si divergen, Playwright busca navegadores que la imagen
# no tiene y falla al arrancar con un mensaje poco obvio.
FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

COPY e2e/package.json e2e/package-lock.json ./
RUN npm ci

COPY e2e/playwright.config.ts ./
COPY e2e/src ./src

CMD ["npx", "playwright", "test"]
```

- [ ] **Paso 6: el servicio de compose**

En `docker-compose.yml`, justo después del servicio `ingest`:

```yaml
  # Suite E2E. Perfil, no servicio: se ejecuta a mano y termina.
  #   docker compose --profile e2e run --rm e2e
  e2e:
    profiles: ["e2e"]
    build:
      context: .
      dockerfile: docker/e2e.Dockerfile
    depends_on:
      api:
        condition: service_healthy
      web:
        condition: service_started
    environment:
      E2E_BASE_URL: http://web:5173
      E2E_API_URL: http://api:3000
    volumes:
      # Los artefactos salen al host para poder mirarlos: es medio sentido de
      # T-053.
      - ./e2e/artefactos:/app/artefactos
```

- [ ] **Paso 7: ignorar lo que no va a git**

En `.gitignore`, añadir al final:

```
# suite E2E
e2e/node_modules/
e2e/artefactos/
```

Y en `.dockerignore`, comprobar que `**/node_modules` ya cubre `e2e/node_modules`. Añadir además:

```
e2e/artefactos
```

- [ ] **Paso 8: ejecutar, que es el punto de la tarea**

```bash
docker compose up -d
docker compose --profile e2e run --rm e2e
```

Esperado: `1 passed`.

**Si falla aquí, para y diagnostica antes de seguir.** Esta tarea existe justamente para eso: si el
entorno no puede correr un navegador headless, es mejor saberlo ahora que después de escribir tres
recorridos. Mira el mensaje: si se queja de navegadores que faltan, la etiqueta de la imagen no
coincide con la versión del paquete (paso 5).

- [ ] **Paso 9: commit**

```bash
git add e2e/ docker/e2e.Dockerfile docker-compose.yml .gitignore .dockerignore
git commit -m "test(e2e): add the Playwright scaffolding and a first green test (T-055)"
```

---

## Tarea 2 — T-056: ADR-009

**Ficheros:**
- Modificar: `004Arquitectura/00_ADR.md`

- [ ] **Paso 1: escribir la decisión**

Añadir al final de `004Arquitectura/00_ADR.md`:

```markdown
---

## ADR-009 — Playwright en lugar de Cypress para la suite E2E

**Fecha:** 2026-08-26 · **Sesión:** S023 · **Estado:** aceptada

### Contexto

El criterio de aceptación de H8 dice "suite Cypress verde" y se escribió en **S001**, cuando el
proyecto no tenía monorepo, ni contenedores, ni frontend. En S019 (T-004) todo pasó a correr en
Docker, y la suite E2E tiene que correr ahí para ser reproducible.

### Opciones

| | Playwright | Cypress |
|---|---|---|
| Headless | Por defecto | Necesita su Electron o un display |
| Docker | Imagen oficial mantenida | `cypress/included`, ~1,5 GB |
| Navegadores | `playwright install` los fija de forma determinista | Ligados a la versión del paquete |
| Modelo de ejecución | Controla el navegador **desde fuera** | Corre **dentro** de la página |
| TypeScript | Nativo | Con configuración añadida |

### Decisión

**Playwright.**

Lo que más pesa no es la comodidad, es el modelo de ejecución: controlar el navegador desde fuera
permite esperar a que una animación **termine** y leer el estilo calculado del elemento. Eso es
exactamente lo que necesita **T-040**, que lleva bloqueada desde S017 porque
`requestAnimationFrame` no avanzaba y no había forma de distinguir "se pidió el volteo" de "el
volteo ocurrió".

### Consecuencias

- Se abandona el ecosistema de Cypress y su modo interactivo, que es mejor que el de Playwright.
- Se cambia un criterio de aceptación escrito 22 sesiones antes. Queda aquí y no como un cambio
  silencioso: quien lea H8 y espere Cypress encontrará el motivo.
- `e2e/` queda **fuera** de los workspaces de npm para que Playwright no viaje a las imágenes de
  `api` y `web`. La contrapartida es que `npm audit` de la raíz no lo cubre, y por eso la suite
  lleva su propia auditoría.
```

- [ ] **Paso 2: commit**

```bash
git add 004Arquitectura/00_ADR.md
git commit -m "docs(adr): record ADR-009, Playwright instead of Cypress (T-056)"
```

---

## Tarea 3 — T-057: utilidades compartidas

**Ficheros:**
- Crear: `e2e/src/fixtures.ts`

- [ ] **Paso 1: escribir las utilidades**

`e2e/src/fixtures.ts`:

```ts
import type { APIRequestContext, Page } from '@playwright/test';

/**
 * La API se llama directamente para montar precondiciones.
 *
 * Hacer login por formulario en cada test solo anade tiempo y motivos de fallo
 * ajenos a lo que se esta probando. El navegador se reserva para lo que esta
 * bajo prueba.
 */
export const API = process.env.E2E_API_URL ?? 'http://localhost:3000';

/** Clave con la que `auth.tsx` guarda el token. */
const CLAVE_TOKEN = 'tcg.token';

export interface Usuario {
  email: string;
  token: string;
}

/**
 * Crea un usuario nuevo con correo unico.
 *
 * Unico por ejecucion Y por test: sin estado compartido no hay orden obligatorio
 * entre tests, que es de donde sale la mitad de la intermitencia de una suite
 * E2E.
 */
export async function crearUsuario(request: APIRequestContext, etiqueta: string): Promise<Usuario> {
  const email = `e2e-${etiqueta}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  const res = await request.post(`${API}/api/auth/register`, {
    data: { email, displayName: 'E2E', password: 'contrasena-larga-e2e-1' },
  });
  if (!res.ok()) {
    throw new Error(`No se pudo crear el usuario de prueba: ${res.status()} ${await res.text()}`);
  }
  const cuerpo = (await res.json()) as { token: string };
  return { email, token: cuerpo.token };
}

export interface SetAbrible {
  id: number;
  name: string;
  poolSize: number;
}

/**
 * Precondicion de datos.
 *
 * La suite NO ingesta a proposito: hacerlo ataria cada ejecucion a tres APIs de
 * terceros, una de las cuales responde 200 solo el ~30 % de las veces (P-016).
 * Una suite que falla porque Pokemon esta caido no mide nada y ensena a ignorar
 * los rojos. Se comprueba y se falla ruidosamente con el comando exacto.
 */
export async function setAbribleDeYgo(request: APIRequestContext): Promise<SetAbrible> {
  const res = await request.get(`${API}/api/games/YGO/sets`);
  if (!res.ok()) {
    throw new Error(`La API no responde en ${API}: ${res.status()}`);
  }
  const { data } = (await res.json()) as { data: SetAbrible[] };
  const abrible = data.find((s) => s.poolSize > 0);
  if (!abrible) {
    throw new Error(
      'FALTAN DATOS: no hay ningun set de Yu-Gi-Oh! con cartas abribles.\n' +
        'Ejecuta:  docker compose --profile ingest run --rm ingest --game YGO --sets 4',
    );
  }
  return abrible;
}

/**
 * Deja la sesion puesta antes de que la aplicacion arranque.
 *
 * `addInitScript` corre antes que el codigo de la pagina, asi que `AuthProvider`
 * ya encuentra el token al montarse. Rellenar el formulario funcionaria, pero
 * probaria el login en cada test en vez de probarlo una vez.
 */
export async function iniciarSesion(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ([clave, valor]) => window.localStorage.setItem(clave, valor),
    [CLAVE_TOKEN, token] as const,
  );
}

/** Crea un mazo por API y devuelve su id. */
export async function crearMazo(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<number> {
  const res = await request.post(`${API}/api/decks`, {
    headers: { authorization: `Bearer ${token}` },
    data: { game: 'YGO', name },
  });
  if (!res.ok()) {
    throw new Error(`No se pudo crear el mazo: ${res.status()} ${await res.text()}`);
  }
  const cuerpo = (await res.json()) as { data: { id: number } };
  return cuerpo.data.id;
}
```

- [ ] **Paso 2: comprobar que compila y que la precondición se detecta**

```bash
docker compose --profile e2e run --rm e2e
```

Esperado: sigue pasando el test trivial (`1 passed`). `fixtures.ts` no tiene tests propios: lo
ejercitan las tareas siguientes.

- [ ] **Paso 3: commit**

```bash
git add e2e/src/fixtures.ts
git commit -m "test(e2e): add shared fixtures and the data precondition (T-057)"
```

---

## Tarea 4 — T-058: recorrido de humo

**Ficheros:**
- Modificar: `e2e/src/humo.spec.ts`

- [ ] **Paso 1: escribir el recorrido**

Sustituir `e2e/src/humo.spec.ts` entero por:

```ts
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

  for (const [enlace, titulo] of [
    ['Abrir sobres', 'Abrir sobres'],
    ['Mi coleccion', 'Mi coleccion'],
    ['Mis mazos', 'Mis mazos'],
  ] as const) {
    await page.getByRole('link', { name: enlace }).click();
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
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
```

- [ ] **Paso 2: ejecutar**

```bash
docker compose --profile e2e run --rm e2e
```

Esperado: `2 passed`.

Si el test de consola falla, **lee lo que trae `errores`**: es un fallo real de la aplicación, no del
test. Ése es el sentido de la comprobación.

- [ ] **Paso 3: commit**

```bash
git add e2e/src/humo.spec.ts
git commit -m "test(e2e): add the smoke journey with a clean-console assertion (T-058)"
```

---

## Tarea 5 — T-059: el volteo de las cartas (T-040)

El que lleva bloqueado desde S017.

**Ficheros:**
- Crear: `e2e/src/sobres.spec.ts`

- [ ] **Paso 1: escribir el recorrido**

`e2e/src/sobres.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { crearUsuario, iniciarSesion, setAbribleDeYgo } from './fixtures.js';

/**
 * T-040 — el volteo de las cartas.
 *
 * Bloqueado desde S017: alli se midio que `requestAnimationFrame` no avanzaba
 * ni un fotograma en 500 ms, asi que la logica quedo verificada y la animacion
 * no. Playwright controla el navegador desde fuera y puede esperar a que la
 * animacion TERMINE, que es la diferencia entre "se pidio el volteo" y "el
 * volteo ocurrio" (ADR-009).
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

async function abrirUnSobre(page: Page, setId: number): Promise<void> {
  await page.goto('/sobres');
  await expect(page.getByRole('heading', { name: 'Abrir sobres' })).toBeVisible();

  // Los tres select del filtro: juego, set y cantidad.
  const selects = page.locator('.filtros select');
  await selects.nth(0).selectOption('YGO');
  await selects.nth(1).selectOption(String(setId));
  await selects.nth(2).selectOption('1');

  await page.getByRole('button', { name: 'Abrir' }).click();
  await expect(page.locator('.sobre')).toBeVisible();
}

test('las cartas llegan boca abajo y el volteo TERMINA', async ({ page, request }) => {
  const usuario = await crearUsuario(request, 'sobres');
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);

  await abrirUnSobre(page, set.id);

  const primera = page.locator('.volteador').first();

  // Llegan boca abajo: con movimiento normal, nada se revela solo.
  await expect(primera).toHaveAttribute('aria-pressed', 'false');

  await primera.click();

  // La logica: el boton se marca como pulsado.
  await expect(primera).toHaveAttribute('aria-pressed', 'true');

  // Y LA ANIMACION TERMINA. Con `requestAnimationFrame` parado —el fallo de
  // S017— `aria-pressed` cambiaria igual y esto no convergeria nunca.
  await expect
    .poll(async () => sinRotacion(await primera.evaluate((el) => getComputedStyle(el).transform)), {
      timeout: 5000,
      message: 'el volteo no llego a terminar: la animacion no avanza',
    })
    .toBe(true);
});

test('T-040 no es vacuo: con movimiento reducido NO hay volteo que probar', async ({
  browser,
  request,
}) => {
  // Si este test se comportara igual que el anterior, el anterior no estaria
  // tocando el camino de la animacion. `PackReveal` llama a `useReducedMotion()`
  // y con movimiento reducido revela TODAS las cartas de golpe.
  const contexto = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await contexto.newPage();

  const usuario = await crearUsuario(request, 'sobres-reducido');
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);

  await abrirUnSobre(page, set.id);

  // Ya reveladas, sin un solo clic.
  const volteadores = page.locator('.volteador');
  const total = await volteadores.count();
  expect(total).toBeGreaterThan(0);
  for (let i = 0; i < total; i++) {
    await expect(volteadores.nth(i)).toHaveAttribute('aria-pressed', 'true');
  }

  await contexto.close();
});
```

- [ ] **Paso 2: ejecutar**

```bash
docker compose --profile e2e run --rm e2e
```

Esperado: `4 passed` (2 de humo + 2 de sobres).

Si el primero falla en el `poll` con "el volteo no llego a terminar", **es un hallazgo real**: la
animación no avanza en este navegador, que es exactamente lo que S017 no pudo comprobar. Regístralo
como problema antes de tocar el test.

- [ ] **Paso 3: comprobar que el test NO es vacuo**

Cambia temporalmente `reducedMotion: 'no-preference'` por `'reduce'` en
`e2e/playwright.config.ts` y ejecuta otra vez.

Esperado: **el primer test de sobres FALLA** en `toHaveAttribute('aria-pressed', 'false')`, porque
con movimiento reducido las cartas llegan ya reveladas.

Si pasara igual, el test no está midiendo la animación y hay que arreglarlo antes de seguir.
**Restaura `'no-preference'`** y vuelve a ejecutar para dejarlo en verde.

- [ ] **Paso 4: commit**

```bash
git add e2e/src/sobres.spec.ts
git commit -m "test(e2e): verify the card flip actually completes (T-040, T-059)"
```

---

## Tarea 6 — T-060: la interfaz de mazos (T-053)

**Ficheros:**
- Crear: `e2e/src/mazos.spec.ts`

- [ ] **Paso 1: escribir el recorrido**

`e2e/src/mazos.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { crearMazo, crearUsuario, iniciarSesion, setAbribleDeYgo } from './fixtures.js';

/**
 * T-053 — la interfaz de mazos, vista de verdad.
 *
 * En S021 y S022 se verifico por DOM y por panel de red porque el panel del
 * navegador no componia imagenes: el comportamiento quedo comprobado y la
 * apariencia no la vio nadie. Las capturas de este test son lo que cierra eso.
 */

test('el editor de mazos se pinta y valida en cliente', async ({ page, request }) => {
  const usuario = await crearUsuario(request, 'mazos');
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

  await page.screenshot({ path: 'artefactos/mazos-editor-vacio.png', fullPage: true });

  // Anadir una carta desde el buscador y ver que aparece en una zona.
  await page.locator('.filtros input').fill('a');
  await expect(page.locator('.buscador-fila').first()).toBeVisible();
  await page.locator('.buscador-fila button').first().click();

  await expect(page.locator('.linea-carta')).toHaveCount(1);
  await expect(page.locator('.barra-guardar button')).toHaveText('Guardar');

  await page.screenshot({ path: 'artefactos/mazos-editor-con-carta.png', fullPage: true });
});

test('la lista de mazos muestra el mazo creado', async ({ page, request }) => {
  const usuario = await crearUsuario(request, 'mazos-lista');
  await crearMazo(request, usuario.token, 'Mazo en la lista');
  await iniciarSesion(page, usuario.token);

  await page.goto('/mazos');
  await expect(page.getByRole('link', { name: 'Mazo en la lista' })).toBeVisible();
  await expect(page.locator('.mazo-fila')).toHaveCount(1);

  await page.screenshot({ path: 'artefactos/mazos-lista.png', fullPage: true });
});
```

- [ ] **Paso 2: ejecutar**

```bash
docker compose --profile e2e run --rm e2e
```

Esperado: `6 passed`.

- [ ] **Paso 3: mirar las capturas, que es el punto de la tarea**

```bash
ls e2e/artefactos/
```

Esperado: `mazos-editor-vacio.png`, `mazos-editor-con-carta.png`, `mazos-lista.png`.

**Ábrelas.** Si la interfaz se ve rota —columnas descuadradas, texto ilegible, algo superpuesto—
es un hallazgo de T-053 y hay que registrarlo, aunque los tests estén en verde. El test comprueba
que los elementos existen; sólo un ojo comprueba que se ven bien.

- [ ] **Paso 4: commit**

```bash
git add e2e/src/mazos.spec.ts
git commit -m "test(e2e): render the deck builder and capture screenshots (T-053, T-060)"
```

---

## Tarea 7 — Cierre: auditoría, criterios y Vault

- [ ] **Paso 1: auditoría de la suite**

`npm audit` de la raíz **no cubre** `e2e/`, porque no es un workspace. Se audita aparte:

```bash
cd e2e && npm audit && cd ..
```

Esperado: `found 0 vulnerabilities`. Si aparece algo, arréglalo: el criterio de aceptación del
proyecto es auditoría limpia, y dejarlo pasar por estar "fuera" vaciaría la regla.

- [ ] **Paso 2: criterios de aceptación**

```bash
npm run build && npm test && npm run build --workspace @tcg/web && npm audit
```

Esperado: los cuatro limpios, con **332 tests** de Vitest. H8a no debe tocar ninguno: si el número
cambia, algo se ha modificado que no tocaba.

- [ ] **Paso 3: añadir el comando al README**

En la tabla de comandos de `README.md`:

```markdown
| `docker compose --profile e2e run --rm e2e` | Suite E2E con Playwright |
```

Y en la sección de estado, H8 pasa a 🟡 con la suite en marcha.

- [ ] **Paso 4: actualizar el Vault**

- `005Registro/2026-08-26_S023_SuiteE2E.md` — bitácora: ADR-009 y su motivo, si Playwright arrancó
  a la primera, qué dijo la comprobación de no-vacuidad de T-040, qué se vio en las capturas de
  T-053, y cualquier problema nuevo con su número.
- `001Reportes/Tareas_Realizadas.md` — T-055 a T-060, **y T-040 y T-053 cerradas**.
- `001Reportes/Tareas_Pendientes.md` — quitar T-040 y T-053. Añadir los sub-proyectos que quedan de
  H8: **H8b** (seguridad, con T-051) y **H8c** (deuda técnica).
- `004Arquitectura/03_Infraestructura.md` — el servicio `e2e` en la tabla de topología, y corregir
  la mención a Cypress que sigue en la estructura de carpetas.
- `00Master/03_Hitos.md` — H8 a 🟡 EN CURSO, con H8a hecho.
- `00Master/05_Continuar_Aqui.md` — el siguiente paso natural pasa a ser H8b.
- `Claude.md` — `e2e/` y `docker/e2e.Dockerfile` en el mapa; ADR-009 en la cuenta.

- [ ] **Paso 5: commit**

```bash
git add -A && git commit -m "docs(h8): record the E2E suite session (S023)"
```

---

## Revisión del plan contra el spec

| Requisito del spec | Tarea |
|---|---|
| §1 ADR-009 escrito y razonado | 2 |
| §2 `e2e/` fuera de los workspaces, con su package propio | 1 |
| §2 auditoría propia de `e2e/` | 7 paso 1 |
| §3 servicio con perfil, imagen oficial, URL base por entorno | 1 pasos 5-6 |
| §4 la suite no ingesta: precondición con el comando exacto | 3 |
| §4 usuario propio por test, precondiciones por API | 3 |
| §5.1 humo con consola limpia y sin URLs externas | 4 |
| §5.2 T-040: `reducedMotion` explícito, animación que TERMINA, no-vacuidad | 1 paso 3, 5 |
| §5.3 T-053: interfaz pintada y capturas como artefacto | 6 |
| §6 diagnóstico: trazas, vídeo y capturas al fallar | 1 paso 3 |
| §7 la suite verde, el test falla con `reduce`, artefactos abribles | 5 paso 3, 6 paso 3 |
| §8 T-055 a T-060 | 1-6 |
| §9 riesgo de que Playwright no arranque | 1, que existe para eso |

**Una desviación consciente:** el spec habla de `e2e/artefactos/` y el plan pone la salida de
Playwright en `artefactos/salida` y el informe HTML en `artefactos/informe`, con las capturas de
T-053 en la raíz de `artefactos/`. Es la misma carpeta montada al host; sólo se ordena por dentro
para que las capturas que hay que mirar no queden mezcladas con los volcados de los fallos.
