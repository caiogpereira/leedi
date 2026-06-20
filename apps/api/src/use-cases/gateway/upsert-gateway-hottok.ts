import { randomUUID } from 'node:crypto';
import { withTenant, schema, eq } from '@leedi/db';
import { apiPublicUrl } from '../../utils/api-public-url.js';

export interface UpsertGatewayHottokInput {
  tenantId: string;
  gateway?: 'hotmart' | 'eduzz' | 'kiwify';
  hottok: string;
}

export interface UpsertGatewayHottokResult {
  webhookUrl: string;
}

export async function upsertGatewayHottok(
  input: UpsertGatewayHottokInput
): Promise<UpsertGatewayHottokResult> {
  const { tenantId, hottok } = input;
  const gateway = input.gateway ?? 'hotmart';

  const webhookUrlPath = await withTenant(tenantId, async (tx) => {
    const existing = await tx
      .select({ webhookUrlPath: schema.gatewayIntegrations.webhookUrlPath })
      .from(schema.gatewayIntegrations)
      .where(eq(schema.gatewayIntegrations.tenantId, tenantId))
      .limit(1);

    if (existing[0]) {
      await tx
        .update(schema.gatewayIntegrations)
        .set({ webhookSecret: hottok, ...(input.gateway ? { gateway: input.gateway } : {}), ativo: true })
        .where(eq(schema.gatewayIntegrations.tenantId, tenantId));
      return existing[0].webhookUrlPath;
    }

    const path = randomUUID();
    await tx.insert(schema.gatewayIntegrations).values({
      tenantId,
      gateway,
      webhookSecret: hottok,
      webhookUrlPath: path,
      config: {},
      ativo: true,
    });
    return path;
  });

  return { webhookUrl: `${apiPublicUrl()}/webhooks/hotmart/${webhookUrlPath}` };
}
