import { withTenant, schema, eq } from '@leedi/db';
import { ConnectForm } from './connect-form';
import { HealthPanel } from './health-panel';
import { requireTenantRouteAccess } from '../../../../lib/tenant-context';

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
  // RBAC enforcement (Story 2.5/2.7): /settings/whatsapp is owner-only. A
  // non-owner is redirected to /403 before any content renders; the route role
  // is resolved from membership data here (the Edge middleware can't).
  const ctx = await requireTenantRouteAccess('/settings/whatsapp');
  const currentTenant = ctx.tenant;

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
