import { randomUUID } from 'node:crypto';
import { withTenant, schema } from '@leedi/db';
import { apiPublicUrl } from '../../utils/api-public-url.js';

export interface CreateGatewayIntegrationInput {
  tenantId: string;
  gateway: 'hotmart' | 'eduzz' | 'kiwify';
}

export interface CreateGatewayIntegrationResult {
  id: string;
  gateway: string;
  webhookUrlPath: string;
  webhookUrl: string;
}

export async function createGatewayIntegration(
  input: CreateGatewayIntegrationInput
): Promise<CreateGatewayIntegrationResult> {
  const { tenantId, gateway } = input;
  const webhookUrlPath = randomUUID();
  const webhookSecret = randomUUID();

  const [integration] = await withTenant(tenantId, async (tx) =>
    tx
      .insert(schema.gatewayIntegrations)
      .values({
        tenantId,
        gateway,
        webhookSecret,
        webhookUrlPath,
        config: {},
        ativo: true,
      })
      .returning({
        id: schema.gatewayIntegrations.id,
        gateway: schema.gatewayIntegrations.gateway,
        webhookUrlPath: schema.gatewayIntegrations.webhookUrlPath,
      })
  );

  if (!integration) {
    throw new Error('Failed to create gateway integration');
  }

  return {
    id: integration.id,
    gateway: integration.gateway,
    webhookUrlPath: integration.webhookUrlPath,
    webhookUrl: `${apiPublicUrl()}/webhooks/hotmart/${integration.webhookUrlPath}`,
  };
}
