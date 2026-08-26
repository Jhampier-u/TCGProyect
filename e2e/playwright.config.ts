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
     * asi pasaria sin ejercitar la animacion (ver 5.2 del spec de H8a).
     */
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
