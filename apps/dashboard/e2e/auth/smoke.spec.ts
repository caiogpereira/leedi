import { test, expect } from '@playwright/test';

/**
 * Phase 2 smoke — proves the seeded `[E2E]` owner session + storageState renders
 * the authenticated shell at `/` (no redirect to /login or /onboarding). This is
 * the foundation gate; the per-story authed specs build on the same storageState.
 */
test('seeded owner sees the authenticated dashboard shell at /', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/localhost:3001\/$/);
  await expect(
    page.getByRole('navigation', { name: 'Navegação principal' })
  ).toBeVisible();
});
