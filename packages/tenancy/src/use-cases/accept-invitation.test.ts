import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted so the vi.mock factories (which run at import time) can close over them.
const h = vi.hoisted(() => ({
  inviteRows: [] as Array<Record<string, unknown>>,
  userRows: [] as Array<{ id: string }>,
  membershipValues: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  invitationSet: vi.fn(),
  signUpEmail: vi.fn(),
}));

vi.mock('@leedi/db', () => {
  const selectChain = (rows: () => unknown[]) => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => Promise.resolve(rows())),
  });
  return {
    withServiceRole: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(selectChain(() => h.inviteRows))
    ),
    db: selectChain(() => h.userRows),
    withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: vi.fn().mockReturnValue({
          values: h.membershipValues.mockReturnValue({
            onConflictDoUpdate: h.onConflictDoUpdate.mockResolvedValue(undefined),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: h.invitationSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        }),
      };
      return fn(tx);
    }),
    schema: {
      invitations: { token: 'token', acceptedAt: 'acceptedAt' },
      users: { id: 'id', email: 'email' },
      memberships: { userId: 'userId', tenantId: 'tenantId' },
    },
    eq: vi.fn(),
    and: vi.fn(),
    isNull: vi.fn(),
  };
});

vi.mock('@leedi/auth', () => ({
  auth: { api: { signUpEmail: h.signUpEmail } },
  // Hand-rolled stand-in for the real policy (min 8 + uppercase + digit) so the
  // factory has no external imports to order against.
  passwordSchema: {
    safeParse: (v: unknown) => {
      const s = typeof v === 'string' ? v : '';
      const ok = s.length >= 8 && /[A-Z]/.test(s) && /[0-9]/.test(s);
      return ok
        ? { success: true as const, data: s }
        : { success: false as const, error: { issues: [{ message: 'Senha inválida' }] } };
    },
  },
}));

import { acceptInvitation } from './accept-invitation.js';

const future = new Date(Date.now() + 60 * 60 * 1000);
const past = new Date(Date.now() - 60 * 60 * 1000);

function invite(overrides: Record<string, unknown> = {}) {
  return {
    token: 'tok',
    email: 'invited@test.com',
    role: 'admin',
    tenantId: 't1',
    invitedBy: 'inviter1',
    expiresAt: future,
    acceptedAt: null,
    ...overrides,
  };
}

describe('acceptInvitation', () => {
  beforeEach(() => {
    h.inviteRows = [];
    h.userRows = [];
    h.membershipValues.mockClear();
    h.onConflictDoUpdate.mockClear();
    h.invitationSet.mockClear();
    h.signUpEmail.mockReset();
  });

  it('rejects an invalid/already-used token', async () => {
    h.inviteRows = [];
    const result = await acceptInvitation('tok');
    expect(result).toEqual({ success: false, error: 'Convite inválido ou já utilizado' });
  });

  it('rejects an expired token', async () => {
    h.inviteRows = [invite({ expiresAt: past })];
    const result = await acceptInvitation('tok');
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('expirou');
  });

  it('existing user -> membership only (no signup)', async () => {
    h.inviteRows = [invite()];
    h.userRows = [{ id: 'existing-user' }];
    const result = await acceptInvitation('tok');
    expect(result).toEqual({ success: true, tenantId: 't1' });
    expect(h.signUpEmail).not.toHaveBeenCalled();
    expect(h.membershipValues).toHaveBeenCalledTimes(1);
    // Re-invite applies the invited role (upgrade), not a silent no-op.
    expect(h.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(h.onConflictDoUpdate.mock.calls[0]?.[0]?.set).toMatchObject({ role: 'admin' });
  });

  it('new user -> creates the account then the membership', async () => {
    h.inviteRows = [invite()];
    h.userRows = [];
    h.signUpEmail.mockResolvedValueOnce({ token: null, user: { id: 'new-user' } });
    const result = await acceptInvitation('tok', 'Password1');
    expect(result).toEqual({ success: true, tenantId: 't1' });
    expect(h.signUpEmail).toHaveBeenCalledTimes(1);
    expect(h.membershipValues).toHaveBeenCalledTimes(1);
  });

  it('new user with a weak password is rejected before signup', async () => {
    h.inviteRows = [invite()];
    h.userRows = [];
    const result = await acceptInvitation('tok', 'weak');
    expect(result.success).toBe(false);
    expect(h.signUpEmail).not.toHaveBeenCalled();
  });

  it('returns a typed error when signup throws (e.g. concurrent accept race)', async () => {
    h.inviteRows = [invite()];
    h.userRows = [];
    h.signUpEmail.mockRejectedValueOnce(new Error('USER_ALREADY_EXISTS'));
    const result = await acceptInvitation('tok', 'Password1');
    expect(result.success).toBe(false);
  });

  it('rejects when a logged-in user redeems an invite for a different email', async () => {
    h.inviteRows = [invite()];
    h.userRows = [{ id: 'existing-user' }];
    const result = await acceptInvitation('tok', undefined, 'someone-else@test.com');
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('outro e-mail');
    expect(h.membershipValues).not.toHaveBeenCalled();
  });
});
