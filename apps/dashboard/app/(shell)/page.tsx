import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSession, getWorkspaceAdminRole } from '@leedi/auth';
import { env } from '@leedi/config';
import { getCurrentTenantContext } from '../../lib/tenant-context';
import { DashboardClient } from './components/dashboard-client';

export default async function DashboardPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    // A super-admin has no tenant membership, so (absent an active impersonation,
    // which would make ctx non-null) they land here on a dead dashboard. Their
    // home is the admin app — bounce them there instead of "Nenhum workspace".
    const session = await getSession(await headers());
    if (session?.user?.id) {
      const role = await getWorkspaceAdminRole(session.user.id);
      if (role === 'super_admin') {
        redirect(env.ADMIN_URL);
      }
    }
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return <DashboardClient tenantId={currentTenant.tenantId} />;
}
