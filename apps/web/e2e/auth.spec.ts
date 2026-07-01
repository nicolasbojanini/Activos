import { expect, test } from '@playwright/test';

/**
 * Requiere el entorno local seedeado (pnpm db:seed): usuario
 * coordinador@adn.demo / adn12345 y el proyecto "Inventario 2026".
 */
test('coordinador inicia sesión, ve el dashboard y cierra sesión', async ({ page }) => {
  await page.goto('/login');

  await page.getByPlaceholder('nombre@empresa.com').fill('coordinador@adn.demo');
  await page.getByPlaceholder('••••••••').fill('adn12345');
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page.getByRole('heading', { name: /Inventario 2026/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Activos del inventario')).toBeVisible();
  await expect(page.getByText(/activos · sincronizado con la app/)).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
});

test('credenciales inválidas muestran un error y no navegan', async ({ page }) => {
  await page.goto('/login');

  await page.getByPlaceholder('nombre@empresa.com').fill('coordinador@adn.demo');
  await page.getByPlaceholder('••••••••').fill('contraseña-incorrecta');
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page.getByText(/Credenciales inválidas|No se pudo iniciar sesión/)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
