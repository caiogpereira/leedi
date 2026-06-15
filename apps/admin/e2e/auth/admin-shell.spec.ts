import { test, expect } from '@playwright/test';

/**
 * Phase 2 authed E2E — Story 3.2 Admin Shell & Navigation.
 *
 * Runs with the seeded [E2E] super_admin storageState (see global-setup), which is
 * what gets past the (shell) layout guard (getWorkspaceAdminRole === 'super_admin').
 * The unauthenticated redirect is covered separately in e2e/public/guard.spec.ts.
 *
 * Selectors verified against components/shell/{AdminSidebar,AdminHeader}.tsx.
 */

test.describe('Admin shell navigation (Story 3.2)', () => {
  test('renders the 5 admin nav items', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Navegação administrativa' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(5);
  });

  test('highlights the active route via aria-current', async ({ page }) => {
    await page.goto('/clientes');

    const nav = page.getByRole('navigation', { name: 'Navegação administrativa' });
    const activeLink = nav.getByRole('link', { name: /clientes/i });
    await expect(activeLink).toHaveAttribute('aria-current', 'page');
  });

  test('header shows the ADMIN indicator and no tenant switcher', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('header');
    // `exact: true` isolates the "ADMIN" badge from the role card ("Admin" /
    // "Super Admin"), which the redesigned header now also renders.
    await expect(header.getByText('ADMIN', { exact: true })).toBeVisible();
    // Admin has no per-tenant switcher (it operates across all tenants).
    await expect(header.getByText(/selecionar empresa/i)).toHaveCount(0);
  });
});
