import { describe, it, expect } from 'vitest';
import { hasPermission, getRequiredRoles } from './rbac.js';
import type { TenantRole, Permission } from './rbac.js';

describe('hasPermission', () => {
  it('owner has all permissions', () => {
    const allPerms: Permission[] = [
      'billing:read',
      'billing:write',
      'agent:configure',
      'team:manage',
      'leads:write',
      'leads:read',
      'messages:send',
      'dashboard:read',
      'settings:read',
    ];
    for (const perm of allPerms) {
      expect(hasPermission('owner', perm), `owner should have ${perm}`).toBe(true);
    }
  });

  it('admin cannot access billing', () => {
    expect(hasPermission('admin', 'billing:read')).toBe(false);
    expect(hasPermission('admin', 'billing:write')).toBe(false);
  });

  it('admin can configure agent', () => {
    expect(hasPermission('admin', 'agent:configure')).toBe(true);
  });

  it('operator cannot configure agent', () => {
    expect(hasPermission('operator', 'agent:configure')).toBe(false);
  });

  it('operator cannot manage team', () => {
    expect(hasPermission('operator', 'team:manage')).toBe(false);
  });

  it('operator can read leads', () => {
    expect(hasPermission('operator', 'leads:read')).toBe(true);
  });

  it('viewer has only read permissions', () => {
    expect(hasPermission('viewer', 'dashboard:read')).toBe(true);
    expect(hasPermission('viewer', 'leads:read')).toBe(true);
    expect(hasPermission('viewer', 'leads:write')).toBe(false);
    expect(hasPermission('viewer', 'messages:send')).toBe(false);
    expect(hasPermission('viewer', 'agent:configure')).toBe(false);
    expect(hasPermission('viewer', 'billing:read')).toBe(false);
  });
});

describe('getRequiredRoles', () => {
  it('billing requires owner only', () => {
    const roles = getRequiredRoles('/settings/billing');
    expect(roles).toContain('owner');
    expect(roles?.length).toBe(1);
  });

  it('billing sub-routes inherit the owner-only requirement (prefix match)', () => {
    const roles = getRequiredRoles('/settings/billing/details');
    expect(roles).toContain('owner');
    expect(roles?.length).toBe(1);
  });

  it('agent config requires owner or admin', () => {
    const roles = getRequiredRoles('/settings/agent');
    expect(roles).toContain('owner');
    expect(roles).toContain('admin');
    expect(roles?.includes('operator')).toBe(false);
  });

  it('unrestricted route returns null', () => {
    expect(getRequiredRoles('/dashboard')).toBeNull();
  });
});

describe('ROLE_PERMISSIONS matrix — no role has permissions it should not', () => {
  const restrictedPerms: Array<{ role: TenantRole; forbiddenPerms: Permission[] }> = [
    { role: 'admin', forbiddenPerms: ['billing:read', 'billing:write'] },
    {
      role: 'operator',
      forbiddenPerms: ['billing:read', 'billing:write', 'agent:configure', 'team:manage'],
    },
    {
      role: 'viewer',
      forbiddenPerms: [
        'billing:read',
        'billing:write',
        'agent:configure',
        'team:manage',
        'leads:write',
        'messages:send',
      ],
    },
  ];

  for (const { role, forbiddenPerms } of restrictedPerms) {
    for (const perm of forbiddenPerms) {
      it(`${role} does NOT have ${perm}`, () => {
        expect(hasPermission(role, perm)).toBe(false);
      });
    }
  }
});
