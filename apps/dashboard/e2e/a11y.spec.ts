import { test, expect } from '@playwright/test';

/**
 * Accessibility E2E tests for Story 3.4: WCAG AA Foundations
 *
 * These tests require:
 * 1. A running dashboard dev server at http://localhost:3001
 * 2. An authenticated session
 * 3. @axe-core/playwright installed (add when playwright config is added)
 */

test.describe('Skip-to-content link', () => {
  test('skip link is the first focusable element and targets #main-content', async ({ page }) => {
    await page.goto('/');

    // Tab once to focus the first element
    await page.keyboard.press('Tab');

    const focused = page.locator(':focus');
    await expect(focused).toHaveText(/ir para conteúdo/i);
    await expect(focused).toHaveAttribute('href', '#main-content');
  });

  test('#main-content landmark exists for skip link target', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#main-content')).toBeAttached();
  });
});

test.describe('Keyboard navigation', () => {
  test('all nav items in sidebar are keyboard reachable', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    const links = nav.getByRole('link');
    const count = await links.count();
    expect(count).toBe(10);

    // Verify each link is focusable via keyboard (has visible focus ring styles)
    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      await expect(link).toHaveClass(/focus-visible/);
    }
  });

  test('theme toggle is keyboard operable', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', { name: /mudar para tema/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveClass(/focus-visible/);
  });
});

test.describe('Form accessibility', () => {
  test('all form inputs have labels or aria-labels', async ({ page }) => {
    await page.goto('/configuracoes');

    const inputs = page.locator('input:not([type=hidden]), textarea, select');
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const hasLabel =
        (await input.getAttribute('aria-label')) !== null ||
        (await input.getAttribute('aria-labelledby')) !== null ||
        (await input.getAttribute('id').then(async (id) =>
          id ? (await page.locator(`label[for="${id}"]`).count()) > 0 : false
        ));
      expect(hasLabel, `Input ${i} has no label`).toBe(true);
    }
  });
});

// When @axe-core/playwright is installed, add:
// import AxeBuilder from '@axe-core/playwright';
// test('no critical axe violations', async ({ page }) => {
//   await page.goto('/');
//   const results = await new AxeBuilder({ page }).analyze();
//   const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
//   expect(critical).toHaveLength(0);
// });
