'use server';

import { headers } from 'next/headers';
import { getSession } from '@leedi/auth';
import { listUserTenants } from '@leedi/tenancy';
import { withTenant, schema, eq } from '@leedi/db';
import {
  connectWhatsappNumber,
  InvalidCredentialsError,
  checkConnectionHealth,
  MetaCloudProvider,
  type WhatsAppProviderFactory,
  type HealthProviderFactory,
} from '@leedi/connection';

export interface ConnectState {
  status: 'idle' | 'success' | 'error';
  error?: string;
  result?: {
    displayName: string;
    qualityRating: string;
    messagingTier: string;
    phoneNumberId: string;
  };
}

const providerFactory: WhatsAppProviderFactory = (record) => new MetaCloudProvider(record);
const healthFactory: HealthProviderFactory = (record) => new MetaCloudProvider(record);

export async function connectWhatsapp(
  _prev: ConnectState,
  formData: FormData
): Promise<ConnectState> {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session) {
    return { status: 'error', error: 'Sessão expirada. Faça login novamente.' };
  }

  const tenantId = formData.get('tenant_id') as string | null;
  if (!tenantId) {
    return { status: 'error', error: 'Tenant não identificado.' };
  }

  // Re-validate: ensure the caller is actually an owner of this tenant
  const tenants = await listUserTenants(session.user.id);
  const membership = tenants.find((t) => t.tenantId === tenantId);
  if (!membership || membership.role !== 'owner') {
    return { status: 'error', error: 'Apenas proprietários podem configurar a conexão WhatsApp.' };
  }

  const phoneNumberId = (formData.get('phone_number_id') as string | null)?.trim() ?? '';
  const wabaId = (formData.get('waba_id') as string | null)?.trim() ?? '';
  const accessToken = (formData.get('access_token') as string | null)?.trim() ?? '';

  if (!phoneNumberId || !wabaId || !accessToken) {
    return { status: 'error', error: 'Todos os campos são obrigatórios.' };
  }

  try {
    const result = await connectWhatsappNumber(
      { tenantId, phoneNumberId, wabaId, accessToken },
      providerFactory
    );
    return { status: 'success', result };
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return { status: 'error', error: err.message };
    }
    return { status: 'error', error: 'Erro ao conectar. Tente novamente.' };
  }
}

export interface ConnectionHealthData {
  status: string | null;
  displayName: string | null;
  qualityRating: string | null;
  messagingTier: string | null;
  lastHealthCheckAt: string | null;
}

export async function triggerHealthCheck(tenantId: string): Promise<ConnectionHealthData | null> {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session) return null;

  // Validate caller has access to this tenant
  const tenants = await listUserTenants(session.user.id);
  if (!tenants.some((t) => t.tenantId === tenantId)) return null;

  await checkConnectionHealth({ tenantId }, healthFactory);

  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
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

  const row = rows[0];
  if (!row) return null;

  return {
    status: row.status,
    displayName: row.displayName,
    qualityRating: row.qualityRating,
    messagingTier: row.messagingTier,
    lastHealthCheckAt: row.lastHealthCheckAt ? row.lastHealthCheckAt.toISOString() : null,
  };
}
