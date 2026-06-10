/**
 * Phase 2 E2E namespace — the ONLY rows the harness is authorized to create or
 * delete in the shared Supabase. Everything is keyed by these FIXED UUIDs so the
 * seed is idempotent and the cleanup is strictly scoped (delete by id, never a
 * broad LIKE scan or a global wipe). Names carry the `[E2E]` marker for humans
 * eyeballing the DB; the ids are the contract.
 *
 * Emails use the reserved `.test` TLD (RFC 6761) so they can never collide with a
 * real customer and never deliver mail.
 *
 * NOTE: when Leedi migrates to a dedicated Supabase project before the first real
 * customer, this namespace travels unchanged — it is self-contained.
 */
export const E2E_PASSWORD = 'E2ePassw0rd!';

export const E2E_WORKSPACE = {
  id: 'e2e00000-0000-4000-8000-000000000001',
  name: '[E2E] Harness Workspace',
} as const;

export const E2E_TENANT = {
  id: 'e2e00000-0000-4000-8000-000000000002',
  name: '[E2E] Harness Tenant',
  slug: 'e2e-harness',
} as const;

export const E2E_OWNER = {
  id: 'e2e00000-0000-4000-8000-000000000010',
  email: 'e2e+owner@leedi.test',
  name: '[E2E] Owner',
} as const;

/** Where global-setup writes the authenticated storageState (gitignored). */
export const STORAGE_STATE_OWNER = 'e2e/.auth/owner.json';
