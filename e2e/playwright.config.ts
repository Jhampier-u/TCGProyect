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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /**
     * AQUI NO SE PONE `reducedMotion`, y no es un olvido.
     *
     * MEDIDO en esta version: puesto aqui **no llega al navegador**. Comparando
     * en la misma ejecucion, la media query daba `false` con el valor del config
     * y `true` creando el contexto a mano (P-029). Una salvaguarda que no hace
     * nada es peor que no tenerla, porque se confia en ella.
     *
     * Los tests que dependen del movimiento crean su contexto con
     * `browser.newContext({ reducedMotion })` y COMPRUEBAN la media query antes
     * de medir nada.
     */
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
