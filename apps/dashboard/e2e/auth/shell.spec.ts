import { test, expect } from '@playwright/test';

/**
 * Phase 2 authed E2E — Story 3.1 Dashboard Navigation Shell & Layout.
 *
 * Runs with the seeded [E2E] owner storageState (see global-setup). Asserts the
 * behaviours that only exist behind login: theme persistence, no-FOUC dark boot,
 * active-route highlighting, and the mobile nav drawer.
 *
 * Selectors verified against components/shell/{Sidebar,Header}.tsx and the
 * @leedi/ui ThemeProvider (attribute="class", storageKey="leedi-theme").
 */

test.describe('Theme toggle (Story 3.1)', () => {
  test('persists theme preference across reload', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', { name: /mudar para tema/i });
    await expect(toggle).toBeVisible();

    // Switch to dark and verify class + persisted storage.
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem('leedi-theme'))).toBe('dark');

    // Persistence survives a reload.
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem('leedi-theme'))).toBe('dark');

    // Switch back to light (leave the namespace storageState clean of a dark pref).
    await page.getByRole('button', { name: /mudar para tema/i }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem('leedi-theme'))).toBe('light');
  });

  test('no FOUC: dark class is present before paint when system prefers dark', async ({
    page,
  }) => {
    // No stored pref + system dark → next-themes' blocking script must apply `dark`
    // to <html> before first paint (enableSystem, defaultTheme="system"). Each test
    // gets a fresh context from storageState (origins:[] → empty localStorage), so
    // there is no stored theme; the init script is belt-and-suspenders.
    await page.addInitScript(() => localStorage.removeItem('leedi-theme'));
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto('/');
    expect(await page.locator('html').getAttribute('class')).toMatch(/dark/);
  });
});

test.describe('Sidebar navigation (Story 3.1)', () => {
  test('highlights the active route via aria-current', async ({ page }) => {
    await page.goto('/leads');

    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(nav).toBeVisible();

    const leadsLink = nav.getByRole('link', { name: /leads/i });
    await expect(leadsLink).toHaveAttribute('aria-current', 'page');
  });

  test('hamburger opens the nav drawer on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    const sidebar = page.locator('aside');
    // Off-canvas by default on mobile (-translate-x-full).
    await expect(sidebar).toHaveClass(/-translate-x-full/);

    await page.getByRole('button', { name: 'Abrir menu de navegação' }).click();
    await expect(sidebar).not.toHaveClass(/-translate-x-full/);

    // And it closes again via the in-drawer close button.
    await page.getByRole('button', { name: 'Fechar menu' }).click();
    await expect(sidebar).toHaveClass(/-translate-x-full/);
  });
});
