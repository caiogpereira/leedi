import { test, expect } from '@playwright/test';

/**
 * Phase 1 — UNAUTHENTICATED guard E2E (runs today, needs only the dashboard
 * server on :3001; the login app on :3000 is NOT booted).
 *
 * The Edge middleware (`apps/dashboard/middleware.ts`) gates every path except
 * `/api/health` and static assets, redirecting anonymous requests to
 * `<LOGIN_ORIGIN>/login`. We assert that at the REDIRECT level (maxRedirects: 0)
 * so the test does not need the cross-origin login app running.
 *
 * This is the real, gating proof of AC#1's auth-presence routing — distinct from
 * the Phase 2 authenticated shell/keyboard/axe sweeps (e2e/auth/*, seeded).
 */

const PROTECTED_PATHS = ['/', '/leads', '/agente', '/configuracoes/equipe'];

test.describe('dashboard auth guard (unauthenticated)', () => {
  for (const path of PROTECTED_PATHS) {
    test(`anonymous ${path} → 307 redirect to /login`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      const location = res.headers()['location'] ?? '';
      expect(location).toContain('/login');
      // The middleware preserves the intended destination for post-login return
      // (`searchParams.set('redirect', pathname)` → `/` encodes as %2F).
      expect(location).toContain(`redirect=${encodeURIComponent(path)}`);
    });
  }

  test('public /api/health is reachable without auth', async ({ request }) => {
    const res = await request.get('/api/health', { maxRedirects: 0 });
    // Health must NOT redirect to login (it is the one public path).
    expect(res.status()).not.toBe(307);
  });
});
