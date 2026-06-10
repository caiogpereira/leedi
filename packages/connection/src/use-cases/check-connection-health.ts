import { withTenant, schema, eq } from '@leedi/db';
import { mapQualityRating, mapMessagingTier } from '../adapters/meta-mappers.js';
import type { WhatsAppProvider } from '../ports/whatsapp-provider.js';

export interface CheckConnectionHealthInput {
  tenantId: string;
}

export type HealthProviderFactory = (record: {
  phoneNumberId: string;
  wabaId: string;
  accessTokenEncrypted: string;
  accessTokenIv: string;
}) => WhatsAppProvider;

/**
 * Checks the Meta API for fresh health data and updates the stored connection row.
 *
 * On Meta success: sets status=conectado + fresh quality/tier/displayName.
 * On auth/token failure: sets status=erro, records timestamp, never logs the token.
 * If no connection exists for the tenant: no-op.
 */
export async function checkConnectionHealth(
  input: CheckConnectionHealthInput,
  providerFactory: HealthProviderFactory
): Promise<void> {
  const { tenantId } = input;

  await withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        phoneNumberId: schema.whatsappConnections.phoneNumberId,
        wabaId: schema.whatsappConnections.wabaId,
        accessTokenEncrypted: schema.whatsappConnections.accessTokenEncrypted,
        accessTokenIv: schema.whatsappConnections.accessTokenIv,
        status: schema.whatsappConnections.status,
      })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenantId))
      .limit(1);

    const connection = rows[0];
    if (!connection) return;

    const now = new Date();

    const provider = providerFactory({
      phoneNumberId: connection.phoneNumberId,
      wabaId: connection.wabaId,
      accessTokenEncrypted: connection.accessTokenEncrypted,
      accessTokenIv: connection.accessTokenIv,
    });

    try {
      const result = await provider.validateConnection();
      await tx
        .update(schema.whatsappConnections)
        .set({
          status: 'conectado',
          displayName: result.displayName,
          // Map Meta's raw values (GREEN/TIER_1K/…) to the DB domain enums;
          // unmappable values (UNKNOWN, TIER_50, …) become null.
          qualityRating: mapQualityRating(result.qualityRating),
          messagingTier: mapMessagingTier(result.messagingTier),
          lastHealthCheckAt: now,
        })
        .where(eq(schema.whatsappConnections.tenantId, tenantId));
    } catch {
      // Token-expired or permission failure: mark as error, do NOT log the token
      await tx
        .update(schema.whatsappConnections)
        .set({
          status: 'erro',
          lastHealthCheckAt: now,
        })
        .where(eq(schema.whatsappConnections.tenantId, tenantId));
    }
  });
}
