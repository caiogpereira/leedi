import { UsageSettingsClient } from './usage-settings-client';
import { requireTenantRouteAccess } from '../../../../lib/tenant-context';

export default async function UsageSettingsPage() {
  // RBAC enforcement (Story 2.5/2.7): /settings/* is owner/admin only. The role is
  // resolved from membership data here (the Edge middleware can't); operator/viewer
  // are redirected to /403.
  const ctx = await requireTenantRouteAccess('/settings/uso');

  return <UsageSettingsClient tenantId={ctx.tenant.tenantId} />;
}
