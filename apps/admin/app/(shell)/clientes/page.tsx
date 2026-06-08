import { listAllTenantsDetailed } from '@leedi/tenancy';
import { env } from '@leedi/config';
import { ClientesClient } from './ClientesClient';

// Render on request so a refresh reflects the latest lifecycle/billing state after
// an action (block/unblock/create) or an Asaas webhook. The (shell) layout already
// forces dynamic via headers(); this keeps the intent explicit and avoids a
// build-time DB call.
export const dynamic = 'force-dynamic';

/**
 * Super-admin Clientes page (Story 20.2, FR128–FR138).
 *
 * Auth: the workspace-admin guard lives in `(shell)/layout.tsx`
 * (getWorkspaceAdminRole === 'super_admin'); non-admins never reach this page and
 * the server actions re-verify super_admin independently (they bypass RLS).
 *
 * Server-component data fetch + client component for search/actions — matches the
 * Financeiro page (Story 20.1) override of the story's assumed Hono REST design.
 */
export default async function ClientesPage() {
  const tenants = await listAllTenantsDetailed();
  return <ClientesClient tenants={tenants} dashboardUrl={env.DASHBOARD_URL} />;
}
