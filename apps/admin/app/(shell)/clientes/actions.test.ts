import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
const getWorkspaceAdmin = vi.fn();
const blockTenant = vi.fn();
const unblockTenant = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => ({})) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@leedi/auth', () => ({
  getSession: (...args: unknown[]) => getSession(...args),
  getWorkspaceAdmin: (...args: unknown[]) => getWorkspaceAdmin(...args),
}));

vi.mock('@leedi/tenancy', () => ({
  createTenant: vi.fn(),
  blockTenant: (...args: unknown[]) => blockTenant(...args),
  unblockTenant: (...args: unknown[]) => unblockTenant(...args),
  getTenantInvoices: vi.fn(),
}));

vi.mock('@leedi/billing', () => ({
  AsaasProvider: class {},
  createBillingForTenant: vi.fn(),
  // createTenantSchema uses this in a Zod `.refine`; provide a real digit-length check.
  isValidCpfCnpj: (v: unknown) => {
    const digits = String(v ?? '').replace(/\D/g, '');
    return digits.length === 11 || digits.length === 14;
  },
}));

vi.mock('@leedi/config', () => ({
  env: { ASAAS_API_KEY: 'k', ASAAS_SANDBOX: true },
}));

import { blockTenantAction } from './actions';

const VALID = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  reason: 'Inadimplência confirmada há mais de 30 dias',
};

describe('admin clientes actions — super_admin gate (AC#5 / Task 8)', () => {
  beforeEach(() => {
    getSession.mockReset();
    getWorkspaceAdmin.mockReset();
    blockTenant.mockReset();
    unblockTenant.mockReset();
  });

  it('rejects an unauthenticated caller and never touches the data layer', async () => {
    getSession.mockResolvedValue(null);
    await expect(blockTenantAction(VALID)).rejects.toThrow('Não autenticado');
    expect(blockTenant).not.toHaveBeenCalled();
  });

  it('rejects a non-super-admin caller (e.g. support role) — RLS-bypassing action is gated', async () => {
    getSession.mockResolvedValue({ user: { id: 'u-1' } });
    getWorkspaceAdmin.mockResolvedValue({ role: 'support', workspaceId: 'w-1' });
    await expect(blockTenantAction(VALID)).rejects.toThrow('Sem permissão');
    expect(blockTenant).not.toHaveBeenCalled();
  });

  it('rejects a tenant user who is not a workspace admin at all (null)', async () => {
    getSession.mockResolvedValue({ user: { id: 'u-2' } });
    getWorkspaceAdmin.mockResolvedValue(null);
    await expect(blockTenantAction(VALID)).rejects.toThrow('Sem permissão');
    expect(blockTenant).not.toHaveBeenCalled();
  });

  it('allows a super_admin and forwards the actor + workspace to the use-case', async () => {
    getSession.mockResolvedValue({ user: { id: 'admin-1' } });
    getWorkspaceAdmin.mockResolvedValue({ role: 'super_admin', workspaceId: 'ws-1' });
    blockTenant.mockResolvedValue(undefined);

    const result = await blockTenantAction(VALID);

    expect(result).toEqual({ ok: true });
    expect(blockTenant).toHaveBeenCalledWith({
      tenantId: VALID.tenantId,
      reason: VALID.reason,
      workspaceId: 'ws-1',
      actorUserId: 'admin-1',
    });
  });

  it('enforces the required reason (Zod min 10) even for a super_admin', async () => {
    getSession.mockResolvedValue({ user: { id: 'admin-1' } });
    getWorkspaceAdmin.mockResolvedValue({ role: 'super_admin', workspaceId: 'ws-1' });

    const result = await blockTenantAction({ tenantId: VALID.tenantId, reason: 'curto' });

    expect(result.ok).toBe(false);
    expect(blockTenant).not.toHaveBeenCalled();
  });
});
