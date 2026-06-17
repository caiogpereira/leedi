import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable holders for the mocked cookie store, session, and lookups.
const { state } = vi.hoisted(() => ({
  state: {
    cookies: {} as Record<string, string | undefined>,
    headerTenantId: undefined as string | undefined,
    sessionUserId: undefined as string | undefined,
    wsRole: null as string | null,
    tenantById: null as { id: string; name: string; slug: string } | null,
    memberships: [] as Array<{ tenantId: string; name: string; slug: string; logoUrl: string | null; role: string }>,
  },
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => (name === 'x-leedi-tenant-id' ? state.headerTenantId : undefined) }),
  cookies: async () => ({ get: (name: string) => ({ value: state.cookies[name] }) }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@leedi/auth', () => ({
  getSession: async () => (state.sessionUserId ? { user: { id: state.sessionUserId } } : null),
  getRequiredRoles: vi.fn(),
  getWorkspaceAdminRole: async () => state.wsRole,
}));
vi.mock('@leedi/tenancy', () => ({
  getTenantById: async () => state.tenantById,
  listUserTenants: async () => state.memberships,
}));

import { getCurrentTenantContext } from './tenant-context.js';

const ADMIN = 'super-admin-1';
const TENANT = '006b5e42-0c18-4057-829c-45ed8cde44f6';
const FUTURE = Date.now() + 60 * 60 * 1000;

function validImpersonationCookies() {
  state.cookies = {
    leedi_impersonating: TENANT,
    leedi_real_user_id: ADMIN,
    leedi_impersonation_expires: String(FUTURE),
  };
}

describe('getCurrentTenantContext — impersonation overlay (F-30)', () => {
  beforeEach(() => {
    state.cookies = {};
    state.headerTenantId = undefined;
    state.sessionUserId = ADMIN;
    state.wsRole = 'super_admin';
    state.tenantById = { id: TENANT, name: 'Academia Teste', slug: 'academia-teste' };
    state.memberships = []; // the super-admin has NO memberships — the bug's whole point
  });

  it('synthesizes an owner context for the impersonated tenant (no membership needed)', async () => {
    validImpersonationCookies();
    const ctx = await getCurrentTenantContext();
    expect(ctx).not.toBeNull();
    expect(ctx!.tenant.tenantId).toBe(TENANT);
    expect(ctx!.role).toBe('owner');
    expect(ctx!.userId).toBe(ADMIN);
  });

  it('falls back to null (membership path) when there is no impersonation cookie', async () => {
    // No cookies + no memberships → the pre-fix behaviour for a bare super-admin.
    expect(await getCurrentTenantContext()).toBeNull();
  });

  it('rejects an expired impersonation window', async () => {
    validImpersonationCookies();
    state.cookies.leedi_impersonation_expires = String(Date.now() - 1000);
    expect(await getCurrentTenantContext()).toBeNull();
  });

  it('rejects a cookie whose real_user_id is not the session user (forged)', async () => {
    validImpersonationCookies();
    state.cookies.leedi_real_user_id = 'someone-else';
    expect(await getCurrentTenantContext()).toBeNull();
  });

  it('rejects a non-super_admin actor', async () => {
    validImpersonationCookies();
    state.wsRole = 'support';
    expect(await getCurrentTenantContext()).toBeNull();
  });

  it('rejects when the impersonated tenant does not exist', async () => {
    validImpersonationCookies();
    state.tenantById = null;
    expect(await getCurrentTenantContext()).toBeNull();
  });

  it('still resolves a real membership when not impersonating', async () => {
    state.sessionUserId = 'owner-1';
    state.wsRole = null;
    state.memberships = [{ tenantId: 't-1', name: 'Loja', slug: 'loja', logoUrl: null, role: 'owner' }];
    const ctx = await getCurrentTenantContext();
    expect(ctx!.tenant.tenantId).toBe('t-1');
    expect(ctx!.role).toBe('owner');
  });
});
