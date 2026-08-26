import { test, expect } from '@playwright/test';

test('la aplicacion carga', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ProyectoTCG/);
});
