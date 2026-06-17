import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { NotificationPreferencesClient } from './notification-preferences-client';

export default async function NotificationsSettingsPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return <NotificationPreferencesClient tenantId={currentTenant.tenantId} />;
}
