import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Better-Auth instance so the use-case runs without a DB or env.
const { signUpEmail } = vi.hoisted(() => ({ signUpEmail: vi.fn() }));
vi.mock('../auth.js', () => ({
  auth: { api: { signUpEmail } },
}));

import { registerUser } from './register-user.js';

const DUPLICATE_EMAIL_MESSAGE =
  'Este e-mail já está cadastrado. Faça login ou recupere sua senha.';

describe('registerUser', () => {
  beforeEach(() => {
    signUpEmail.mockReset();
  });

  it('creates the user on valid input', async () => {
    signUpEmail.mockResolvedValueOnce({ token: null, user: { id: 'u1' } });
    const result = await registerUser({ email: 'new@example.com', password: 'Password1' });
    expect(result).toEqual({ success: true });
    expect(signUpEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects a weak password BEFORE calling Better-Auth (policy enforced in the use-case)', async () => {
    const result = await registerUser({ email: 'new@example.com', password: 'weak' });
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('senha');
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('maps a duplicate-email signup to the AC#3 message', async () => {
    signUpEmail.mockRejectedValueOnce(new Error('User already exists'));
    const result = await registerUser({ email: 'dupe@example.com', password: 'Password1' });
    expect(result).toEqual({ success: false, error: DUPLICATE_EMAIL_MESSAGE });
  });

  it('maps any other signup failure to the generic error', async () => {
    signUpEmail.mockRejectedValueOnce(new Error('SMTP unavailable'));
    const result = await registerUser({ email: 'x@example.com', password: 'Password1' });
    expect(result).toEqual({ success: false, error: 'Erro ao criar conta. Tente novamente.' });
  });
});
