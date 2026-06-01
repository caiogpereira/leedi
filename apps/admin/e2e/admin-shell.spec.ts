import { test, expect } from '@playwright/test';

/**
 * E2E tests for Story 3.2: Admin Shell & Navigation
 *
 * Requires a running admin app at http://localhost:3002 and a super_admin session.
 */

test.describe('Admin shell navigation', () => {
  test('renders 5 admin nav items', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Navegação administrativa' });
    await expect(nav).toBeVisible();

    const links = nav.getByRole('link');
    await expect(links).toHaveCount(5);
  });

  test('highlights active route', async ({ page }) => {
    await page.goto('/clientes');

    const nav = page.getByRole('navigation', { name: 'Navegação administrativa' });
    const activeLink = nav.getByRole('link', { name: /clientes/i });
    await expect(activeLink).toHaveAttribute('aria-current', 'page');
  });

  test('header has ADMIN indicator and no tenant switcher', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('header');
    await expect(header.getByText('ADMIN')).toBeVisible();
    await expect(header.getByText(/selecionar empresa/i)).not.toBeVisible();
  });

  test('non-admin user is redirected to login', async ({ browser }) => {
    // Test with no session — should redirect to /login
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    // Should redirect away from admin content
    await expect(page).toHaveURL(/login/);
    await context.close();
  });
});
