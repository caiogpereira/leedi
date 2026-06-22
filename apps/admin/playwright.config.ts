/* eslint-disable no-restricted-properties --
 * This Playwright config runs inside the test runner, not the app. It reads
 * CI/harness-injected env vars (CI, E2E_AUTH) that intentionally live OUTSIDE
 * @leedi/config's validated runtime schema, so raw process.env is correct here. */
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — apps/admin (Epic 3 E2E harness).
 *
 * Boots the Next dev server on :3002 itself (webServer). Browser binaries live on
 * D: via PLAYWRIGHT_BROWSERS_PATH=D:\ms-playwright.
 *
 * Two projects:
 *   - `public` (e2e/public/*) runs WITHOUT auth — the admin shell guard redirects
 *     non-super_admin to /login and that redirect IS the assertion. MUST NOT carry
 *     storageState.
 *   - `auth`   (e2e/auth/*) consumes the seeded super_admin storageState produced
 *     by global-setup, and only runs when E2E_AUTH is set (Phase 2).
 */
const AUTH = !!process.env.E2E_AUTH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // The first hit to each route pays a one-time cold SSR compile of the heavy
  // (shell) group — generous timeout absorbs it (steady-state redirects are ~80ms).
  timeout: 120_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // Seeds the [E2E] super_admin namespace + writes e2e/.auth/super-admin.json.
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
              storageState: 'e2e/.auth/super-admin.json',
            },
          },
        ]
      : []),
  ],

  webServer: {
    command: 'pnpm dev',
    // `/403` renders 200 without auth (admin has no /api/health); `/` redirects
    // to /login, a poor readiness signal.
    url: 'http://localhost:3002/403',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
