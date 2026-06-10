/**
 * Phase 2 E2E namespace for the ADMIN app — the only rows the harness creates or
 * deletes in the shared Supabase. Keyed by FIXED UUIDs for idempotent seeding and
 * strictly-scoped cleanup (delete by id, never a broad scan or global wipe).
 *
 * Isolated from the dashboard namespace on purpose: its own workspace + user, so
 * the two apps' global-setups never contend over the same rows.
 *
 * Emails use the reserved `.test` TLD (RFC 6761) so they never collide with a real
 * customer and never deliver mail.
 */
export const E2E_PASSWORD = 'E2ePassw0rd!';

export const E2E_ADMIN_WORKSPACE = {
  id: 'e2e00000-0000-4000-8000-000000000101',
  name: '[E2E] Admin Workspace',
} as const;

export const E2E_SUPER_ADMIN = {
  id: 'e2e00000-0000-4000-8000-000000000110',
  email: 'e2e+superadmin@leedi.test',
  name: '[E2E] Super Admin',
} as const;

/** Where global-setup writes the authenticated storageState (gitignored). */
export const STORAGE_STATE_ADMIN = 'e2e/.auth/super-admin.json';
