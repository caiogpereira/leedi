import { headers } from 'next/headers';
import { getSession } from '@leedi/auth';
import { listUserTenants } from '@leedi/tenancy';
import { withTenant, schema, eq } from '@leedi/db';
import { ConnectForm } from './connect-form';
import { HealthPanel } from './health-panel';

async function getExistingConnection(tenantId: string) {
  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        phoneNumberId: schema.whatsappConnections.phoneNumberId,
        wabaId: schema.whatsappConnections.wabaId,
        status: schema.whatsappConnections.status,
        displayName: schema.whatsappConnections.displayName,
        qualityRating: schema.whatsappConnections.qualityRating,
        messagingTier: schema.whatsappConnections.messagingTier,
        lastHealthCheckAt: schema.whatsappConnections.lastHealthCheckAt,
      })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenantId))
      .limit(1)
  );
  return rows[0] ?? null;
}

export default async function WhatsAppSettingsPage() {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <p className="text-muted-foreground">Sessão expirada.</p>
      </div>
    );
  }

  // Resolve current tenant + role
  const tenants = await listUserTenants(session.user.id);
  const headerTenantId = requestHeaders.get('x-leedi-tenant-id');
  const currentTenant =
    tenants.find((t) => t.tenantId === headerTenantId) ?? tenants[0];

  if (!currentTenant) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <p className="text-muted-foreground">Nenhum workspace encontrado.</p>
      </div>
    );
  }

  const isOwner = currentTenant.role === 'owner';
  const existing = isOwner ? await getExistingConnection(currentTenant.tenantId) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Conexão WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecte seu número WhatsApp Business via Meta Cloud API.
        </p>
      </div>

      {existing && (
        <HealthPanel
          connection={{
            status: existing.status,
            displayName: existing.displayName,
            qualityRating: existing.qualityRating,
            messagingTier: existing.messagingTier,
            lastHealthCheckAt: existing.lastHealthCheckAt
              ? existing.lastHealthCheckAt.toISOString()
              : null,
          }}
          tenantId={currentTenant.tenantId}
        />
      )}

      {!isOwner ? (
        <p className="text-sm text-muted-foreground">
          Apenas proprietários podem configurar a conexão WhatsApp.
        </p>
      ) : (
        <ConnectForm tenantId={currentTenant.tenantId} existing={existing} />
      )}
    </div>
  );
}
