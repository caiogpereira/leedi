import { describe, it, expect, vi, beforeEach } from 'vitest';

const whereSpy = vi.fn().mockResolvedValue(undefined);
const setSpy = vi.fn(() => ({ where: whereSpy }));
const updateSpy = vi.fn(() => ({ set: setSpy }));

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn((fn: (tx: unknown) => unknown) => fn({ update: updateSpy })),
  schema: { tenants: { id: 'id', status: 'status' } },
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
}));

const writeAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('./write-audit-log.js', () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

import { blockTenant, unblockTenant } from './set-tenant-block.js';

const base = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  actorUserId: '33333333-3333-4333-8333-333333333333',
  reason: 'Pagamento não identificado há 30 dias',
};

describe('blockTenant', () => {
  beforeEach(() => {
    setSpy.mockClear();
    updateSpy.mockClear();
    writeAuditLog.mockClear();
  });

  it("sets tenants.status to the English 'blocked' enum value", async () => {
    await blockTenant(base);
    expect(setSpy).toHaveBeenCalledWith({ status: 'blocked' });
  });

  it("writes a 'manual_block' audit entry with the reason and blocked_by", async () => {
    await blockTenant(base);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith({
      workspaceId: base.workspaceId,
      actorUserId: base.actorUserId,
      targetTenantId: base.tenantId,
      acao: 'manual_block',
      detalhes: { reason: base.reason, blocked_by: base.actorUserId },
    });
  });
});

describe('unblockTenant', () => {
  beforeEach(() => {
    setSpy.mockClear();
    updateSpy.mockClear();
    writeAuditLog.mockClear();
  });

  it("sets tenants.status back to 'active'", async () => {
    await unblockTenant(base);
    expect(setSpy).toHaveBeenCalledWith({ status: 'active' });
  });

  it("writes a 'manual_unblock' audit entry with the reason and unblocked_by", async () => {
    await unblockTenant(base);
    expect(writeAuditLog).toHaveBeenCalledWith({
      workspaceId: base.workspaceId,
      actorUserId: base.actorUserId,
      targetTenantId: base.tenantId,
      acao: 'manual_unblock',
      detalhes: { reason: base.reason, unblocked_by: base.actorUserId },
    });
  });
});
