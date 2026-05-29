import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Better-Auth instance so the use-case can be tested without a DB or env.
// `vi.hoisted` lets the mock fn exist before the hoisted `vi.mock` factory runs.
const { resetPassword: resetPasswordApi } = vi.hoisted(() => ({
  resetPassword: vi.fn(),
}));
vi.mock('../auth.js', () => ({
  auth: { api: { resetPassword: resetPasswordApi } },
}));

// Imported after the mock is registered.
import { resetPassword } from './reset-password.js';

const EXPIRED_MESSAGE = 'Este link expirou. Solicite um novo link de recuperação.';
const GENERIC_MESSAGE = 'Erro ao redefinir senha. Tente novamente.';

describe('resetPassword', () => {
  beforeEach(() => {
    resetPasswordApi.mockReset();
  });

  it('rejects a password that fails the policy without calling the API', async () => {
    const result = await resetPassword('token', 'weak');
    expect(result.success).toBe(false);
    expect(resetPasswordApi).not.toHaveBeenCalled();
  });

  it('returns success on a valid token + policy-compliant password', async () => {
    resetPasswordApi.mockResolvedValueOnce(undefined);
    const result = await resetPassword('token', 'ValidPass1');
    expect(result).toEqual({ success: true });
    expect(resetPasswordApi).toHaveBeenCalledWith({
      body: { token: 'token', newPassword: 'ValidPass1' },
    });
  });

  it('maps an expired-token error message to AC#3 with expired=true', async () => {
    resetPasswordApi.mockRejectedValueOnce(new Error('token expired'));
    const result = await resetPassword('token', 'ValidPass1');
    expect(result).toEqual({ success: false, error: EXPIRED_MESSAGE, expired: true });
  });

  it('maps a Better-Auth APIError with INVALID_TOKEN code to AC#3', async () => {
    // Better-Auth throws an APIError carrying a stable code rather than free text.
    resetPasswordApi.mockRejectedValueOnce({ body: { code: 'INVALID_TOKEN' } });
    const result = await resetPassword('token', 'ValidPass1');
    expect(result).toEqual({ success: false, error: EXPIRED_MESSAGE, expired: true });
  });

  it('maps an unrelated error to the generic message (not flagged expired)', async () => {
    resetPasswordApi.mockRejectedValueOnce(new Error('database connection lost'));
    const result = await resetPassword('token', 'ValidPass1');
    expect(result).toEqual({ success: false, error: GENERIC_MESSAGE });
  });
});
