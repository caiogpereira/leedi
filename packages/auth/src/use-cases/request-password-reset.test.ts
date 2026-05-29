import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Better-Auth instance so the use-case can be tested without a DB or env.
const { requestPasswordReset: requestPasswordResetApi } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}));
vi.mock('../auth.js', () => ({
  auth: { api: { requestPasswordReset: requestPasswordResetApi } },
}));

// Imported after the mock is registered.
import { requestPasswordReset } from './request-password-reset.js';

describe('requestPasswordReset (anti-enumeration, AC#1)', () => {
  beforeEach(() => {
    requestPasswordResetApi.mockReset();
  });

  it('forwards email, redirectTo and headers to Better-Auth', async () => {
    requestPasswordResetApi.mockResolvedValueOnce(undefined);
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4' });
    await requestPasswordReset('user@example.com', headers);
    expect(requestPasswordResetApi).toHaveBeenCalledWith({
      body: { email: 'user@example.com', redirectTo: '/reset-password' },
      headers,
    });
  });

  it('omits headers when not provided', async () => {
    requestPasswordResetApi.mockResolvedValueOnce(undefined);
    await requestPasswordReset('user@example.com');
    expect(requestPasswordResetApi).toHaveBeenCalledWith({
      body: { email: 'user@example.com', redirectTo: '/reset-password' },
    });
  });

  it('never throws even when the API rejects (uniform response)', async () => {
    requestPasswordResetApi.mockRejectedValueOnce(new Error('user not found'));
    await expect(requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
  });
});
