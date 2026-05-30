import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controls what the mocked `select(...).limit()` resolves to, so a single
// withTenant mock can simulate both "no pending invite" and "duplicate exists".
let existingInvites: Array<{ id: string }> = [];
const insertValues = vi.fn();

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(existingInvites),
        insert: vi.fn().mockReturnValue({ values: insertValues.mockResolvedValue(undefined) }),
      };
      return fn(mockTx);
    }
  ),
  schema: {
    invitations: {
      id: 'id',
      tenantId: 'tenantId',
      email: 'email',
      acceptedAt: 'acceptedAt',
      expiresAt: 'expiresAt',
    },
  },
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  gt: vi.fn(),
}));

const sendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@leedi/notification', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

vi.mock('@leedi/config', () => ({
  env: { BETTER_AUTH_URL: 'http://localhost:3000' },
}));

// Mock @leedi/auth's hasPermission directly. We avoid `importActual` because the
// auth barrel pulls in auth.ts → @leedi/db's real `db` (which is mocked here), so
// the real module cannot load. The matrix replicated here matches rbac.ts: only
// owner and admin hold 'team:manage'.
vi.mock('@leedi/auth', () => ({
  hasPermission: (role: string, permission: string) =>
    permission === 'team:manage' && (role === 'owner' || role === 'admin'),
}));

import { inviteMember } from './invite-member.js';

const baseInput = {
  email: 'new@test.com',
  // Valid RFC v4 UUIDs (version nibble = 4, variant nibble = 8/9/a/b) so zod's
  // .uuid() accepts them — the use-case validates input before any auth check.
  tenantId: '11111111-1111-4111-8111-111111111111',
  invitedByUserId: '22222222-2222-4222-8222-222222222222',
};

describe('inviteMember', () => {
  beforeEach(() => {
    existingInvites = [];
    sendEmail.mockClear();
    insertValues.mockClear();
  });

  it('rejects an operator inviting (no team:manage permission)', async () => {
    const result = await inviteMember({
      ...baseInput,
      role: 'operator',
      inviterRole: 'operator',
    });
    expect(result.success).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('rejects an admin granting the owner role (privilege escalation)', async () => {
    const result = await inviteMember({
      ...baseInput,
      role: 'owner',
      inviterRole: 'admin',
    });
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('proprietário');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('rejects a duplicate pending invite with the AC#3 message', async () => {
    // A still-valid, unaccepted invite already exists for this (tenant, email).
    existingInvites = [{ id: 'existing-invite' }];

    const result = await inviteMember({
      ...baseInput,
      role: 'operator',
      inviterRole: 'admin',
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe(
      'Já existe um convite pendente para este e-mail'
    );
    // No insert and no email when rejecting a duplicate.
    expect(insertValues).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('creates the invite and sends an email on the happy path', async () => {
    const result = await inviteMember({
      ...baseInput,
      role: 'operator',
      inviterRole: 'admin',
    });

    expect(result.success).toBe(true);
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const emailArg = sendEmail.mock.calls[0]?.[0] as { to: string; template: string };
    expect(emailArg.to).toBe('new@test.com');
    expect(emailArg.template).toBe('invitation');
  });
});
