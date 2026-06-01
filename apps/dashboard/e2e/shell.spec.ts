import { test, expect } from '@playwright/test';

/**
 * E2E tests for Story 3.1: Dashboard Navigation Shell & Layout
 *
 * These tests require:
 * 1. A running dashboard dev server at http://localhost:3001
 * 2. A valid authenticated session (or a way to bypass auth in test mode)
 */

test.describe('Theme toggle', () => {
  test('persists theme preference across reload', async ({ page }) => {
    await page.goto('/');

    // Find the theme toggle button
    const toggle = page.getByRole('button', { name: /mudar para tema/i });
    await expect(toggle).toBeVisible();

    // Click to switch to dark
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem('leedi-theme'))).toBe('dark');

    // Reload and verify persistence
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem('leedi-theme'))).toBe('dark');

    // Switch back to light
    await toggle.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem('leedi-theme'))).toBe('light');
  });

  test('no FOUC when dark theme is set on reload', async ({ page, context }) => {
    // Emulate dark system preference
    await context.emulateMedia({ colorScheme: 'dark' });

    await page.goto('/');

    // Dark class must be present before any user interaction (no flash)
    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass).toMatch(/dark/);
  });
});

test.describe('Sidebar navigation', () => {
  test('highlights active route', async ({ page }) => {
    await page.goto('/leads');

    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(nav).toBeVisible();

    const leadsLink = nav.getByRole('link', { name: /leads/i });
    await expect(leadsLink).toHaveAttribute('aria-current', 'page');
  });

  test('collapses to icon-only on tablet width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/');

    // On md breakpoint, nav text labels are hidden (hidden md:block)
    const labels = page.locator('nav a span.hidden.md\\:block');
    // Labels exist but are hidden (CSS class makes them hidden < md, show >= md)
    await expect(labels.first()).toBeHidden();
  });

  test('hamburger button opens nav drawer on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    const hamburger = page.getByRole('button', { name: 'Abrir menu de navegação' });
    await expect(hamburger).toBeVisible();

    const sidebar = page.locator('aside');
    // Initially translated off-screen on mobile
    await expect(sidebar).toHaveClass(/-translate-x-full/);

    await hamburger.click();
    await expect(sidebar).not.toHaveClass(/-translate-x-full/);
  });
});
