// Processes Asaas payment webhook events (Story 17.2).
// Called asynchronously by QStash after the webhook endpoint enqueues the payload.

import { withServiceRole, schema, eq, sql } from '@leedi/db';
import { createNotificationStub } from '@leedi/notification';
import { captureException } from '@leedi/observability';

const notification = createNotificationStub();

interface AsaasPaymentPayload {
  event: string;
  payment: {
    id: string;
    value?: number;
    status?: string;
  };
  accessToken?: string;
}

async function getInvoiceByPaymentId(
  paymentId: string
): Promise<{ id: string; tenantId: string; status: string } | null> {
  const rows = await withServiceRole((tx) =>
    tx
      .select({
        id: schema.invoices.id,
        tenantId: schema.invoices.tenantId,
        status: schema.invoices.status,
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.asaasPaymentId, paymentId))
      .limit(1)
  );
  return rows[0] ?? null;
}

async function getTenantStatus(tenantId: string): Promise<string | null> {
  const rows = await withServiceRole((tx) =>
    tx
      .select({ status: schema.tenants.status })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)
  );
  return rows[0]?.status ?? null;
}

async function handlePaymentReceived(paymentId: string): Promise<void> {
  const invoice = await getInvoiceByPaymentId(paymentId);
  if (!invoice) return;

  // Idempotency: skip if already paid
  if (invoice.status === 'pago') return;

  await withServiceRole(async (tx) => {
    await tx
      .update(schema.invoices)
      .set({ status: 'pago', pagoPem: new Date() })
      .where(eq(schema.invoices.id, invoice.id));

    // Update subscription status to ativa
    await tx.execute(
      sql`UPDATE "subscriptions"
          SET "status" = 'ativa', "updated_at" = now()
          WHERE "tenant_id" = ${invoice.tenantId}::uuid`
    );

    // Unblock tenant if it was blocked due to billing
    await tx.execute(
      sql`UPDATE "tenants"
          SET "status" = 'active'
          WHERE "id" = ${invoice.tenantId}::uuid AND "status" = 'blocked'`
    );
  });

  const tenantStatus = await getTenantStatus(invoice.tenantId);
  if (tenantStatus === 'active') {
    await notification.send({
      tipo: 'conta_reativada',
      tenantId: invoice.tenantId,
      userId: 'all_operators',
      titulo: 'Pagamento confirmado. Sua conta está ativa!',
      corpo: 'Seu pagamento foi confirmado e sua conta está ativa.',
    });
  }
}

async function handlePaymentOverdue(paymentId: string): Promise<void> {
  const invoice = await getInvoiceByPaymentId(paymentId);
  if (!invoice) return;

  await withServiceRole(async (tx) => {
    await tx
      .update(schema.invoices)
      .set({ status: 'atrasado' })
      .where(eq(schema.invoices.id, invoice.id));

    await tx.execute(
      sql`UPDATE "subscriptions"
          SET "status" = 'atrasada', "updated_at" = now()
          WHERE "tenant_id" = ${invoice.tenantId}::uuid`
    );
  });
}

async function handlePaymentCancelled(paymentId: string): Promise<void> {
  const invoice = await getInvoiceByPaymentId(paymentId);
  if (!invoice) return;

  await withServiceRole(async (tx) => {
    await tx
      .update(schema.invoices)
      .set({ status: 'cancelado' })
      .where(eq(schema.invoices.id, invoice.id));

    await tx.insert(schema.auditLogs).values({
      workspaceId: invoice.tenantId,
      actorUserId: invoice.tenantId,
      targetTenantId: invoice.tenantId,
      acao: 'invoice_cancelled',
      detalhes: { asaasPaymentId: paymentId },
    });
  });
}

export async function processBillingEvent(payload: unknown): Promise<{ processed: boolean }> {
  const p = payload as AsaasPaymentPayload;
  const paymentId = p?.payment?.id;
  if (!paymentId) return { processed: false };

  try {
    switch (p.event) {
      case 'PAYMENT_RECEIVED':
        await handlePaymentReceived(paymentId);
        break;
      case 'PAYMENT_OVERDUE':
        await handlePaymentOverdue(paymentId);
        break;
      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
        await handlePaymentCancelled(paymentId);
        break;
      default:
        console.log(`[billing] Unknown Asaas event: ${p.event}`);
    }
    return { processed: true };
  } catch (err) {
    captureException(err as Error);
    throw err;
  }
}
