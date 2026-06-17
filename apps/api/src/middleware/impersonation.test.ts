import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getWorkspaceAdmin, tenantRowsRef } = vi.hoisted(() => ({
  getWorkspaceAdmin: vi.fn(),
  tenantRowsRef: { current: [] as Array<{ workspaceId: string }> },
}));

vi.mock('@leedi/auth', () => ({ getWorkspaceAdmin }));
vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({
        from: () => ({ where: () => ({ limit: () => tenantRowsRef.current }) }),
      }),
    })
  ),
  eq: vi.fn(),
  schema: { tenants: { id: {}, workspaceId: {} } },
}));

import { resolveImpersonation, isMutatingMethod } from './impersonation.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const ADMIN = 'admin-user-1';
const WORKSPACE = '22222222-2222-2222-2222-222222222222';
const FUTURE = Date.now() + 60 * 60 * 1000;

/** Cookie reader backed by a plain map, for the happy-path defaults. */
function cookies(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    leedi_impersonating: TENANT,
    leedi_real_user_id: ADMIN,
    leedi_impersonation_expires: String(FUTURE),
  };
  const merged = { ...base, ...overrides };
  return (name: string) => merged[name];
}

describe('resolveImpersonation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaceAdmin.mockResolvedValue({ role: 'super_admin', workspaceId: WORKSPACE });
    tenantRowsRef.current = [{ workspaceId: WORKSPACE }];
  });

  it('returns context when everything is valid', async () => {
    const result = await resolveImpersonation(cookies(), ADMIN, TENANT);
    expect(result).toEqual({ realUserId: ADMIN, workspaceId: WORKSPACE });
  });

  it('returns null when there is no impersonation cookie', async () => {
    expect(await resolveImpersonation(cookies({ leedi_impersonating: undefined }), ADMIN, TENANT)).toBeNull();
    expect(await resolveImpersonation(cookies({ leedi_real_user_id: undefined }), ADMIN, TENANT)).toBeNull();
  });

  it('returns null when the impersonated tenant differs from the route tenant', async () => {
    const result = await resolveImpersonation(cookies(), ADMIN, 'other-tenant');
    expect(result).toBeNull();
  });

  it('rejects a cookie whose real_user_id is not the session user (forged cookie)', async () => {
    const result = await resolveImpersonation(cookies(), 'someone-else', TENANT);
    expect(result).toBeNull();
  });

  it('rejects an expired impersonation window (server-side re-validation)', async () => {
    const expired = cookies({ leedi_impersonation_expires: String(Date.now() - 1000) });
    expect(await resolveImpersonation(expired, ADMIN, TENANT)).toBeNull();
    const bad = cookies({ leedi_impersonation_expires: 'not-a-number' });
    expect(await resolveImpersonation(bad, ADMIN, TENANT)).toBeNull();
  });

  it('rejects a non-super_admin (support or none)', async () => {
    getWorkspaceAdmin.mockResolvedValueOnce({ role: 'support', workspaceId: WORKSPACE });
    expect(await resolveImpersonation(cookies(), ADMIN, TENANT)).toBeNull();
    getWorkspaceAdmin.mockResolvedValueOnce(null);
    expect(await resolveImpersonation(cookies(), ADMIN, TENANT)).toBeNull();
  });

  it('rejects a tenant that does not exist', async () => {
    tenantRowsRef.current = [];
    expect(await resolveImpersonation(cookies(), ADMIN, TENANT)).toBeNull();
  });

  it('allows a tenant in a different workspace — super_admin is platform-wide (F-30)', async () => {
    // Mirrors startImpersonation: no workspace-scoping. A tenant living in its own
    // self-serve workspace must still authorize, else writes under impersonation
    // would be rejected even though impersonation itself was granted.
    tenantRowsRef.current = [{ workspaceId: 'other-workspace' }];
    const result = await resolveImpersonation(cookies(), ADMIN, TENANT);
    expect(result).toEqual({ realUserId: ADMIN, workspaceId: WORKSPACE });
  });
});

describe('isMutatingMethod', () => {
  it('is true for state-changing methods', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'post', 'patch']) {
      expect(isMutatingMethod(m)).toBe(true);
    }
  });
  it('is false for read methods', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isMutatingMethod(m)).toBe(false);
    }
  });
});
