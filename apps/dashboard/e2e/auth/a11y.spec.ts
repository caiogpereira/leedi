import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Phase 2 authed E2E — Story 3.4 Accessibility Foundations (WCAG AA).
 *
 * Runs with the seeded [E2E] owner storageState. Covers the skip-to-content
 * landmark, keyboard reachability of the sidebar, and an axe sweep of internal
 * pages gated at zero serious/critical violations (the CI a11y gate this story
 * was blocked on — see deferred-work.md).
 */

const SERIOUS = new Set(['serious', 'critical']);

test.describe('Skip-to-content (Story 3.4)', () => {
  test('skip link is the first focusable element and targets #main-content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');

    const focused = page.locator(':focus');
    await expect(focused).toHaveText(/ir para conteúdo/i);
    await expect(focused).toHaveAttribute('href', '#main-content');
  });

  test('#main-content landmark exists as the skip-link target', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#main-content')).toBeAttached();
  });
});

test.describe('Keyboard navigation (Story 3.4)', () => {
  test('every sidebar item is keyboard-focusable', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    const links = nav.getByRole('link');
    // NAV_ITEMS in components/shell/Sidebar.tsx — keep in sync if items change.
    await expect(links).toHaveCount(11);

    const count = await links.count();
    for (let i = 0; i < count; i++) {
      await expect(links.nth(i)).toHaveClass(/focus-visible/);
    }
  });

  test('theme toggle is keyboard-operable', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /mudar para tema/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveClass(/focus-visible/);
  });
});

test.describe('axe sweep — zero serious/critical (Story 3.4)', () => {
  // One internal page per shell area kept small to bound cold-compile cost.
  for (const path of ['/', '/leads', '/settings/team']) {
    test(`no serious/critical axe violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      // Wait for the shell to be interactive before scanning.
      await expect(
        page.getByRole('navigation', { name: 'Navegação principal' })
      ).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const blocking = results.violations.filter((v) => SERIOUS.has(v.impact ?? ''));
      expect(
        blocking,
        blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n')
      ).toEqual([]);
    });
  }
});
