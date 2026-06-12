// Processes Asaas payment webhook events (Story 17.2).
// Called asynchronously by QStash after the webhook endpoint enqueues the payload.
//
// Asaas charge lifecycle (https://docs.asaas.com/docs/webhook-para-cobrancas):
//   PAYMENT_CREATED → (PAYMENT_OVERDUE) → (PAYMENT_CONFIRMED) → PAYMENT_RECEIVED
// We materialise an `invoices` row on PAYMENT_CREATED and key every later event by
// the Asaas payment id. Idempotency is enforced by the UNIQUE index on
// invoices.asaas_payment_id (ON CONFLICT DO NOTHING) — not by the Redis dedup key,
// which is only a best-effort optimization at the webhook edge.

import { withServiceRole, schema, eq, sql } from '@leedi/db';
import { createNotificationStub } from '@leedi/notification';
import { captureException } from '@leedi/observability';

const notification = createNotificationStub();

interface AsaasPayment {
  id: string;
  value?: number;
  status?: string;
  dueDate?: string;
  subscription?: string;
  customer?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  transactionReceiptUrl?: string;
}

interface AsaasPaymentPayload {
  event: string;
  payment: AsaasPayment;
  accessToken?: string;
}

interface InvoiceRow {
  id: string;
  tenantId: string;
  status: string;
}

/** Resolve our internal subscription + tenant from the Asaas ids on the payment. */
async function resolveSubscription(
  payment: AsaasPayment
): Promise<{ subscriptionId: string; tenantId: string } | null> {
  if (payment.subscription) {
    const bySub = await withServiceRole((tx) =>
      tx
        .select({ id: schema.subscriptions.id, tenantId: schema.subscriptions.tenantId })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.asaasSubscriptionId, payment.subscription as string))
        .limit(1)
    );
    if (bySub[0]) return { subscriptionId: bySub[0].id, tenantId: bySub[0].tenantId };
  }

  if (payment.customer) {
    const byCustomer = await withServiceRole((tx) =>
      tx
        .select({ id: schema.subscriptions.id, tenantId: schema.subscriptions.tenantId })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.asaasCustomerId, payment.customer as string))
        .limit(1)
    );
    if (byCustomer[0]) return { subscriptionId: byCustomer[0].id, tenantId: byCustomer[0].tenantId };
  }

  return null;
}

