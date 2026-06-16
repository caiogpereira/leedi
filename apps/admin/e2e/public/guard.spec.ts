import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Phase 1 — UNAUTHENTICATED admin E2E (runs today, needs only the admin server
 * on :3002).
 *
 * The admin shell guard lives in `apps/admin/app/(shell)/layout.tsx`: it resolves
 * the session server-side and, when there is no session, redirects to the web-app
 * login (`${BETTER_AUTH_URL}/login`); an authenticated non-`super_admin` is sent to
 * the in-app `/403` instead (F-28). We assert the anonymous redirect at the response
 * level (maxRedirects: 0) — its location still contains `/login`. The `/403` page
 * renders without auth, so we run a real axe sweep against it as the Phase-1 a11y gate.
 *
 * The authenticated 5-item sidebar / no-tenant-switcher / keyboard sweeps are
 * Phase 2 (e2e/auth/*, seeded super_admin storageState).
 */

test.describe('admin auth guard (unauthenticated)', () => {
  for (const path of ['/', '/tenants']) {
    test(`anonymous ${path} → redirects to /login (never renders admin content)`, async ({
      request,
    }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers()['location'] ?? '').toContain('/login');
    });
  }
});

test.describe('admin a11y (public pages)', () => {
  test('/403 has no serious or critical axe violations', async ({ page }) => {
    await page.goto('/403');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
