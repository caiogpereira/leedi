import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Better-Auth instance so the use-case can be tested without a DB or env.
// `vi.hoisted` lets the mock fn exist before the hoisted `vi.mock` factory runs.
const { signInEmail } = vi.hoisted(() => ({ signInEmail: vi.fn() }));
vi.mock('../auth.js', () => ({
  auth: { api: { signInEmail } },
}));

// Imported after the mock is registered.
import { loginUser } from './login-user.js';

const GENERIC_LOGIN_ERROR = 'E-mail ou senha incorretos';

describe('loginUser', () => {
  beforeEach(() => {
    signInEmail.mockReset();
  });

  it('returns success when Better-Auth resolves', async () => {
    signInEmail.mockResolvedValueOnce({ token: 'abc' });
    const result = await loginUser('user@example.com', 'Password1');
    expect(result).toEqual({ success: true });
  });

  it('maps a wrong-password error to the generic message', async () => {
    signInEmail.mockRejectedValueOnce(new Error('Invalid password'));
    const result = await loginUser('user@example.com', 'WrongPass1');
    expect(result).toEqual({ success: false, error: GENERIC_LOGIN_ERROR });
  });

  it('maps an unknown-email error to the same generic message (no enumeration)', async () => {
    signInEmail.mockRejectedValueOnce(new Error('User not found'));
    const result = await loginUser('nobody@example.com', 'Password1');
    expect(result).toEqual({ success: false, error: GENERIC_LOGIN_ERROR });
  });

  it('maps an unverified-email error to the same generic message', async () => {
    signInEmail.mockRejectedValueOnce(new Error('Email not verified'));
    const result = await loginUser('unverified@example.com', 'Password1');
    expect(result).toEqual({ success: false, error: GENERIC_LOGIN_ERROR });
  });

  it('forwards email, password and headers to Better-Auth', async () => {
    signInEmail.mockResolvedValueOnce({ token: 'abc' });
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4' });
    await loginUser('user@example.com', 'Password1', headers);
    expect(signInEmail).toHaveBeenCalledWith({
      body: { email: 'user@example.com', password: 'Password1' },
      headers,
    });
  });
});