async function getInvoiceByPaymentId(paymentId: string): Promise<InvoiceRow | null> {
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

/**
 * Insert the invoice row for an Asaas payment if it does not exist yet. Idempotent
 * via ON CONFLICT on the partial UNIQUE index (asaas_payment_id). Returns the
 * (possibly pre-existing) invoice, or null when the subscription cannot be resolved.
 */
async function ensureInvoice(
  payment: AsaasPayment,
  initialStatus: 'pendente' | 'atrasado'
): Promise<InvoiceRow | null> {
  const existing = await getInvoiceByPaymentId(payment.id);
  if (existing) return existing;

  const resolved = await resolveSubscription(payment);
  if (!resolved) {
    // Can't link the payment to a known subscription — log and skip rather than
    // crash the QStash worker (Asaas warns: never throw on unexpected payloads).
    console.warn(
      `[billing] payment ${payment.id} could not be linked to a subscription (sub=${payment.subscription ?? '-'}, customer=${payment.customer ?? '-'})`
    );
    return null;
  }

  const valor = typeof payment.value === 'number' ? String(payment.value) : null;
  const receiptUrl = payment.invoiceUrl ?? payment.bankSlipUrl ?? null;
  const dueDate = payment.dueDate ?? null;

  await withServiceRole((tx) =>
    tx.execute(
      sql`INSERT INTO "invoices"
            ("tenant_id", "subscription_id", "asaas_payment_id", "valor", "vencimento", "status", "receipt_url")
          VALUES (
            ${resolved.tenantId}::uuid,
            ${resolved.subscriptionId}::uuid,
            ${payment.id},
            ${valor}::numeric,
            ${dueDate}::date,
            ${initialStatus}::invoice_status_enum,
            ${receiptUrl}
          )
          ON CONFLICT ("asaas_payment_id") WHERE "asaas_payment_id" IS NOT NULL DO NOTHING`
    )
  );

  return getInvoiceByPaymentId(payment.id);
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

async function handlePaymentCreated(payment: AsaasPayment): Promise<void> {
  // Just materialise the invoice (pending). Blocking/unblocking happens elsewhere.
  await ensureInvoice(payment, 'pendente');
}

async function handlePaymentReceived(payment: AsaasPayment): Promise<void> {
  // Upsert-if-missing so a lost PAYMENT_CREATED never loses the paid state.
  const invoice = await ensureInvoice(payment, 'pendente');
  if (!invoice) return;

  // Idempotency: skip if already paid.
  if (invoice.status === 'pago') return;

  const receiptUrl = payment.transactionReceiptUrl ?? payment.invoiceUrl ?? null;

  // Capture whether the tenant was blocked BEFORE the update so the
  // "conta_reativada" notification only fires on a real blocked → active
  // transition (not on every routine renewal payment).
  const wasBlocked = (await getTenantStatus(invoice.tenantId)) === 'blocked';

  await withServiceRole(async (tx) => {
    await tx.execute(
      sql`UPDATE "invoices"
          SET "status" = 'pago',
              "pago_em" = now(),
              "receipt_url" = COALESCE(${receiptUrl}, "receipt_url")
          WHERE "id" = ${invoice.id}::uuid`
    );

    // Reactivate the subscription.
    await tx.execute(
      sql`UPDATE "subscriptions"
          SET "status" = 'ativa', "updated_at" = now()
          WHERE "tenant_id" = ${invoice.tenantId}::uuid`
    );

    // Unblock tenant only if it was blocked due to billing.
    await tx.execute(
      sql`UPDATE "tenants"
          SET "status" = 'active'
          WHERE "id" = ${invoice.tenantId}::uuid AND "status" = 'blocked'`
    );
  });

  if (wasBlocked) {
    await notification.send({
      tipo: 'conta_reativada',
      tenantId: invoice.tenantId,
      userId: 'all_operators',
      titulo: 'Pagamento confirmado. Sua conta está ativa!',
      corpo: 'Seu pagamento foi confirmado e sua conta está ativa.',
    });
  }
}

async function handlePaymentOverdue(payment: AsaasPayment): Promise<void> {
  const invoice = await ensureInvoice(payment, 'atrasado');
  if (!invoice) return;
  if (invoice.status === 'cancelado' || invoice.status === 'pago') return;

  await withServiceRole(async (tx) => {
    await tx.execute(
      sql`UPDATE "invoices" SET "status" = 'atrasado' WHERE "id" = ${invoice.id}::uuid`
    );

    // Mark subscription late — the daily billing-check (not this event) blocks the tenant.
    await tx.execute(
      sql`UPDATE "subscriptions"
          SET "status" = 'atrasada', "updated_at" = now()
          WHERE "tenant_id" = ${invoice.tenantId}::uuid`
    );
  });
}

async function handlePaymentCancelled(payment: AsaasPayment): Promise<void> {
  const invoice = await getInvoiceByPaymentId(payment.id);
  if (!invoice) return;
  if (invoice.status === 'cancelado') return;

  await withServiceRole(async (tx) => {
    await tx.execute(
      sql`UPDATE "invoices" SET "status" = 'cancelado' WHERE "id" = ${invoice.id}::uuid`
    );

    await tx.insert(schema.auditLogs).values({
      workspaceId: invoice.tenantId,
      actorUserId: invoice.tenantId,
      targetTenantId: invoice.tenantId,
      acao: 'invoice_cancelled',
      detalhes: { asaasPaymentId: payment.id },
    });
  });
}

export async function processBillingEvent(payload: unknown): Promise<{ processed: boolean }> {
  const p = payload as AsaasPaymentPayload;
  const payment = p?.payment;
  if (!payment?.id) return { processed: false };

  try {
    switch (p.event) {
      case 'PAYMENT_CREATED':
        await handlePaymentCreated(payment);
        break;
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        // CONFIRMED = funds committed but not yet settled; treat as paid for the
        // purpose of reactivating the account (boleto/pix go straight to RECEIVED).
        await handlePaymentReceived(payment);
        break;
      case 'PAYMENT_OVERDUE':
        await handlePaymentOverdue(payment);
        break;
      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
        await handlePaymentCancelled(payment);
        break;
      default:
        // Asaas warns: do not throw on unrecognised events/fields.
        console.log(`[billing] Unhandled Asaas event: ${p.event}`);
    }
    return { processed: true };
  } catch (err) {
    captureException(err as Error);
    throw err;
  }
}
