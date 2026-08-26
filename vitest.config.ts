import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * La suite E2E la ejecuta Playwright, no Vitest (P-031).
     *
     * Sus ficheros son `*.spec.ts` y encajan con el patron por defecto de
     * Vitest, que intentaba correrlos y fallaba con "Playwright Test did not
     * expect test() to be called here". Los tests de Vitest seguian pasando
     * todos, asi que la linea de resumen decia `332 passed` y el fallo solo
     * aparecia en `Test Files`.
     */
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
