import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Better-Auth instance so the use-case runs without a DB or env.
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../auth.js', () => ({
  auth: { api: { signOut } },
}));

import { logoutUser } from './logout-user.js';

describe('logoutUser', () => {
  beforeEach(() => {
    signOut.mockReset();
  });

  it('delegates to Better-Auth signOut with the forwarded headers', async () => {
    signOut.mockResolvedValueOnce(undefined);
    const headers = new Headers({ cookie: 'better-auth.session_token=abc' });
    await logoutUser(headers);
    expect(signOut).toHaveBeenCalledWith({ headers });
  });

  // AC#2: server-side invalidation is Better-Auth's signOut (it deletes the
  // session row). The use-case must AWAIT it so a failure propagates to the
  // caller rather than reporting a false "logged out". Full "reused token -> 401"
  // is exercised at the integration layer (real session store).
  it('propagates a signOut failure instead of swallowing it', async () => {
    signOut.mockRejectedValueOnce(new Error('session store unavailable'));
    await expect(logoutUser(new Headers())).rejects.toThrow('session store unavailable');
  });
});
