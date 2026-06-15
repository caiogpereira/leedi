/**
 * One-off seeder for usability-testing sessions.
 * Provisions the [E2E] owner (tenant active, onboarding done) and the [E2E]
 * super_admin, reusing the exact same idempotent seed functions the Playwright
 * harness uses. Safe to run repeatedly (onConflictDoNothing throughout).
 *
 * Run: pnpm tsx scripts/seed-test-accounts.ts
 */
import { seedOwner } from '../apps/dashboard/e2e/seed/seed.js';
import { seedSuperAdmin } from '../apps/admin/e2e/seed/seed.js';

async function main() {
  await seedOwner();
  console.log('[seed] owner ready: e2e+owner@leedi.test');
  await seedSuperAdmin();
  console.log('[seed] super_admin ready: e2e+superadmin@leedi.test');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
