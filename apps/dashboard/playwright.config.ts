/* eslint-disable no-restricted-properties --
 * This Playwright config runs inside the test runner, not the app. It reads
 * CI/harness-injected env vars (CI, E2E_AUTH) that intentionally live OUTSIDE
 * @leedi/config's validated runtime schema, so raw process.env is correct here. */
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — apps/dashboard (Epic 3 E2E harness).
 *
 * Boots the Next dev server on :3001 itself (webServer) so `pnpm test:e2e`
 * is self-contained. Browser binaries live on D: via the user env var
 * PLAYWRIGHT_BROWSERS_PATH=D:\ms-playwright (C: is space-constrained).
 *
 * Two projects:
 *   - `public` (e2e/public/*) runs WITHOUT auth and gates today (Phase 1).
 *     It MUST NOT carry storageState — its specs assert anonymous 307→/login.
 *   - `auth`   (e2e/auth/*) consumes the seeded owner storageState produced by
 *     global-setup, and only runs when E2E_AUTH is set (Phase 2).
 */
const AUTH = !!process.env.E2E_AUTH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // The first authed hit to a protected route pays a one-time cold Next-dev compile
  // of the heavy (shell) layout (db/auth/tenancy/usage imports) — generous timeout
  // absorbs it (mirrors apps/admin). Public guard specs are redirect-only and fast.
  timeout: 120_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // Seeds the [E2E] namespace + writes e2e/.auth/owner.json before the auth project.
  globalSetup: AUTH ? './e2e/global-setup.ts' : undefined,

  projects: [
    {
      name: 'public',
      testMatch: 'public/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    ...(AUTH
      ? [
          {
            name: 'auth',
            testMatch: 'auth/**/*.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: 'e2e/.auth/owner.json',
            },
          },
        ]
      : []),
  ],

  webServer: {
    command: 'pnpm dev',
    // Probe the one public 200 path. `/` redirects (307) cross-origin to the
    // login app on :3000 (not booted here), which is a poor readiness signal.
    url: 'http://localhost:3001/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
