import { withTenant, schema } from '@leedi/db';
import { encryptToken } from '../adapters/crypto.js';
import { mapQualityRating, mapMessagingTier } from '../adapters/meta-mappers.js';
import type { WhatsAppProvider } from '../ports/whatsapp-provider.js';

export interface ConnectWhatsappInput {
  tenantId: string;
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
}

export interface ConnectWhatsappResult {
  status: 'conectado';
  displayName: string;
  qualityRating: string;
  messagingTier: string;
  phoneNumberId: string;
}

export class InvalidCredentialsError extends Error {
  override readonly name = 'InvalidCredentialsError';
  constructor() {
    super('Credenciais invalidas. Verifique o phone_number_id, waba_id e o token de acesso.');
  }
}

export type WhatsAppProviderFactory = (record: {
  phoneNumberId: string;
  wabaId: string;
  accessTokenEncrypted: string;
  accessTokenIv: string;
}) => WhatsAppProvider;

/**
 * Connects (or re-connects) a WhatsApp number for a tenant.
 *
 * Invariant: validates credentials with Meta BEFORE any DB write.
 * A failed validation leaves the DB untouched.
 */
export async function connectWhatsappNumber(
  input: ConnectWhatsappInput,
  providerFactory: WhatsAppProviderFactory
): Promise<ConnectWhatsappResult> {
  const { tenantId, phoneNumberId, wabaId, accessToken } = input;

  // Encrypt in-memory (pure computation — no DB write yet)
  const { ciphertext, iv } = encryptToken(accessToken);

  // Validate FIRST with ephemeral provider — fails loudly on bad credentials
  const provider = providerFactory({
    phoneNumberId,
    wabaId,
    accessTokenEncrypted: ciphertext,
    accessTokenIv: iv,
  });

  let validated: { displayName: string; qualityRating: string; messagingTier: string };
  try {
    validated = await provider.validateConnection();
  } catch {
    throw new InvalidCredentialsError();
  }

  // Validation succeeded — map Meta's raw values to the DB domain enums (GREEN →
  // verde, TIER_1K → 1k, UNKNOWN/unexpected → null) before persisting. Writing
  // the raw Meta strings would throw `invalid input value for enum`.
  const qualityRating = mapQualityRating(validated.qualityRating);
  const messagingTier = mapMessagingTier(validated.messagingTier);

  // Validation succeeded — now persist the encrypted credentials
  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(schema.whatsappConnections)
      .values({
        tenantId,
        phoneNumberId,
        wabaId,
        accessTokenEncrypted: ciphertext,
        accessTokenIv: iv,
        status: 'conectado',
        displayName: validated.displayName,
        qualityRating,
        messagingTier,
        lastHealthCheckAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.whatsappConnections.tenantId,
        set: {
          phoneNumberId,
          wabaId,
          accessTokenEncrypted: ciphertext,
          accessTokenIv: iv,
          status: 'conectado',
          displayName: validated.displayName,
          qualityRating: validated.qualityRating as 'verde' | 'amarelo' | 'vermelho' | null,
          messagingTier: validated.messagingTier as '1k' | '10k' | '100k' | 'unlimited' | null,
          lastHealthCheckAt: new Date(),
        },
      });
  });

  return {
    status: 'conectado',
    displayName: validated.displayName,
    qualityRating: validated.qualityRating,
    messagingTier: validated.messagingTier,
    phoneNumberId,
  };
}
